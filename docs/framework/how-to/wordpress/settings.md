---
title: 'wordpress adapter — Definitions and Options'
---

# Register definitions and read options

**Goal:** register post types, taxonomies, shortcodes and cron schedules from value objects, and read your plugin's options.

**Prerequisites:**

- A plugin with a kernel and a container ([Getting started](../../tutorials/wordpress/getting-started)).

::: info Settings pages are not covered yet
The adapter's declarative settings page builder (`Settings\SettingsPageRegistrar`, with `Tab`, `Section` and `Field`) cannot yet be wired without a class outside the stable API, so this guide does not cover it.
:::

## 1. Register post types, taxonomies, shortcodes and schedules

The definition value objects describe what WordPress registers, and `DefinitionRegistrar` registers them. Call it on `init`:

```php
use Middag\WordPress\Definition\CronScheduleDefinition;
use Middag\WordPress\Definition\DefinitionRegistrar;
use Middag\WordPress\Definition\PostTypeDefinition;
use Middag\WordPress\Definition\ShortcodeDefinition;
use Middag\WordPress\Definition\TaxonomyDefinition;

add_action('init', static function (): void {
    (new DefinitionRegistrar())->register([
        new PostTypeDefinition('acme_note', 'Note', 'Notes', ['supports' => ['title', 'custom-fields']]),
        new TaxonomyDefinition('acme_label', ['acme_note'], 'Label', 'Labels'),
        new ShortcodeDefinition('acme_note_count', static fn (): string => (string) wp_count_posts('acme_note')->publish),
        new CronScheduleDefinition('acme_weekly', 7 * DAY_IN_SECONDS, 'Once a week'),
    ]);
});
```

- `PostTypeDefinition($slug, $singular, $plural, $args)` builds the labels from the two names and defaults to a private post type with an admin screen (`public => false`, `show_ui => true`, `supports => ['title']`). Keys in `$args` replace the defaults.
- `TaxonomyDefinition($slug, $objectTypes, $singular, $plural, $args)` defaults to a private, flat taxonomy with an admin screen.
- `ShortcodeDefinition($tag, $render)` registers the shortcode; `$render` must be callable.
- `CronScheduleDefinition($slug, $intervalSeconds, $display)` adds a schedule on `cron_schedules`. Use it with `wp_schedule_event()`, as shown in [Cron](./cron#_5-use-a-schedule-of-your-own).

## 2. Read option values

Each option is a plain row in `wp_options`:

```php
use Middag\WordPress\Support\OptionSupport;

$perPage = (int) OptionSupport::get('acme_notes_per_page', 20);
```

Pass the default every time you read: `OptionSupport::get()` hands its own default to `get_option()`, so a default stored elsewhere is not used when you leave it out.

## What can go wrong

- **`Unsupported definition: ...`** or **`Shortcode "..." render must be callable.`** `DefinitionRegistrar` received an object it does not know, or a shortcode whose renderer is not callable.
- **The post type or the schedule does not exist yet.** The definitions exist only after the `init` callback ran. Code that uses them earlier, or on `init` at a priority below 10, does not find them.

## Reference

- [Support layer](../../reference/adapters/wordpress/#support-layer): `OptionSupport` and `PostTypeSupport`.
