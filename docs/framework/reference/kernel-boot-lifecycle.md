---
title: 'Kernel Boot Lifecycle — Discovery, Phases & Failure Policy'
---

# Kernel Boot Lifecycle — Discovery, Phases & Failure Policy

Reference for `middag-io/middag-php-framework`'s kernel boot pipeline: the container's phase model, its convention-based service discovery, the pluggable boot-failure policy, and (for provenance) the `moodle-local_middag` legacy mechanics it replaced. Backs [FW-012](https://github.com/middag-io/middag-php-framework/blob/docs/docs/decisions/FW-012-kernel-boot-lifecycle.md).

## The boot pipeline (shipped, current)

`Kernel/ContainerFactory::build()` runs six steps, then a separate call boots modules:

1. Register synthetic-service placeholders (`registerSyntheticDefinitions()`).
2. `$bootstrap->configure($container)` — the adapter registers host services.
3. `ServiceProvider::register()` — suffix-based auto-discovery (only when a project root is given).
4. `$container->compile()` — freezes the dependency graph.
5. Inject each registered synthetic instance (`set()`).
6. `AbstractFacade::setFacadeContainer()`.

`bootModules($modules)` is a distinct, later call: it runs each module's `boot()` under the configured `BootFailurePolicyInterface`.

### Phase enforcement matrix

| Operation | `register()` | `boot()` | `compile()` |
|---|---|---|---|
| Declare container bindings/services | YES | no | no |
| Resolve from the container, register hooks/controllers/subscribers, access another module's already-registered service, publish signals | no | YES | no |
| Modify an existing binding | no | no | no |
| Freeze the container / cache routes | no | no | YES — kernel only |

**What's actually code-enforced today:** only the `compile()` freeze boundary. `ContainerFactory::addSynthetic()` throws `MiddagLifecycleViolationException` if called after `build()` — that's the one phase rule with a runtime guard and a test (`ContainerFactoryLifecycleTest::addSyntheticAfterBuildThrowsLifecycleViolation`). The `register()`-must-not-resolve / `boot()`-must-not-bind split is a design discipline for `ModuleInterface` implementers, not (yet) a lint rule or runtime check.

**Circular dependencies** are rejected at compile time by Symfony's own `ContainerBuilder::compile()` (`CheckCircularReferencesPass`) — no lazy-proxy escape hatch is offered; a cycle means refactoring the design (setter injection, an intermediate factory, a responsibility split), not wrapping the dependency in a proxy.

## Discovery by suffix (shipped, current)

`Kernel/ServiceProvider` scans configured directories under `{projectRoot}/src` and registers any class whose name ends in one of these suffixes, with autowiring enabled:

| Register suffixes | Ignore suffixes (never registered) | Ignore directories (skipped entirely) |
|---|---|---|
| `Service`, `Repository`, `Controller`, `Adapter`, `Handler`, `Hooks`, `Router`, `Builder`, `Factory`, `Registrar`, `Mapper`, `Manager`, `Provider`, `Resolver`, `Validator`, `Dispatcher` | `Entity`, `Interface`, `Trait`, `Enum`, `DTO`, `Dto`, `Exception`, `Signal`, `Event` | `Contract`, `Entity`, `Enum`, `Exception`, `Trait`, `ValueObject`, `DTO`, `Dto` |

A single-interface implementation is auto-aliased so it can be resolved by its interface. Scanned code must live under `{projectRoot}/src`, and the provider's root namespace must map to that tree's PSR-4 root — otherwise the derived FQCN fails `class_exists()` and discovery silently registers nothing for that file.

## Discovery by suffix (legacy, `moodle-local_middag`)

The suffix vocabulary above replaces a richer, host-integrated one. Not shipped in this OSS framework — reference only for whoever ports a legacy extension or implements the host-adapter discovery layer:

| Suffix (legacy) | Loader | Artifact |
|---|---|---|
| `_service`, `_repository`, `_manager`, `_handler`, `_factory`, `_provider`, `_loader`, `_builder`, `_connector`, `_adapter`, `_settings` | `service_loader` | Registered in the container |
| `_extension` | `extension_loader` | Framework extensions |
| `_controller` (with `#[Route]`) | `route_loader` | HTTP controllers |
| `_facade` | `facade_loader` | Facades |
| `_signal` (with `#[moodle_event]`) | `moodle_signal_loader` | Host event bridge |
| `#[item_type]` or `TYPE` | `type_loader` | Item types |
| `#[on]` | `signal_loader` | Signal handlers via attribute |

Domains the legacy `service_loader` ignored (containing exclusively non-injectable types): `cli/`, `contract/`, `db/`, `deprecated/`, `dto/`, `entity/`, `enum/`, `exception/`, `fixture/`, `interface/`, `legacy/`, `templates/`, `tests/`, `trait/`, `value_object/`. Notably **not** ignored despite looking like plain data folders: `base/`, `model/`, `domain/`, `view/`, `widget/`, `facade/` — the class-name suffix decides registration, never the folder.

External plugins needed only a `lib.php`-style hook to register their extension directories for non-native distributions; the rest (`extend_..._service_loader`, `extend_..._register_item_types`, `extend_..._moodle_signal_loader`) were optional. This whole mechanism reads a specific host's plugin registry by construction, so it is host-adapter territory and does not appear in this framework's own discovery engine.

## Boot-failure policy (shipped, current)

A module `boot()` failure is caught by `ContainerFactory::bootModules()` and handed to the bound `BootFailurePolicyInterface`:

| Implementation | Behaviour |
|---|---|
| `BootRethrowFailurePolicy` | Re-throws immediately — fail loud |
| `BootIsolateFailurePolicy` | Logs at `critical`, does not re-throw — the module is skipped, the rest of the boot loop continues |

A consumer binds whichever policy fits its own governance model (or writes its own) — the framework holds no fixed distribution taxonomy. `FailedModuleRegistryInterface` (`register()`/`has()`/`all()`) is the current, framework-agnostic descendant of the legacy `kernel::failed_extensions()` registry: it carries a plain `distribution` string per failure with no opinion on its meaning, for a consumer to inspect programmatically after boot.

**A `register()`-phase failure is not routed through any policy** — `ContainerFactory::build()` does not wrap `$bootstrap->configure()` or `ServiceProvider::register()` in a try/catch, so it always propagates as an ordinary PHP exception. Only `boot()` failures go through `BootFailurePolicyInterface`.

## Boot-failure policy — legacy distribution mapping (legacy)

| Legacy distribution | Failure in `boot()` | Current OSS equivalent |
|---|---|---|
| `NATIVE` | Propagates immediately — fatal, the team fixes it before deploy | `BootRethrowFailurePolicy` |
| `PRO` | Propagates immediately — same responsibility as `NATIVE` | `BootRethrowFailurePolicy` |
| `THIRD_PARTY` | Isolated and logged — extension disabled, product keeps running | `BootIsolateFailurePolicy` |
| `CUSTOM` | Isolated and logged — same treatment as `THIRD_PARTY` | `BootIsolateFailurePolicy` |

A `register()` failure was **always** fatal regardless of distribution, matching the current framework's behaviour above. An extension under the host's own namespace defaulted to `NATIVE`; one loaded from an external plugin defaulted to `THIRD_PARTY`.

**Why the policy is mandatory dispatch, not a nice-to-have:** the legacy loaders originally caught `Throwable` silently through a debug-trace helper — invisible whenever debugging was off, and a direct contradiction of the "lateral never means automatically suppressed" rule elsewhere in the reactive model (see the [signal & hook reference](./signal-hook-legacy-mechanics.md)). `BootFailurePolicyInterface` exists specifically to close that silent-swallowing bug.

**Runtime-only, honestly incomplete legacy mechanism, worth knowing before assuming parity:** a caught failure marked the extension `disabled_by_error` for that runtime only — no flag was ever persisted to storage or config. The ADR-609 body itself claimed an admin would see an inline notification "on the next visit to the MIDDAG panel," but its own reference companion stated plainly that no such notification was ever built — the real mechanism was always the logger plus the failed-extensions registry, consulted programmatically or by hand. Don't assume a UI alert exists just because a decision record once described one.

## Legacy entry points (legacy)

| Entry point | Role | Context |
|---|---|---|
| `index.php` | Page routing and REST API | UI navigation and endpoints |
| `webhook.php` | Inbound external requests | Callbacks from external services (payment gateways) |
| `ajax.php` | Internal frontend requests | AJAX calls from the product's own JS |

All three delegated to `kernel::handle()`. A known, never-fixed limitation: an external plugin registering controllers only got routes nested under the host plugin's own entry-point path, losing its own URL identity — a "Developer Kit" with delegated entry points was the planned fix, never shipped. Where the adapter triggers boot in the host (a Moodle callback/`setup` step, a WordPress `plugins_loaded`/`init` hook) remains the adapter's own responsibility today, not something this framework prescribes.

## Anti-patterns

| Anti-pattern | Why it's wrong |
|---|---|
| Resolving from the container inside `register()` | `register()` is the structural, bindings-only phase; resolving there assumes services that may not exist yet. |
| Declaring a new binding inside `boot()` | Bindings must be closed before `boot()` runs — `compile()` freezes the graph on the assumption nothing declares after `register()`. |
| `new {Service}()` inside `boot()` instead of resolving through the container | Bypasses the container entirely, defeating autowiring, testability, and the synthetic/facade wiring that depends on going through it. |
| A circular dependency declaration | Rejected at compile time by design — refactor (setter injection, an intermediate factory, a responsibility split), don't reach for a lazy-proxy workaround. |
| Treating an isolate-tier failure as a rethrow-tier one (or omitting a policy) | Takes the whole host down for a failure that was supposed to be contained to one module. |
| Catching a module's `boot()` exception yourself instead of letting `BootFailurePolicyInterface` handle it | Hides a genuinely structural failure and bypasses the failed-module registry a consumer may depend on for visibility. |
| Continuing to use a module in the same request after its `boot()` has already failed | The module's state is unknown past that point — isolation means "skip it," not "keep partially using it." |
| Relying on ad hoc debug tracing instead of the logger/`FailedModuleRegistryInterface` for boot-failure visibility | Invisible whenever debugging is off — the exact failure mode `BootFailurePolicyInterface` exists to close. |
