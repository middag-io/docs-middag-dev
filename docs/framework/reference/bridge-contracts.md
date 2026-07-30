---
title: 'framework — Bridge Contracts (Adapter Ports)'
---

# Bridge Contracts (Adapter Ports)

The interfaces a host adapter (Moodle, WordPress, or a future host) implements to plug into `middag-io/framework`. Every contract ships an OSS default in the framework itself, so the framework runs standalone with no adapter installed at all — an adapter only ever *overrides* the default. See [Architecture](../explanation/architecture) for how these ports fit into the four-pillar ecosystem.

An adapter never imports core: core governance runs first, and the adapter is only ever handed an opaque envelope to deliver to the host.

## Contract table

| Contract | Home (concern) + OSS default | Moodle | WordPress |
|---|---|---|---|
| `BootstrapInterface` | `Kernel/Contract/` | `MoodleBootstrap` | `WordPressBootstrap` |
| `ConfigResolverInterface` | `Kernel/Contract/` — default `EnvConfigResolver` | `MoodleConfigResolver` | `WpConfigResolver` |
| `HostEventBridgeInterface` *(experimental)* | `Kernel/Contract/` — generic sync bridge, no default; the core Signal layer is used in practice | — | — |
| `HostComponentContextInterface` | `Kernel/Contract/` — neutral component identity (`componentName`/`assetVersion`/`basePath`); registered once via `Kernel/HostContext::set()`, read via `::get()` (returns null when unset) | `MoodleHostContext` | `WpComponentContext` |
| `ConnectionAdapterInterface` | `Database/Contract/` — default `PdoConnectionAdapter` | `MoodleConnectionAdapter` | `WpdbConnectionAdapter` |
| `UserContextResolverInterface` | `Bus/Contract/` — default `NullUserContextResolver` | `MoodleUserContext` | `WpUserContext` |
| `MaintenanceGateInterface` | `Kernel/Contract/` — default `NullMaintenanceGate` | `$CFG->upgraderunning` | `wp_is_maintenance_mode()` |
| `FormRendererInterface` | `middag-io/ui` — framework provides `InertiaRenderer` | `MformRenderer` | `InertiaFormRenderer` |
| `TranslatorInterface` | `Translation/Contract/` — default `FallbackTranslator` | `MoodleTranslator` | `WpTranslator` |
| `MailerInterface` | `Mail/Contract/` — default `NullMailer` (discards) | `MailerAdapter` (`email_to_user`) | `WpMailer` (`wp_mail`) |
| `FilesystemInterface` | `Filesystem/Contract/` — default `LocalFilesystem` | `MoodleFilesystem` (moodledata) | `WpFilesystem` (uploads) |
| `PasswordHasherInterface` | `Security/Contract/` — default `NativePasswordHasher` | delegates to the host hasher | delegates to the host hasher |

`Mailer`, `Filesystem` and `PasswordHasher` are infra ports with a working OSS default — they run standalone out of the box. An adapter only overrides them to talk to the host's own protected storage or credential store.

## Mail — the port and its value objects

The `Mail/` concern deliberately does not depend on `symfony/mailer`: the framework declares only the seam and the message shape, and leaves actual delivery to the host.

- **`Mail/Contract/MailerInterface`** — one method, `send(Mail $mail): void`. An implementation throws on an unrecoverable transport failure; the OSS default `NullMailer` discards silently and never throws (a standalone install has no MTA). Adapters map a `Mail` onto the platform's native sender (Moodle's `email_to_user()`, WordPress's `wp_mail()`); a product running standalone can bind a real transport (SMTP, an API) instead.
- **`Mail`** — the immutable message value object. `to`/`cc`/`bcc` are `list<Address>`; `from`/`replyTo` are `?Address`; `attachments` is `list<Attachment>`; at least one recipient is required. Every address parameter also accepts a plain string (`'jane@example.org'`, `'Jane <jane@example.org>'`) and attachments accept a path string — both are normalised to their value-object form at construction, so every adapter always reads the same uniform shape. Template rendering stays out of the object entirely: render first (Twig, Mustache, the UI layer), then pass the result in as `htmlBody`.
- **`Address`** — an email plus an optional display name, validated at construction (an empty local-part or domain, a missing `@`, or stray whitespace all fail). `Address::parse()` accepts the RFC-style `"Jane Doe <jane@example.org>"` form; `toString()` quotes a display name that contains characters outside RFC 5322 atext, so a comma inside a name can never split a comma-separated recipient header.
- **`Attachment`** — a file referenced by path, with an optional display name, MIME type and content id. `Attachment::embedded($path, $contentId)` creates an inline `cid:` part an HTML body can reference — what an HTML template needs for a logo or an inline image. Adapters map it onto whatever inline-attachment mechanism the host provides.

## Observability — error reporting and profiling ports

`Observability/` holds two ports that, unlike the bridge contracts above, an adapter is **not required to implement** — any tier (adapter, core, product, or a standalone consumer) can bind an implementation, and the OSS ships a working default either way.

- **`Observability/Contract/ErrorReporterInterface`** — `report(Throwable $throwable, array $context = []): void`, the seam for shipping errors to an external tracker so kernel and domain code never depend on a vendor SDK directly. Implementations must **never throw** — error reporting is best-effort telemetry, not something that should ever break the request it's reporting on. OSS implementations: `NullErrorReporter` (the default, discards) and `SentryErrorReporter` — usable once the consumer installs `sentry/sentry` (a composer `suggest`, never a framework dependency). The host initialises the SDK itself; without an initialised SDK, Sentry's own capture functions are a no-op, so binding `SentryErrorReporter` without a DSN configured is harmless.
- **`Observability/Contract/ProfileCollectorInterface`** — the sink for runtime profiling events: `record(category, label, context, durationMs)`, `events()`, `reset()`. Categories are free-form strings (`bus`, `hook`, `query`, …). The OSS implementation `ProfileCollector` holds events in-memory for the lifetime of the request, plus a concrete-only `byCategory()` convenience method that isn't part of the contract itself. Three consumers are already wired in-tree: `Bus/Middleware/ProfilingMiddleware` records every dispatched message under `bus` (timed in a `finally` block, so a failed dispatch still shows up), `Kernel/Manager/HookManager` records fired filters/actions under `hook` (opt-in, via `setProfileCollector()`), and `Http/FatalErrorHandler` records shutdown fatals under `fatal`; adapter-side query loggers record under `query`. Bind one collector instance and inject it everywhere to get a single timeline a dev profiler or debug bar can read back.
