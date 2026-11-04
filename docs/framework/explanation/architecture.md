---
title: 'framework — Architecture'
---

# Architecture

`middag-io/framework` (the `middag-io/middag-php-framework` Composer package) is the host-agnostic kernel at the center of the MIDDAG PHP ecosystem — DI, HTTP, routing, a command bus, an immutable query builder, forms, logging, an Inertia bridge, and a typed exception hierarchy, wrapped over Symfony, PSR, Monolog and Inertia under one coherent API. Apache-2.0 licensed.

It exists to decouple a business domain from whatever platform hosts it: controllers, forms, queries and services are written against contracts, and the same code then runs standalone, inside Moodle, or inside WordPress by swapping a thin adapter underneath it. The payoff is testability, portability, and a domain that survives platform upgrades.

## What the framework is, and is not

**Is:**

- **A host-agnostic kernel** — DI, HTTP, routing, a command bus, an immutable query builder, forms, logging, an Inertia bridge, and a typed exception hierarchy, under one coherent API over Symfony, PSR, Monolog and Inertia.
- **Contract-first** — every host-facing capability is an interface with an OSS default, so the framework runs with no adapter installed at all.
- **Its own Active-Record layer**, Eloquent-*like* but not Eloquent — host-agnostic, built on `ConnectionAdapterInterface`. Full API-surface comparison: [Active Record ↔ Eloquent Compatibility](../reference/active-record-eloquent-compatibility).

**Is not:**

- **A host.** It never knows Moodle or WordPress — that knowledge lives entirely in adapters.
- **The governed domain engine.** Reliable event delivery (Signal + outbox), async jobs with retry/audit, EAV and multi-tenancy are `middag-io/core`, a proprietary package layered on top; licensing is the separate proprietary leaf package `middag-io/licensing`, which core consumes. The framework ships only the generic seam — for example the `SignalDispatcherInterface` contract — the outbox implementation itself is core.
- **A framework that hides the domain.** The goal is the opposite: a domain free of the host's constraints, not one wrapped in new ones.

Five design promises run through everything below: the domain is absolute (plain PHP objects, no mandatory framework base class), the host is a detail (Ports & Adapters), persistence is isolated to infrastructure, DX doesn't cost architectural purity (DI + Facades implemented as real proxies, not magic globals), and named host events reach whatever hook system a host uses through an adapter (`HostEventBridgeInterface`).

## The four pillars (dependency rings)

The ecosystem is **Hexagonal (Ports & Adapters)**, arranged in four rings. Dependency only ever points downward.

```
┌─ Pillar 4 — Composition Root (Product) ── moodle-local_middag / wp-plugin-middag ──┐
│  Aggregate Roots, vertical slices, the business. Wires everyone in composer.json.  │
└───────────────┬───────────────────────────────────┬──────────────────────────────┘
                │ imports                            │ imports
        ┌───────▼────────┐                  ┌────────▼─────────┐
        │ Pillar 3 — CORE │                  │ Pillar 2 — ADAPTERS│
        │ (proprietary)  │                  │ (OSS)            │
        │ Signal/outbox, │                  │ middag-php-moodle│
        │ Job, EAV,      │                  │ middag-php-      │
        │ multi-tenant   │                  │ wordpress        │
        │ (+ licensing   │                  │ ($DB/$wpdb wrap) │
        │  leaf pkg)     │                  │                  │
        └───────┬────────┘                  └────────┬─────────┘
                │ imports                            │ imports
                └──────────────┬─────────────────────┘
                       ┌───────▼─────────────────────────────────┐
                       │ Pillar 1 — OSS Foundation                │
                       │ middag-php-framework  ──▶  middag-php-ui  │
                       │ (Ports: contracts, kernel, query, forms) │
                       └──────────────────────────────────────────┘
```

| Pillar | Repositories | What it is | Dependency rule |
|--------|--------------------------------------------------------|------------|-----------------|
| **1. OSS Foundation** | `middag-php-framework`, `middag-php-ui` | The **Ports**: contracts, DI, HTTP, query, forms, bus, hooks. | `framework` wraps Symfony/PSR/Monolog (not zero-dep — see below). `ui` is pure PHP (`require: php` only). |
| **2. OSS Adapters** | `middag-php-moodle`, `middag-php-wordpress` | The **Adapters**: implement the bridge contracts by talking to `$DB`/`$wpdb`. | Depend on `middag-php-framework` (and `middag-php-ui`) + the platform. Never import proprietary code — they stay OSS. |
| **3. CORE (proprietary)** | `middag-php-core`, `middag-php-licensing`, `middag-php-dev-tools` | The business engine: governed Signal + outbox, async Job, EAV, multi-tenant (`core`); license lifecycle in the separate `licensing` leaf; build tooling (`dev-tools`). | `core` requires `middag-php-framework`, `middag-php-ui` and `middag-php-licensing`, and never requires the adapters at runtime — it runs on WP and Moodle by programming against the Pillar 1 interfaces. `licensing` is a leaf with no MIDDAG runtime dependency (it does not depend on the framework). `dev-tools` is build-time only (`require-dev` in consumers) and requires only the framework at runtime. |
| **4. Composition Root** | `moodle-local_middag`, `wp-plugin-middag-account` | The real modular monolith: Aggregate Roots, vertical slices. | The only pillar that wires everything: imports framework + core + a specific adapter. |

### The boundary invariant

```
core (proprietary) ──imports──▶ framework (OSS) ──imports──▶ ui (OSS)
       ▲ never back ──────────────────┘ never back ────────────────┘
```

OSS libraries never import `core`/proprietary code. If OSS code needs governed pub/sub, async jobs, EAV or multi-tenancy, it belongs to core instead — the framework exposes only the **contract** (for example `Bus\Contract\SignalDispatcherInterface`); the outbox/Signal implementation is core.

Because the adapters are independent OSS libraries written against the same contracts, the ecosystem is a real pluggable platform: a community `middag-php-magento` or `middag-php-drupal` adapter is architecturally possible without touching this framework at all.

### What Pillar 1 actually depends on

Pillar 1 is not zero-dependency across the board — only `middag-php-ui` is:

- **`middag-php-ui` — pure PHP.** `composer.json require` is `php: ^8.2`, nothing else. Grepping `Moodle|wpdb|PDO|Database\\|CommandBus|Illuminate|Symfony\\` in its `src/` returns empty — it is the one truly zero-dependency pillar.
- **`middag-php-framework` — wraps Symfony.** It does not reinvent DI, routing or validation: it wraps **Symfony** (`dependency-injection`, `http-foundation`, `http-kernel`, `routing`, `messenger`, `validator`, `serializer`, `cache`, `uid`, `clock`, `http-client`), **PSR** (3 log, 7/15/17/18 HTTP, 11 container, 16 simple cache, 20 clock), **Monolog** and `nyholm/psr7` under one coherent, Symfony-like API. It requires `middag-php-ui` as well. `illuminate/database`, `doctrine/dbal`, `symfony/doctrine-messenger`, `league/flysystem` and `sentry/sentry` appear only as composer `suggest` entries, never as a `require`.
- **Vendor types stay inside.** At its public boundaries the framework exposes PSR-15/PSR-7 and its own types. Where a consumer would otherwise import a vendor type, the framework publishes its own name and reuses the vendor machinery behind it: `#[Lazy]` (shadows Symfony DI's), `MiddagDoctrineTransport` (an empty `final` subclass of Symfony's `DoctrineTransport`), `TransportInterface`/`MessageBusInterface` (empty extensions of Symfony Messenger's), `#[LogChannel]` (instead of Monolog's `#[WithMonologChannel]`). The full list and the deliberate exceptions are in [PSR-15 Bridge & Middleware](../reference/psr15-bridge-and-middleware).

Pillar 1's agnosticism is about **not knowing the host** (Moodle/WP), not about being vendor-free. The framework has heavy dependencies; what it never has is a `use Moodle\` or a `global $DB`.

For where a new interface, enum or extension point physically lives inside any OSS lib's `src/`, see [Module Layout Convention](../reference/module-layout-convention). For the bridge contracts an adapter must implement to plug a host in, see [Bridge Contracts](../reference/bridge-contracts).

## The UI-agnostic guardrail

The presentation layer must stay agnostic of where data comes from or where it goes. The UI builders (`middag-php-ui`'s `Block/`, `Page/`, `Table/`, `Form/`, `Navigation/`, `Region/`, `Action/`) describe **what** to render — never **how** the data arrived nor where it goes next.

**Forbidden in `middag-php-ui`:** importing `Database`, `Connection`, `CommandBus`/Bus, `PDO`, the query builder, or any HTTP kernel.

Translation to the wire (the Inertia v3 protocol) is a **framework** seam, not a UI one: the framework consumes the UI contract and emits the Inertia protocol, in `Http/Inertia/` and `Form/Renderer/InertiaRenderer` (an implementation of `Middag\Ui\Form\FormRendererInterface`).

```
[ middag-php-ui ]            [ middag-php-framework ]              [ host ]
 Block/Page/Form    ──▶   Http/Inertia/  +  Form/Renderer/   ──▶   browser
 (pure contract)          (consumes contract, emits wire v3)
        │
        └── NEVER knows Database / Bus / Connection / PDO
```

Rule of thumb: if presentation logic needs to know about a query or the bus, the boundary has been violated — move the decision to the controller/handler in the framework and hand the UI only the ready data.

## Async convergence and events

- **One bus.** `Bus/MessageBus` handles both `CommandBus` (CQRS, sync) and async dispatch via `MessageBusInterface` (Symfony Messenger) plus transport routing. The container's default `async` transport is `InMemoryTransport`; a durable Doctrine transport ships for standalone hosts ([Standalone Runtime](../reference/standalone-runtime)). Governed Signal + outbox is **core**.
- **Host events.** `HostEventBridgeInterface` is the `@api` synchronous bridge for named events, implemented by the adapters (`MoodleHostEventBridge` over `HookManager`, `WpHostEventBridge` over native `do_action()`), paired with a per-instance `HookManager` (priority filters/actions, profiling). See [Hooks — Public Surface and Naming](../reference/hooks-public-surface). Post-commit outbox dispatch is core.

## Locked architectural decisions

A handful of cross-cutting decisions are treated as settled for the whole ecosystem, not just this repository:

- **The framework defines interfaces; adapters implement the kernel pattern** — never the reverse.
- **`ExtensionInterface` narrowed to `ModuleInterface`** (`Kernel/Module/`). The richer MIDDAG Extension concept and its loaders are core; adapters only ever know the bare `ModuleInterface` (OSS).
- **The QueryBuilder is immutable**; execution belongs to the adapter, via `ConnectionAdapterInterface`.
- **Async convergence is one sync bus + async via Messenger + routing.** Signal/outbox stays core.
- **Neutral host identity via `HostComponentContextInterface`** (`componentName`/`assetVersion`/`basePath`), registered once at boot in the `HostContext` composition-root registry (`set()`/`get()`, with `get()` returning null when unset) so static adapter helpers outside the DI graph still degrade gracefully. This is distinct from `ComponentNameResolverInterface` (boot-failure classification) — the two overlap only on the component identifier.

## Known OSS boundaries — seams, not bugs

These are intentionally unresolved at the OSS layer: the seam exists, but the resolution belongs to a tier above. They are boundaries by design, not gaps waiting to be filled in this repository.

| Boundary | OSS seam that exists | Who resolves it |
|----------|----------------------|-----------------|
| Multi-plugin collision (same host, different versions) | Per-instance state, with the bounded statics listed below | Product (PHP-Scoper/Mozart at build) |
| No built-in rate limiting | `#[Middleware]` (+ composer `suggest symfony/rate-limiter`) | Adapter/Product/Core |
| Input sanitisation not centralised (validation only) | `AbstractFormRequest::rules()` / `#[ValidatedDto]` | Controller/Adapter |
| Host namespaces kept out of the framework | `composer check:portability` (deptrac + host-globals scan) in the framework's CI | Framework — see [Composer Portability Audit](../reference/portability-audit-historical) |
| Forward-only migrations (no `down()`) | `MigrationRunner::onUpgrade()` — see [Database Schema & Migrations](../reference/database-schema-and-migrations) | Adapter (xmldb/dbDelta) |
| No service-locator guard (Facades are service locators) | Discipline + `composer check` | PR convention / dev-tools PHPStan rule |
| Outbox (post-commit) + governed job records | `SignalDispatcherInterface`/`MessageBusInterface`, retry/attempt seams | **Core**, by design |

### Bounded statics

The framework keeps state per instance, with one bounded exception: static facades and composition-root statics, which exist because some callers run outside the DI graph (host callbacks, static adapter helpers, attribute-driven entry points). Every one of them has a reset or swap seam for tests and long-running workers.

| Static state | Where | Reset / override seam |
|---|---|---|
| Facade container and resolved instances | `Kernel/Facade/AbstractFacade` | `setFacadeContainer()`, `swap()`, `reset()` |
| Active host component context | `Kernel/HostContext` | `set()`, `reset()`; `get()` returns null when unset |
| Inertia shared props, URL generator, asset version, bootstrap HTML and app id | `Http/Inertia/InertiaManager`, `InertiaAdapter`, `InertiaVersionManager`, `InertiaFactory` | `InertiaManager::flush()`, the setters. Shared props are request-scoped (written by `ShareFlashMiddleware` and `VerifyCsrfMiddleware`), so a long-running worker must flush them between requests |
| Active Record connection and cast resolvers | `Persistence/Model` | `setConnectionResolver()`, `setConnection()`, `setCastResolver()` |
| Debug logger and config reader | `Shared/Util/Debug` | `setRuntime()`, `resetRuntime()` |
| Reflection cache | `Http/Resolver/MethodParameterResolver` | pure cache of reflection results |

`HostContext` is a single slot per process. That is safe when one host component boots per request (Moodle); it is not safe when several components share a process (several WordPress plugins built on the WordPress adapter), so WordPress consumers never read `HostContext` and inject `WpComponentContext` through their own container instead. Everything else — `HookManager`, the container, the bus, loggers, repositories — is per instance.

### Contextual binding (native Symfony DI — no framework code involved)

"Same interface, different implementation depending on who asks" — for example, a read replica only for `ReportRepository`, the primary connection for everything else — needs **no new framework code**. The DI engine is Symfony's `ContainerBuilder`, which has native contextual binding; the wiring is product config, not a framework feature:

```php
// The default (autowiring/alias) gives the primary connection to everyone;
// only ReportRepository receives the read replica.
$container->getDefinition(ReportRepository::class)
    ->setArgument('$connection', new Reference('connection.replica'));
```

The framework keeps single-interface auto-aliasing as the common case; contextual binding is a product opt-in on top of it.

### Ownership map — who owns what

> Legend: **[FW]** Framework (OSS) · **[ADAPTER]** host adapter · **[CORE]** proprietary core · **[PRODUCT]** composition root · **[UI]** `middag-io/ui` · **[DEVTOOLS]** dev-tools.

- **[FW] Framework (OSS):** auth (`#[Auth]`, agnostic, no `symfony/security`) · CSRF · CORS (`CorsMiddleware`) · Inertia (version-skew, props) · logging (`RotatingStreamHandler`, secret redaction default-on) · errors (`mapThrowable` + status-mapped `MiddagException`, opt-in `FatalErrorHandler`, debug renderer default-off) · command bus (+ `InMemoryTransport`, standalone `DoctrineTransportFactory`, `CommandWorker`, `StandaloneKernel`) · API surface (`#[Route]`, `AbstractFormRequest`/`#[ValidatedDto]`, null-safe `toArray`) · schema (`SchemaBuilder`, forward-only `MigrationRunner`, `transaction`) · infra ports with OSS defaults (`Clock`, `Filesystem`/`LocalFilesystem`, `Mailer`/`NullMailer`, `Session`, `EnvConfigResolver`, `Translator`/`FallbackTranslator`, PSR-16 cache, `FlashBag`) · `#[TrustedOutput]`.
- **[ADAPTER] Adapter:** host-capability auth · input sanitisation (e.g. undoing WP's magic-quotes slashing) · assets/url/i18n catalog/native REST · host cache pool · log base path · host error translation · native filesystem/mailer · host schema (xmldb/dbDelta) + table prefix · uninstall/roles.
- **[CORE] Core (proprietary):** governed event delivery · async jobs · EAV query engine · multi-tenancy — the governed domain infrastructure built on top of this OSS, opt-in; the framework never imports it. Licensing is a separate proprietary leaf package that core consumes.
- **[PRODUCT] Product (composition root):** per-route rate limiting · single-run lock (`symfony/lock`) · CORS wiring · slugifier · vault/secrets · Redis driver · seeders · E2E · timezone policy · settings memoisation.
- **[UI] `middag-io/ui`:** `FormRendererInterface` / field contracts (rendered to the wire by the framework).
- **[DEVTOOLS] dev-tools:** generators (`install.xml`/`upgrade.php` from descriptors; the facade generator).

### Service discovery and HTTP attribute composition

**One OSS service-discovery engine, plus a bridge contract.** The framework ships `ServiceProvider` (static, PascalCase suffix conventions) — the default wired by `ContainerFactory::build()` for standalone/framework boots — and publishes the `ServiceLoaderInterface` contract for host-integrated engines. The richer instance engine that actually backs adapters (snake_case conventions, cache + self-pruning + DI tagging, plugin discovery hook, boot-failure policy) is an adapter/core concern living downstream (for example core's `ServiceLoader`, which Moodle's `MoodleServiceLoader` subclasses) — never in the OSS framework. The same split applies to *module* and *facade* discovery: the OSS keeps only the `ServiceLoaderInterface` / `ModuleLoaderInterface` / `FacadeLoaderInterface` contracts, not the host implementations.

**Route auto-discovery is a seam, not yet wired.** `RouteLoader` scans `#[Route]` attributes off a controller into a `RouteCollection`, but the OSS `HttpKernel` only ever receives a pre-built collection — the host assembles routes (standalone lists them explicitly; adapters ship their own loader). A turnkey standalone route-discovery factory is roadmap, not shipped.

**`#[Auth]` overrides, `#[Middleware]` stacks.** Both attributes read the method then the class, but with opposite merge rules: `#[Auth]` is *override* (a method-level attribute replaces the class-level one — first non-empty wins), while `#[Middleware]` is *stacking* (class-level and method-level accumulate, class outermost, method innermost, each in declaration order). Effective request order: route match → auth flags (+ `applyPlatformAuth()`) → OSS login gate → `preHandle()` → parameter resolution → [registrar middleware → class middleware → method middleware → action]. Full detail: [Routing & Auth Attributes](../reference/attribute-routing-and-auth-model).

**Request validation has two styles, one resolver chain.** A controller validates input either by type-hinting an `AbstractFormRequest` subclass (declarative `rules()` returning a `field => Symfony Constraint` map, validated as an `Assert\Collection` over the input array) or by marking a parameter `#[ValidatedDto]` (a plain class whose properties carry `#[Assert\*]`; `ValidatedDtoResolver` reads the input via the shared `RequestPayload`, hydrates it into the typed object — snake_case input to camelCase properties, scalar coercion — then validates the object). Both throw `MiddagValidationException` (HTTP 422) before the action runs, and both share one error-map shape. The DTO stays a plain, reusable class with no framework base class: the same properties can also carry `#[Field]` (form schema), so one DTO can be the single source of truth for both shape and validation. Reach for the array style for dynamic/loosely-shaped input; reach for the DTO for a typed contract.

## See also

- [Module Layout Convention](../reference/module-layout-convention) — the 3-tier rule for where a new file lives inside any OSS lib's `src/`.
- [Bridge Contracts](../reference/bridge-contracts) — the full table of contracts a host adapter implements.
- [Active Record ↔ Eloquent Compatibility](../reference/active-record-eloquent-compatibility) — the persistence layer's public API surface.
- [Pre-PR Boundary Checklist](../how-to/pre-pr-boundary-checklist) — what to verify before opening a PR against any OSS lib in this ecosystem.
