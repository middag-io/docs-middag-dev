---
title: 'Reference — WordPress Adapter'
---

# Reference — WordPress Adapter

Reference for `middag-io/wordpress` (`middag-php-wordpress`), the OSS adapter that plugs a WordPress host into `middag-io/framework`. Backs [WP-003](https://github.com/middag-io/middag-php-wordpress/blob/main/docs/decisions/WP-003-wordpress-is-an-adapter-of-framework-ports.md) (WordPress is an adapter of the framework's ports), which applies [FW-015](https://github.com/middag-io/middag-php-framework/blob/main/docs/decisions/FW-015-hosts-are-adapters-of-framework-ports.md) to WordPress.

::: info Status
These pages state the `2.x` line of the library family. Support starts at `2.0.0`; earlier releases are pre-stable and unsupported. The generated reference of the `@api` surface is still in progress ([Public surface](#public-surface)); everything else is complete.
:::

## Who it is for

Developers of a WordPress plugin built on `middag-io/framework`, and developers who maintain the adapter itself. The adapter is a library: the consumer's plugin is the composition root ([What the adapter is](#what-the-adapter-is)).

## Requirements and install

| Item                | Value                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| Package             | `middag-io/wordpress` ([middag-php-wordpress](https://github.com/middag-io/middag-php-wordpress)), Apache-2.0 |
| PHP                 | `^8.3`: 8.3, 8.4 and 8.5, within the PHP versions the WordPress version supports; with the `json` extension   |
| Symfony             | `^7.4 \|\| ^8.1` for every Symfony component it requires (contracts and polyfills keep their own ranges)       |
| Sibling libraries   | `middag-io/framework`, on the family MAJOR (`^2.0` on `2.x`); `middag-io/ui` comes with the framework         |
| WordPress           | 7.0 and 7.1 (the latest major and the previous one); the CI runs the integration suite on each                |

```bash
composer require middag-io/wordpress
```

The platform rules behind these values are in [Platform](/libraries/reference/platform) and [Versioning and compatibility](/libraries/reference/versioning-and-compatibility#compatibility-matrix), which also states when a WordPress major leaves the range. Wiring the adapter into a plugin is in [Configuration & Identity](./configuration).

## Public surface

- Support covers the types tagged `@api` only. Anything untagged, or tagged `@internal`, may change in any release. A type in `src/` with neither tag counts as `@internal`.
- [`API-STABILITY.md`](https://github.com/middag-io/middag-php-wordpress/blob/main/API-STABILITY.md) in the repository lists the public surface and points to [Versioning and compatibility](/libraries/reference/versioning-and-compatibility#supported-surface) for the support rules.
- The `@api` surface is what a consumer plugin codes against: the REST controller base and the `Http\Contract` interfaces, the `Domain\Post` and `Domain\User` repositories and meta helpers, the `Domain\Taxonomy`, `Domain\Media`, `Domain\Comment` and `Domain\WooCommerce` value objects, the adapter exceptions, the `Persistence` query builder, the `Settings` and `Definition` builders, the `@api` [Support layer](#support-layer) classes, the mail helpers, the cron registrar, the hook registrar with `Hook\Contract\HookInterface`, the plugin-lifecycle registrar, and the [boot diagnostics](#boot-diagnostics).
- The composition-root concretes are `@api` too, because the consumer names them when it wires its container: `Database\WpdbConnectionAdapter`, `Database\WpdbSqlDialect`, `Config\WpConfigResolver`, `Bus\WpUserContext` and `Persistence\Query\WpdbConditionCompiler`, with the host-context, event-bridge and component-name seams. Type-hint the framework contract in your own code; name the concrete only to wire it. The concretes a consumer never names (`Translation\WpTranslator`, `Runtime\WpMaintenanceGate`, `Runtime\WpBootstrap`) are `@internal`.
- To depend on an `@internal` type, open an issue to have it promoted to `@api`; promotion is an additive change for a family MINOR.
- In progress: the generated reference of the `@api` surface is not published yet ([Documentation publication](/libraries/reference/publication#generated-api-reference)).

## Changelog, decisions and help

- [`CHANGELOG.md`](https://github.com/middag-io/middag-php-wordpress/blob/main/CHANGELOG.md) records every release; [Releases](https://github.com/middag-io/middag-php-wordpress/releases) carry the tags. release-please cuts every release from Conventional Commits; there are no manual tags.
- The adapter releases with the family: a family MINOR or MAJOR ships in every library at once, and a PATCH is free per library. What each kind of release may carry is in [Versioning and compatibility](/libraries/reference/versioning-and-compatibility).
- The decision records live in [`middag-php-wordpress/docs/decisions`](https://github.com/middag-io/middag-php-wordpress/tree/main/docs/decisions).
- Questions and bugs: [issues of `middag-php-wordpress`](https://github.com/middag-io/middag-php-wordpress/issues). Security reports: [`SECURITY.md`](https://github.com/middag-io/middag-php-wordpress/blob/main/SECURITY.md); do not open a public issue for a vulnerability.

## Pages

- [Routing Surfaces](./routing-surfaces) — the REST, admin and public rewrite surfaces, and how each one dispatches.
- [Controller Bases](./controller-bases) — the page-controller base, the REST base, and why they do not share a parent.
- [Configuration & Identity](./configuration) — the consumer kernel, injected component identity, config prefixes and neutral defaults.

Guides that put this reference to work:

- [Getting started with the WordPress adapter](../../../tutorials/wordpress/getting-started) — a first plugin: kernel, container, config resolver and a REST controller.
- How-to: [REST controllers and routes](../../../how-to/wordpress/rest-controllers), [Persistence](../../../how-to/wordpress/persistence), [Repositories](../../../how-to/wordpress/repositories), [Hooks](../../../how-to/wordpress/hooks), [Cron](../../../how-to/wordpress/cron), [Mail](../../../how-to/wordpress/mail), [Definitions and options](../../../how-to/wordpress/settings) and [Boot diagnostics](../../../how-to/wordpress/diagnostics).

## What the adapter is

- A library, not a plugin. It ships no composition root: a WordPress plugin (the consumer) builds the container, binds the ports and boots the kernel.
- It implements framework ports with native WordPress APIs. The full port table, with the OSS default and the Moodle and WordPress implementation of each port, is in [Bridge Contracts](../../bridge-contracts).
- `Runtime/WpBootstrap` (`@internal`) is the generic baseline `BootstrapInterface`. It binds `ConfigResolverInterface`, `UserContextResolverInterface`, `TranslatorInterface`, `MaintenanceGateInterface`, `ConnectionAdapterInterface`, `SqlDialectInterface` and `HookfileLoaderInterface`, plus the synthetic `wordpress.wpdb` service. A real consumer overrides what it needs, starting with its own config prefixes (see [Configuration & Identity](./configuration)).
- It never imports proprietary MIDDAG code. The source scan `tests/AdapterPluginIsolationTest.php` fails the build on a non-OSS MIDDAG namespace, a consumer-plugin namespace or a product table name in `src/`.

## Bridges are native first

Where WordPress already has the mechanism a port describes, the adapter maps the port onto it instead of running the framework's in-memory version:

| Port | WordPress mechanism | Note |
|---|---|---|
| `HostEventBridgeInterface` | `do_action` / `add_action` | `WpHostEventBridge` turns `dispatch('quote.created', [$quote])` into `do_action('{prefix}quote.created', $quote)`. The prefix is a constructor argument with a [neutral default](./configuration#neutral-defaults). The Moodle adapter delegates to the framework `HookManager` instead. |
| `HookfileLoaderInterface` | `WP_CONTENT_DIR`, active theme, a filter | `WpHookfileLoader` loads the hookfile from `WP_CONTENT_DIR`, then from the active theme, then from the paths returned by its filter. The file name and the filter name follow the [neutral defaults](./configuration#neutral-defaults). Later sources override earlier ones. |
| `ConnectionAdapterInterface` | global `$wpdb` | See [Database](#database-wpdb). |
| `MailerInterface` | `wp_mail` | `WpMailer`; `Mail/EmailSender` looks for templates under the component's `basePath()` (`templates/emails/`), then under the active theme. |
| `FilesystemInterface` | uploads directory | `WpUploadsFilesystem`, delegating to the framework `LocalFilesystem` rooted at `wp_upload_dir()['basedir']`. |
| `TranslatorInterface` | `__()` / `_n()` | `WpTranslator`; the `$component` argument is the text domain, with a constructor default domain when it is empty (see [Configuration & Identity](./configuration#neutral-defaults)). |

## Support layer

`src/Support/` holds 25 `*Support` classes: thin static seams over WordPress functions. Each one isolates a group of host functions so the rest of the adapter never calls them directly, and each degrades to a no-op (or an empty/false result) when WordPress is not loaded, which keeps the adapter unit-testable. Stateless static methods are allowed; static properties are not (see [Configuration & Identity](./configuration#no-mutable-static-state)).

| Class | Wraps | Surface |
|---|---|---|
| `AdminSupport` | wp-admin menu and notice APIs | `@api` |
| `AssetSupport` | `wp_enqueue_script` / `wp_enqueue_style` | `@internal` |
| `CacheSupport` | Object Cache (`wp_cache_*`) | `@api` |
| `CacheSupportPsr16` | PSR-16 over the Object Cache, one cache area per `wp_cache` group (group prefix: a constructor argument with a [neutral default](./configuration#neutral-defaults)) | `@api` |
| `CapabilitySupport` | roles and capabilities write side (`add_role`, `WP_Role::add_cap`, ...) | `@internal` |
| `CronSupport` | `wp_next_scheduled` / `wp_schedule_event` / `wp_unschedule_event` | `@internal` |
| `EscapeSupport` | `esc_html` / `esc_attr` / `esc_url` | `@internal` |
| `GlobalsSupport` | typed access to `$GLOBALS['wpdb']` | `@internal` |
| `HookSupport` | `add_action` / `add_filter` / `do_action` / `apply_filters` | `@internal` |
| `LifecycleSupport` | `register_activation_hook` / `register_deactivation_hook` | `@internal` |
| `LogSupport` | resolves the PSR-3 logger from a container: explicit `LoggerInterface`, then the framework `LoggerFactory`, then `error_log()` | `@internal` |
| `MailSupport` | `wp_mail` and the `wp_mail_from*` filters | `@internal` |
| `MetaSupport` | Metadata API for every meta type | `@api` |
| `OptionSupport` | `get_option` | `@api` |
| `PathSupport` | `get_stylesheet_directory` | `@internal` |
| `PostTypeSupport` | `register_post_type` / `register_taxonomy` | `@api` |
| `PrivacySupport` | personal-data exporter and eraser filters | `@internal` |
| `RewriteSupport` | `add_rewrite_rule` / `flush_rewrite_rules` / `get_query_var` | `@internal` |
| `SanitizeSupport` | `sanitize_text_field`, `sanitize_key`, `sanitize_email`, `sanitize_textarea_field`, `wp_kses_post` | `@internal` |
| `SecuritySupport` | nonce functions | `@internal` |
| `SettingsSupport` | Settings API | `@internal` |
| `ShortcodeSupport` | Shortcode API | `@api` |
| `TransientSupport` | Transients API | `@api` |
| `UploadSupport` | `wp_upload_dir()` | `@api` |
| `UserSupport` | `get_current_user_id`, `current_user_can`, `user_can`, `wp_get_current_user` | `@internal` |

## Cron and async jobs

Two separate concerns:

- **Recurring events — `Cron/CronRegistrar`.** A consumer adds events with `addEvent($hook, CronInterval $interval, $callback)`. `CronInterval` is a closed enum (`EveryMinute`, `FiveMinutes`, `FifteenMinutes`, `ThirtyMinutes`, `Hourly`, `TwiceDaily`, `DailyMorning`), so an unknown recurrence fails at compile time instead of scheduling nothing. The custom intervals are registered on the `cron_schedules` filter under keys of the form `{component}_{case}`, so two plugins in one request keep independent schedules. Interval labels go through the host `TranslatorInterface`. The consumer kernel calls `register()` on `init` (priority 5) when the container binds the registrar.
- **One-off async jobs — `Cron/Contract/JobSchedulerInterface`.** `enqueue($hook, $args)` queues a job that fires the action hook out of band. `Cron/JobScheduler::make($group, $actionScheduler)` picks the driver at call time: `ActionSchedulerDriver` when `as_enqueue_async_action()` exists (Action Scheduler, bundled with WooCommerce or installed on its own: persistent queue, retries, admin UI, WP-CLI runner), otherwise `WpCronDriver` (`wp_schedule_single_event`; pseudo-cron, no retry, identical hook and arguments within ten minutes are suppressed). Build the scheduler after `plugins_loaded`, or detection misses an Action Scheduler loaded by another plugin.

Locking, retries beyond the driver's own and job governance are not part of the adapter.

## WooCommerce

WooCommerce is optional and never a Composer dependency.

- `Domain/WooCommerce/WooCommerceAvailability::isAvailable()` probes at runtime (`class_exists('WooCommerce')` or `function_exists('WC')`).
- `Domain/WooCommerce/OrderReference` and `ProductReference` are lightweight read-only references that do not need WooCommerce loaded.
- `Security/Enum/WooCommerceCapability` lists the native WooCommerce capability strings next to `WpCapability`. Referencing a case never needs WooCommerce; granting one only matters once its roles (for example `shop_manager`) exist.
- Action Scheduler, which WooCommerce bundles, is the preferred async job driver when present (see above).

Payments, webhooks and store integrations are not in this adapter.

## Database ($wpdb)

- **`Database/WpdbConnectionAdapter`** (`@api`) is the only object in the adapter that knows `$wpdb`. Everything above it (query builders, repositories, domain) depends on the framework `ConnectionAdapterInterface`. Records and conditions are associative arrays; rows come back as `ARRAY_A`.
- **`Database/WpdbSqlDialect`** (`@api`) is MySQL/MariaDB. WordPress raw SQL uses physical table names, so `table()` prepends the `$wpdb->prefix` (`wp_`, `wp_2_`, ...) instead of bracing the name as Moodle does. The connection adapter builds its own prefixed dialect from `$wpdb->prefix`, and `WpBootstrap` resolves `SqlDialectInterface` to that same instance. The record helpers on the connection adapter take the already-prefixed physical name.
- **Capabilities reported by `supports()`:**

| `Capability` | Reported | Why |
|---|---|---|
| `Transactions` | yes | `$wpdb` runs `START TRANSACTION` / `COMMIT` / `ROLLBACK`; meaningful only on InnoDB |
| `Streaming` | no | no unbuffered cursor; results are buffered |
| `JsonWhere` | yes | MySQL 5.7+/8.0 JSON predicates |
| `Returning` | no | MySQL has no `RETURNING` |
| `Upsert` | yes | `INSERT ... ON DUPLICATE KEY UPDATE` |
| `SchemaDiff` | no | WordPress owns its schema through `dbDelta()` |
| `RowLock` | yes | InnoDB `SELECT ... FOR UPDATE` / `FOR SHARE` |

- **Schema.** The adapter ships no DDL adapter: WordPress owns its schema lifecycle through `dbDelta()`. `Persistence/VersionTracker` stores a schema version per library in a `wp_options` row written with `autoload = false`.
- **Native content.** `Domain/Post/PostRepository`, `PostMetaRepository`, `Domain/User/UserRepository` and `UserMeta` cover `wp_posts`, `wp_postmeta` and users; `Persistence/QueryBuilder` builds `WP_Query`-backed reads over `wp_posts`.

## Boot diagnostics

`Diagnostics/` is a post-autoload self-check: it proves that the packages built on the adapter loaded and booted, and gives health checks and pipelines a WP-CLI command to gate on. A URL that answers 200 does not prove that a plugin booted.

- **Registration.** `DiagnosticsRegistry` holds a WordPress filter name ([neutral default](./configuration#neutral-defaults) `middaglib_diagnostics`). `register(PackageProbe $probe)` adds the probe on that filter, so every plugin and theme that shares the filter name meets in one report, although each boots its own kernel. There is no static registry.
- **`PackageProbe`.** A package name, its version, its kernel class, an optional entry class, an optional autoloader path and extra checks. It holds names only: declare it from the main plugin file, before the kernel boots, so a failed boot shows up as a failed check instead of a missing package.
- **`BootReport`.** Per package, it checks that the entry class resolves (and from which file), which autoloader file the bootstrap chose when the package declares one, that the kernel booted (it reads `isBooted()` and never boots it) and that a version was declared, then runs the package's own checks. A check that throws becomes a failure and the next check still runs. An expected package that never registered, an entry on the filter that is not a probe, a duplicate name, or no package at all fail the report.
- **Host-level checks.** `Contract\DiagnosticCheckInterface`, with `CallbackCheck` as a closure shorthand, adds a check with a `CheckScope` of `Boot` or `Render`. A render check covers what boot cannot see, for example that an admin page still emits the HTML shell and the core script bundles. Until a render check runs, the text and JSON output say that the report covers boot only.
- **WP-CLI.** `DoctorCommandRegistrar` registers `wp <root> doctor` (neutral root `middaglib`; the consumer passes its own). The command takes `--expect=a,b`, `--strict` (warnings fail too) and `--format=text|json`, and exits `0` when healthy and `1` when broken. Outside WP-CLI, `register()` does nothing. Register the command from the main plugin file, so it exists when the kernel fails to boot.

```php
$registry = new DiagnosticsRegistry('acme_diagnostics');
$registry->register(new PackageProbe('acme-shop', ACME_SHOP_VERSION, AcmeShopKernel::class));
(new DoctorCommandRegistrar(new DoctorCommand($registry, ['acme-shop']), 'acme'))->register();
```

A health gate passes the full list of packages it expects: `wp acme doctor --expect=acme-shop,acme-quotes`. The list given to the constructor only applies when the package that registered the command loaded, so it cannot catch that package's own absence.

## Out of scope by design

- **Token authentication.** No bearer-token or JWT code ships here (guard: `tests/Architecture/NoBundledTokenAuthTest.php`). REST controllers depend on `RequestAuthenticatorInterface`; the default `WpSessionAuthenticator` resolves the WordPress session only. A consumer that accepts tokens composes and injects its own authenticator. See [Routing Surfaces](./routing-surfaces#authentication-seam).
- **Governed concerns.** Item/EAV storage, query engine, audit and activity feeds, outbox, tenancy, rate limits, scopes, payments, webhooks and CRM live in proprietary packages downstream.
- **Widgets and `admin-ajax.php`.** No `register_widget` / `WP_Widget` and no `admin-ajax` action handlers: consumers reach the front end through the three routing surfaces and the Inertia glue.
