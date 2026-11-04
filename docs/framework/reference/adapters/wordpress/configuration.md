---
title: 'wordpress adapter — Configuration & Identity'
---

# Configuration & Identity

Reference for how a WordPress plugin gives `middag-io/wordpress` its identity and configuration. Backs [WP-002](https://github.com/middag-io/middag-php-wordpress/blob/main/docs/decisions/WP-002-config-resolver-neutral-default-prefix.md) (injected per-plugin identity, neutral defaults, no mutable static state), which applies [FW-015](https://github.com/middag-io/middag-php-framework/blob/main/docs/decisions/FW-015-hosts-are-adapters-of-framework-ports.md) and [FW-016](https://github.com/middag-io/middag-php-framework/blob/main/docs/decisions/FW-016-statics-as-a-bounded-exception.md) to WordPress.

Verified against `middag-php-wordpress/main@bc1bc59` on 2026-11-04.

## Why it is shaped this way

Several WordPress plugins built on the adapter can run in one PHP process and one request. Anything process-wide — a static property, a single identity slot, a shared prefix — is shared by all of them, and the last writer wins. So the adapter keeps every piece of per-plugin state on instances that each plugin builds in its own container.

The Moodle adapter is the deliberate opposite: Moodle loads one component per request, and `lib.php` callbacks, hooks and scheduled tasks cannot receive injected services, so its kernel keeps a static singleton. See [Bridge Contracts](../../bridge-contracts) and [Architecture §9](../../../explanation/architecture) for the framework's bounded static slots.

## The consumer kernel

`Runtime/Kernel` (`@api`, abstract) implements the framework `KernelInterface` and holds no static state. The consumer subclasses it under its own namespace and provides two things:

```php
final class AcmeKernel extends Kernel
{
    private static ?self $kernel = null;

    protected static function kernel(): static
    {
        return self::$kernel ??= new static();
    }

    protected function buildContainer(): ContainerInterface
    {
        // Build and compile the plugin's container, typically through the
        // framework ContainerFactory with a BootstrapInterface that composes
        // WpBootstrap.
    }
}

add_action('plugins_loaded', [AcmeKernel::class, 'init']);
```

- **Singleton storage lives on the subclass.** A static property on the consumer's own class is per-plugin state, because every plugin subclasses under its own namespace. The adapter's `Kernel` itself has none.
- **`buildContainer()` replaces a static builder hook.** The consumer implements it, so the adapter never names a container factory and never parks a closure in static state.
- **Boot timeline.** `init()` boots once (idempotent until `shutdown()`). Boot builds the container, then registers on `init` (priority 5) `HookRegistrar::register()` and `CronRegistrar::register()`, and on `rest_api_init` `RestRouteRegistrar::register()`, each only when the container binds it. Then `onBoot(ContainerInterface)` runs: everything plugin-specific (admin menu tree, shared Inertia props, route definitions, integrations) goes there. A failing boot leaves no half-booted kernel behind: the next `init()` tries again.
- **Static entry points**, late-bound to the subclass: `init()`, `container()`, `get($id)` (for host boundaries that cannot receive dependencies: legacy hook callbacks, templates, WP-CLI glue), `swap($id, $instance)` (test or facade override), `handle()` (runs the current wp-admin request through `AdminRouteRegistrar`), `dispatch($event)`, `routing()`, `isBooted()`, `shutdown()`.

## Component identity

`Runtime/WpComponentContext` (`@api`, `final readonly`) implements the framework `HostComponentContextInterface`:

```php
$context = new WpComponentContext(
    componentName: 'acme-plugin',
    assetVersion: ACME_PLUGIN_VERSION,
    basePath: plugin_dir_path(__FILE__),
);
```

The consumer builds it once at boot and injects it through its own container. **It is never registered in the framework's process-wide `HostContext` slot**: with several plugins in one process that slot holds only the last writer's identity.

| Service | Reads | For |
|---|---|---|
| `Http/Routing/RestRouteRegistrar`, `RestRouteAttributeRegistrar` | `componentName()` | REST namespace `{component}/{version}` |
| `Admin/AdminRouteRegistrar` | `componentName()` | menu slug `{component}`, submenu `{component}-{suffix}` |
| `Http/Routing/PublicRouteRegistrar` | `componentName()` | query var `{component}_route` |
| `Cron/CronRegistrar` | `componentName()` | `cron_schedules` keys `{component}_{interval}` |
| `Http/Inertia/InertiaAdapter` | `componentName()`, `assetVersion()` | mount node `{component}-app`, CSRF nonce action `{component}_inertia` (shared as `csrfToken`), asset version for skew detection |
| `Mail/EmailSender` | `basePath()` | email templates under `{basePath}/templates/emails/`, before the theme fallback |

`InertiaAdapter` writes the framework's static Inertia configuration on each `render()`. That is safe because wp-admin serves one component per request; its own shared props, mount node, nonce action and asset version stay on the instance.

## Configuration resolution

`Config/WpConfigResolver` (`@api`, `final readonly`) implements `ConfigResolverInterface`.

- **Constructor:** `__construct(string $envPrefix = 'MIDDAGLIB_', string $optionPrefix = 'middaglib_')`.
- **Order per key:** environment variable `{envPrefix}{KEY}` (upper-cased), then the `wp_options` row `{optionPrefix}{key}` (lower-cased), then the caller's default. Empty values count as absent.
- **Per-entity keys:** `get($key, $entitySlug)` tries `{key}_{slug}` first, then `{key}` as the shared fallback.
- `has($key, $entitySlug)` is `get(...) !== ''`.
- Environment variables can come from `putenv()` in `wp-config.php`, a `.env` loader, container `ENV` or the web server (`SetEnv`).

`Runtime/WpBootstrap` registers `WpConfigResolver` with no arguments, as the library's generic baseline. A consumer registers its own prefixes in its composition root before compiling:

```php
$builder->register(ConfigResolverInterface::class, WpConfigResolver::class)
    ->setArgument('$envPrefix', 'ACME_')
    ->setArgument('$optionPrefix', 'acme_')
    ->setPublic(true);
```

**Upgrading from 1.12 or earlier.** Before 1.13.0 the defaults were `MIDDAG_` / `middag_`. A consumer that relied on them silently reads different keys after the upgrade (for example `MIDDAG_SMTP_HOST` is no longer read; `MIDDAGLIB_SMTP_HOST` is). Pass the old pair explicitly before upgrading.

## Neutral defaults

A default in the adapter must not name a product: a third-party consumer that configures nothing must not inherit another vendor's names, and two unconfigured consumers should collide only on a marker that says "came from this library, not configured".

| Default | Value | Override |
|---|---|---|
| Config prefixes (`WpConfigResolver`) | `MIDDAGLIB_` / `middaglib_` | constructor |
| Routing namespaces, menu slugs, query var, cron keys, nonce action, mount node | derived from `componentName()` | `WpComponentContext` |
| Action Scheduler group (`ActionSchedulerDriver`, `JobScheduler::make()`) | empty | constructor / `make($group)` |
| Schema version option (`Persistence/VersionTracker`) | none: the option name is required | constructor |

Known exceptions that still default to the `middag` name (open drift, tracked in the adapter's decision record):

| Default | Value | Override |
|---|---|---|
| Text domain when no component is given (`WpTranslator`) | `middag` | constructor |
| Host event hook prefix (`WpHostEventBridge`) | `middag/` | constructor |
| Hookfile filter (`WpHookfileLoader`) | `middag_hookfiles` | constructor |
| Hookfile basename (`WpHookfileLoader`) | `middag_hooks.php` | none (class constant) |

## No mutable static state

`tests/Architecture/NoStaticMutableStateTest.php` fails the build if any class, trait or enum under `src/` declares a static property. PHP has no readonly static, so any static property is process-wide state shared by every plugin in the request. Constants and static methods are allowed, which is why the `*Support` seams and the kernel's static entry points are fine. Per-request state is an injected instance dependency.
