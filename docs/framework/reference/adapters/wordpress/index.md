---
title: 'Reference — WordPress Adapter'
---

# Reference — WordPress Adapter

Reference for `middag-io/wordpress` (`middag-php-wordpress`), the OSS adapter that plugs a WordPress host into `middag-io/framework`. Backs [WP-003](https://github.com/middag-io/middag-php-wordpress/blob/main/docs/decisions/WP-003-wordpress-is-an-adapter-of-framework-ports.md) (WordPress is an adapter of the framework's ports), which applies [FW-015](https://github.com/middag-io/middag-php-framework/blob/main/docs/decisions/FW-015-hosts-are-adapters-of-framework-ports.md) to WordPress.

Verified against `middag-php-wordpress/main@bc1bc59` on 2026-11-04.

## Pages

- [Routing Surfaces](./routing-surfaces) — the REST, admin and public rewrite surfaces, and how each one dispatches.
- [Controller Bases](./controller-bases) — the page-controller base, the REST base, and why they do not share a parent.
- [Configuration & Identity](./configuration) — the consumer kernel, injected component identity, config prefixes and neutral defaults.

## What the adapter is

- A library, not a plugin. It ships no composition root: a WordPress plugin (the consumer) builds the container, binds the ports and boots the kernel.
- It implements framework ports with native WordPress APIs. The full port table, with the OSS default and the Moodle and WordPress implementation of each port, is in [Bridge Contracts](../../bridge-contracts).
- `Runtime/WpBootstrap` (`@internal`) is the generic baseline `BootstrapInterface`. It binds `ConfigResolverInterface`, `UserContextResolverInterface`, `TranslatorInterface`, `MaintenanceGateInterface`, `ConnectionAdapterInterface`, `SqlDialectInterface` and `HookfileLoaderInterface`, plus the synthetic `wordpress.wpdb` service. A real consumer overrides what it needs, starting with its own config prefixes (see [Configuration & Identity](./configuration)).
- It never imports proprietary MIDDAG code. The source scan `tests/AdapterPluginIsolationTest.php` fails the build on a non-OSS MIDDAG namespace, a consumer-plugin namespace or a product table name in `src/`.

## Bridges are native first

Where WordPress already has the mechanism a port describes, the adapter maps the port onto it instead of running the framework's in-memory version:

| Port | WordPress mechanism | Note |
|---|---|---|
| `HostEventBridgeInterface` | `do_action` / `add_action` | `WpHostEventBridge` turns `dispatch('quote.created', [$quote])` into `do_action('middag/quote.created', $quote)`. The prefix is a constructor argument (default `middag/`). The Moodle adapter delegates to the framework `HookManager` instead. |
| `HookfileLoaderInterface` | `WP_CONTENT_DIR`, active theme, a filter | `WpHookfileLoader` loads `middag_hooks.php` from `WP_CONTENT_DIR`, then the active theme, then the paths returned by the `middag_hookfiles` filter (the filter name is a constructor argument; the file basename is fixed). Later sources override earlier ones. |
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
| `CacheSupportPsr16` | PSR-16 over the Object Cache, one cache area per `wp_cache` group | `@api` |
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
| `UserSupport` | `get_current_user_id`, `current_user_can`, `wp_get_current_user` | `@internal` |

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

## Out of scope by design

- **Token authentication.** No bearer-token or JWT code ships here (guard: `tests/Architecture/NoBundledTokenAuthTest.php`). REST controllers depend on `RequestAuthenticatorInterface`; the default `WpSessionAuthenticator` resolves the WordPress session only. A consumer that accepts tokens composes and injects its own authenticator. See [Routing Surfaces](./routing-surfaces#authentication-seam).
- **Governed concerns.** Item/EAV storage, query engine, audit and activity feeds, outbox, tenancy, rate limits, scopes, payments, webhooks and CRM live in proprietary packages downstream.
- **Widgets and `admin-ajax.php`.** No `register_widget` / `WP_Widget` and no `admin-ajax` action handlers: consumers reach the front end through the three routing surfaces and the Inertia glue.
