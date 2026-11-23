---
title: 'wordpress adapter — Cron'
---

# Schedule recurring events and background jobs

**Goal:** run a service method on a schedule through WP-Cron, remove the schedule when the plugin is deactivated, and queue one-off background jobs.

**Prerequisites:**

- A plugin with a kernel and a container ([Getting started](../../tutorials/wordpress/getting-started)), with a `WpComponentContext` bound as `HostComponentContextInterface`.
- A `TranslatorInterface` binding for the interval labels. This guide uses the framework's `FallbackTranslator`, which returns the English labels unchanged.

Two classes cover two needs:

| Need | Class | Mechanism |
| --- | --- | --- |
| A recurring event | `Cron\CronRegistrar` with `Cron\Enum\CronInterval` | `wp_schedule_event()` and the `cron_schedules` filter |
| A one-off job, out of the request | `Cron\JobScheduler` and `Cron\Contract\JobSchedulerInterface` | Action Scheduler when present, else `wp_schedule_single_event()` |

## 1. Write the job

The job is an ordinary service:

```php
<?php

declare(strict_types=1);

namespace Acme\Notes\Cron;

use Acme\Notes\Domain\NoteStore;

final class DigestJob
{
    public function __construct(
        private readonly NoteStore $notes,
    ) {}

    public function run(): void
    {
        update_option('acme_notes_last_digest', $this->notes->countOpen(), false);
    }
}
```

## 2. Register the event

Bind the registrar, the job and the lifecycle in `buildContainer()`:

```php
use Acme\Notes\Cron\DigestJob;
use Middag\Framework\Translation\Contract\TranslatorInterface;
use Middag\Framework\Translation\FallbackTranslator;
use Middag\WordPress\Cron\CronRegistrar;
use Middag\WordPress\Runtime\PluginLifecycle;
use Symfony\Component\DependencyInjection\Reference;

$builder->register(TranslatorInterface::class, FallbackTranslator::class)->setPublic(true);
$builder->register(CronRegistrar::class)->setAutowired(true)->setPublic(true);
$builder->register(DigestJob::class)->setAutowired(true)->setPublic(true);
$builder->register(PluginLifecycle::class)
    ->setArguments([ACME_NOTES_FILE, new Reference(CronRegistrar::class)])
    ->setPublic(true);
```

`ACME_NOTES_FILE` is `__FILE__` of your main plugin file. Then add the event in your kernel's `onBoot()`:

```php
use Acme\Notes\Cron\DigestJob;
use Middag\WordPress\Cron\CronHandler;
use Middag\WordPress\Cron\CronRegistrar;
use Middag\WordPress\Cron\Enum\CronInterval;

protected function onBoot(ContainerInterface $container): void
{
    $container->get(CronRegistrar::class)->addEvent(
        'acme_notes_digest',
        CronInterval::DailyMorning,
        CronHandler::dispatch($container, DigestJob::class, 'run'),
    );
}
```

- `addEvent($hook, $interval, $callback)` only collects the event. The kernel calls the registrar's `register()` on `init` at priority 5. `register()` adds your callback to the action `$hook`, adds the adapter's intervals on `cron_schedules`, and schedules the event when it is not scheduled yet.
- `CronHandler::dispatch()` returns a closure that resolves `DigestJob` from the container when the event fires and calls `run()`. If the service is missing or `run()` throws, it logs the error and returns, so one failing job does not stop WP-Cron.
- The interval is a closed enum: `EveryMinute`, `FiveMinutes`, `FifteenMinutes`, `ThirtyMinutes`, `Hourly`, `TwiceDaily` and `DailyMorning` (every 24 hours, first run at the next 06:00). Each one is registered under a key with your component name, for example `acme-notes_daily_morning`, so two plugins keep separate schedules.

Check the result with WP-CLI:

```bash
wp cron event list --fields=hook,next_run_gmt,recurrence | grep acme_notes
wp cron event run acme_notes_digest
```

## 3. Unschedule on deactivation

`PluginLifecycle` runs your activation callbacks, and on deactivation runs your callbacks and then `CronRegistrar::unregister()`, which removes the next run of every event you added. Hook it from the main plugin file:

```php
use Acme\Notes\AcmeNotesKernel;
use Middag\WordPress\Runtime\PluginLifecycle;

add_action('plugins_loaded', [AcmeNotesKernel::class, 'init']);

// On the activation request plugins_loaded has already fired, so get() boots the kernel here.
register_activation_hook(__FILE__, static function (): void {
    AcmeNotesKernel::get(PluginLifecycle::class)->activate();
});
register_deactivation_hook(__FILE__, static function (): void {
    AcmeNotesKernel::get(PluginLifecycle::class)->deactivate();
});
```

Add activation work in `onBoot()`, for example the schema install from [Persistence](./persistence#_2-create-the-table-on-activation):

```php
$lifecycle = $container->get(PluginLifecycle::class);
$lifecycle->onActivate(static fn () => $container->get(NoteSchema::class)->install());
```

WordPress activates a plugin by loading its main file after `plugins_loaded` has run, so your `plugins_loaded` callback never fires on that request. That is why the activation callback reaches the lifecycle through `AcmeNotesKernel::get()`, which boots the kernel, and why `PluginLifecycle::register()` is not called from `onBoot()`.

## 4. Queue a one-off job

`JobScheduler::make()` returns the best driver available when you call it:

```php
use Middag\WordPress\Cron\JobScheduler;

$jobs = JobScheduler::make('acme-notes');   // the group name, used by Action Scheduler

// Fires the action acme_notes_reindex with 42, outside the current request.
$jobs->enqueue('acme_notes_reindex', [42]);

add_action('acme_notes_reindex', static function (int $noteId): void {
    // ...
});
```

| Driver | Chosen when | Behaviour |
| --- | --- | --- |
| `ActionSchedulerDriver` | `as_enqueue_async_action()` exists (Action Scheduler, bundled with WooCommerce or installed alone) | persistent queue, retries, admin screen, WP-CLI runner |
| `WpCronDriver` | otherwise | `wp_schedule_single_event()` for now; no retry |

`enqueue()` returns `false` when the job was not queued. Type-hint `JobSchedulerInterface` in the services that queue jobs.

## 5. Use a schedule of your own

`CronRegistrar` only takes `CronInterval` cases. For another recurrence, add the schedule with a `CronScheduleDefinition` (see [Settings and definitions](./settings#_4-register-post-types-taxonomies-shortcodes-and-schedules)) and schedule the event with the WordPress functions:

```php
if (!wp_next_scheduled('acme_notes_weekly')) {
    wp_schedule_event(time(), 'acme_weekly', 'acme_notes_weekly');
}
```

Unschedule such an event yourself in an `onDeactivate()` callback, with `wp_clear_scheduled_hook('acme_notes_weekly')`.

## What can go wrong

- **The event is never scheduled.** The registrar is not in the container, so the kernel skips it, or `addEvent()` ran after `init` priority 5. Add events in `onBoot()`.
- **Changing the interval has no effect.** `register()` schedules an event only when none is scheduled for the hook. Clear the old schedule first (`wp cron event delete acme_notes_digest`, or deactivate and reactivate the plugin).
- **The daily run is not at 06:00 local time.** `DailyMorning` computes 06:00 in PHP's default timezone, which WordPress sets to UTC.
- **Nothing runs on a quiet site.** WP-Cron runs on page loads. On a site with little traffic, or with `DISABLE_WP_CRON`, trigger it from the system cron (`wp cron event run --due-now`).
- **An error in the job leaves no trace.** `CronHandler` logs through the PSR-3 logger it finds in your container (a `Psr\Log\LoggerInterface` binding, then the framework's logger factory), else through `error_log()`. Check the PHP error log.
- **`enqueue()` returns `false` with `WpCronDriver`.** WordPress refuses a single event with the same hook and arguments within ten minutes of an identical one.
- **Action Scheduler is not detected.** Call `JobScheduler::make()` after `plugins_loaded`, when other plugins have loaded it.

## Reference

- [Cron and async jobs](../../reference/adapters/wordpress/#cron-and-async-jobs): both concerns and their drivers.
- [Configuration & Identity](../../reference/adapters/wordpress/configuration#component-identity): the component name in the schedule keys.
- [Dispatch, Handlers & Scheduling](../../reference/command-bus): the framework's command bus.
