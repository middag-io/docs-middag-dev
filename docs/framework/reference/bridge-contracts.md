---
title: 'framework — Bridge Contracts (Adapter Ports)'
---

# Bridge Contracts (Adapter Ports)

The interfaces a host adapter (Moodle, WordPress, or a future host) implements to plug into `middag-io/framework`. Backs [FW-015](https://github.com/middag-io/middag-php-framework/tree/main/docs/decisions) (hosts are adapters of the framework's ports) and [FW-014](https://github.com/middag-io/middag-php-framework/blob/main/docs/decisions/FW-014-segregated-controller-role-interfaces.md) (controller roles). See [Architecture](../explanation/architecture) for how these ports fit into the ecosystem.

## Rules every port follows

- **A host enters only through an adapter.** Only adapter packages call host APIs; the framework calls none (enforced by `composer check:portability`, see [Composer Portability Audit](./portability-audit-historical)).
- **Every port has an OSS default or is optional.** The framework runs standalone with no adapter installed; an adapter only overrides a default. The standalone runtime is described in [Standalone Runtime](./standalone-runtime).
- **The consumer owns the composition root.** The product (or a standalone app) chooses the bootstrap, the adapter and the bindings. The OSS libraries ship no composition root of their own.
- **No product identity in the libraries.** Component name, asset version and base path reach the adapter at runtime through `HostComponentContextInterface`; defaults are neutral.
- **Adapters never import proprietary code.** Governed concerns live in proprietary packages downstream, which build on the same ports; an adapter is only ever handed what it must deliver to the host.

## Contract table

Adapter class names verified against `middag-php-moodle/main@6aae04d` and `middag-php-wordpress/main@bc1bc59` on 2026-11-04. "—" means the adapter does not implement the port and the OSS default (or the consumer's own binding) applies.

| Contract | Home + OSS default | Moodle | WordPress |
|---|---|---|---|
| `BootstrapInterface` | `Kernel/Contract/` — a standalone app writes its own | `MoodleBootstrap` | `WpBootstrap` |
| `ConfigResolverInterface` | `Kernel/Contract/` — `EnvConfigResolver` | `MoodleConfigResolver` | `WpConfigResolver` |
| `HostComponentContextInterface` | `Kernel/Contract/` — neutral component identity (`componentName`/`assetVersion`/`basePath`); optional process-wide slot `Kernel/HostContext` | `MoodleHostContext` | `WpComponentContext` (injected, never through `HostContext`; see below) |
| `MaintenanceGateInterface` | `Kernel/Contract/` — `NullMaintenanceGate` | `MoodleMaintenanceGate` (`$CFG->upgraderunning`, `during_initial_install()`) | `WpMaintenanceGate` (`wp_is_maintenance_mode()`) |
| `HookManagerInterface` | `Kernel/Contract/` — `HookManager`, bound by the consumer | — (`MoodleHostEventBridge` consumes the bound manager) | — (host events go to native WordPress hooks) |
| `HostEventBridgeInterface` | `Kernel/Contract/` — `@api`, no default | `MoodleHostEventBridge` (delegates to `HookManager`) | `WpHostEventBridge` (native `do_action`, `middag/` prefix) |
| `ConnectionAdapterInterface` | `Database/Contract/` — `PdoConnectionAdapter` | `MoodleConnectionAdapter` | `WpdbConnectionAdapter` |
| `SqlDialectInterface` | `Database/Contract/` — `StandardSqlDialect`, `MysqlSqlDialect`, `PrefixingSqlDialect` | `MoodleSqlDialect` | `WpdbSqlDialect` |
| `SchemaBuilderAdapterInterface` | `Database/Contract/` — `DbalSchemaBuilderAdapter`, `MysqlSchemaBuilderAdapter`, `SqliteSchemaBuilderAdapter` | `XmldbSchemaAdapter` | — (WordPress owns its schema through `dbDelta()`) |
| `VersionTrackerInterface` | `Database/Contract/` — `MysqlVersionTracker` | `VersionTracker` | `VersionTracker` |
| `TransactionManagerInterface` | `Database/Contract/` — no default | `TransactionManager` | — |
| `UserContextResolverInterface` | `Bus/Contract/` — `NullUserContextResolver`; `SessionUserContextResolver` for session-based standalone apps | `MoodleUserContext` | `WpUserContext` |
| `FormRendererInterface` | `middag-io/ui` — framework provides `InertiaRenderer` | `MformRenderer` | — (framework `InertiaRenderer`) |
| `TranslatorInterface` | `Translation/Contract/` — `FallbackTranslator` | `MoodleTranslator` | `WpTranslator` |
| `MailerInterface` | `Mail/Contract/` — `NullMailer` (discards) | `MoodleMailer` (`email_to_user`) | `WpMailer` (`wp_mail`) |
| `FilesystemInterface` | `Filesystem/Contract/` — `LocalFilesystem`; `FlysystemFilesystem` with `league/flysystem` | `MoodledataFilesystem` | `WpUploadsFilesystem` |
| `PasswordHasherInterface` | `Security/Contract/` — `NativePasswordHasher` | — | — |
| `ActorResolverInterface`, `OriginResolverInterface` | `Logging/Contract/` — `NullActorResolver`, `NullOriginResolver` | `MoodleActorResolver`, `MoodleOriginResolver` | — |
| `ErrorReporterInterface`, `ProfileCollectorInterface` | `Observability/Contract/` — `NullErrorReporter`, `ProfileCollector` | — | — |

Logging and observability ports are documented in [Logging & observability](./logging-and-observability); database ports in [Database Schema & Migrations](./database-schema-and-migrations).

## Host identity in a shared process

`HostContext::set()` is a single process-wide slot that static adapter helpers outside the DI graph read through `HostContext::get()` (null when unset). It models one active host component per process, which holds for Moodle (one plugin boots per request). It does not hold for WordPress, where several plugins built on the WordPress adapter share one PHP process: each would overwrite the slot and the last write would win. WordPress consumers therefore never read `HostContext`; each plugin injects its `WpComponentContext` through its own container.

## Controller roles

`ControllerInterface` is the union of three host-neutral role interfaces, so a host composes only the roles its dispatch model runs:

| Role interface (`Http/Contract/`) | Members |
|---|---|
| `ContainerAwareInterface` | `setContainer()` |
| `RequestHandlingInterface` | `setRequest()`, `preHandle()`, `handle()` |
| `AuthorizationAwareInterface` | `setRequireLogin()`, `setRequireCapabilities()` |

`interface ControllerInterface extends ContainerAwareInterface, RequestHandlingInterface, AuthorizationAwareInterface {}` — the full six-method surface is unchanged for existing implementers. Smaller opt-in seams sit alongside: `CapabilityRequirementAwareInterface`, `PublicRouteAwareInterface`, `AuthenticatorInterface`.

| Package | Page/kernel controller base | REST/API base |
|---|---|---|
| framework | `AbstractController` (implements `ControllerInterface`) | `AbstractApiController extends AbstractController` |
| `middag-php-moodle` | `AbstractController implements MoodleControllerInterface` (which extends `CapabilityRequirementAwareInterface` and `ControllerInterface`) | `AbstractApiController extends AbstractController` |
| `middag-php-wordpress` | `AbstractWpController extends` the framework `AbstractController` | `AbstractWpRestController implements RestControllerInterface` — the WordPress REST registration model (`register_rest_route` with a `permission_callback` per endpoint) has no single `handle()` cycle, so it shares no inheritance chain with the kernel controllers |

The framework grows no WordPress-REST-shaped surface; the REST contract stays in the adapter.

## Mail — the port and its value objects

The `Mail/` concern deliberately does not depend on `symfony/mailer`: the framework declares only the seam and the message shape, and leaves actual delivery to the host.

- **`Mail/Contract/MailerInterface`** — one method, `send(Mail $mail): void`. An implementation throws on an unrecoverable transport failure; the OSS default `NullMailer` discards silently and never throws (a standalone install has no MTA). Adapters map a `Mail` onto the platform's native sender (Moodle's `email_to_user()`, WordPress's `wp_mail()`); a product running standalone can bind a real transport (SMTP, an API) instead.
- **`Mail`** — the immutable message value object. `to`/`cc`/`bcc` are `list<Address>`; `from`/`replyTo` are `?Address`; `attachments` is `list<Attachment>`; at least one recipient is required. Every address parameter also accepts a plain string (`'jane@example.org'`, `'Jane <jane@example.org>'`) and attachments accept a path string — both are normalised to their value-object form at construction, so every adapter always reads the same uniform shape. Template rendering stays out of the object entirely: render first (Twig, Mustache, the UI layer), then pass the result in as `htmlBody`.
- **`Address`** — an email plus an optional display name, validated at construction (an empty local-part or domain, a missing `@`, or stray whitespace all fail). `Address::parse()` accepts the RFC-style `"Jane Doe <jane@example.org>"` form; `toString()` quotes a display name that contains characters outside RFC 5322 atext, so a comma inside a name can never split a comma-separated recipient header.
- **`Attachment`** — a file referenced by path, with an optional display name, MIME type and content id. `Attachment::embedded($path, $contentId)` creates an inline `cid:` part an HTML body can reference — what an HTML template needs for a logo or an inline image. Adapters map it onto whatever inline-attachment mechanism the host provides.

## Observability — error reporting and profiling ports

`Observability/` holds two ports that an adapter is **not required to implement** — any layer (adapter, downstream package, product, or a standalone consumer) can bind an implementation, and the OSS ships a working default either way.

- **`Observability/Contract/ErrorReporterInterface`** — `report(Throwable $throwable, array $context = []): void`, the seam for shipping errors to an external tracker so kernel and domain code never depend on a vendor SDK directly. Implementations must **never throw** — error reporting is best-effort telemetry, not something that should ever break the request it's reporting on. OSS implementations: `NullErrorReporter` (the default, discards) and `SentryErrorReporter` — usable once the consumer installs `sentry/sentry` (a composer `suggest`, never a framework dependency). The host initialises the SDK itself; without an initialised SDK, Sentry's own capture functions are a no-op, so binding `SentryErrorReporter` without a DSN configured is harmless.
- **`Observability/Contract/ProfileCollectorInterface`** — the sink for runtime profiling events: `record(category, label, context, durationMs)`, `events()`, `reset()`. Categories are free-form strings (`bus`, `hook`, `query`, …). The OSS implementation `ProfileCollector` holds events in-memory for the lifetime of the request, plus a concrete-only `byCategory()` convenience method that isn't part of the contract itself. Three consumers are already wired in-tree: `Bus/Middleware/ProfilingMiddleware` records every dispatched message under `bus` (timed in a `finally` block, so a failed dispatch still shows up), `Kernel/Manager/HookManager` records fired filters/actions under `hook` (opt-in, via `setProfileCollector()`), and `Http/FatalErrorHandler` records shutdown fatals under `fatal`. No shipped adapter records under `query` today. Bind one collector instance and inject it everywhere to get a single timeline a dev profiler or debug bar can read back.
