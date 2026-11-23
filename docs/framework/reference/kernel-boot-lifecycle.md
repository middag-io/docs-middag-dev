---
title: 'Kernel Boot Lifecycle — Discovery, Phases & Failure Policy'
---

# Kernel Boot Lifecycle — Discovery, Phases & Failure Policy

Reference for `middag-io/middag-php-framework`'s kernel boot pipeline: the container's phase model, its convention-based service discovery, the pluggable boot-failure policy. Backs [FW-012](https://github.com/middag-io/middag-php-framework/blob/main/docs/decisions/FW-012-kernel-boot-lifecycle.md).

## The boot pipeline

`Kernel/ContainerFactory::build()` runs six steps, then a separate call boots modules:

1. Register synthetic-service placeholders (`registerSyntheticDefinitions()`).
2. `$bootstrap->configure($container)` — the adapter registers host services.
3. `ServiceProvider::register()` — suffix-based auto-discovery (only when a project root is given).
4. `$container->compile()` — freezes the dependency graph.
5. Inject each registered synthetic instance (`set()`).
6. `AbstractFacade::setFacadeContainer()`.

`bootModules($modules)` is a distinct, later call: it runs each module's `boot()` under the configured `BootFailurePolicyInterface`.

### Phase order

The container is compiled and frozen **before** any module boots. The order is register → compile → boot, not register → boot → compile:

| Phase | When | May | May not |
|---|---|---|---|
| Register | Inside `build()`, before `compile()`: synthetic placeholders, `BootstrapInterface::configure()`, `ServiceProvider::register()` | Declare container bindings and services | Resolve services; touch another module |
| Compile | `build()` step 4, kernel only | Freeze the graph, inject synthetics, wire facades | — |
| Boot | `bootModules()`, after `build()` returns | Resolve from the container, register hooks, controllers and subscribers, use another module's registered services | Declare or modify a binding (the graph is frozen) |

`ContainerFactory` never calls `ModuleInterface::register()`; a host that uses module-level registration calls it from its own bootstrap before `build()` compiles. `bootModules()` calls only `boot()`, in the order the caller passes (`ModuleInterface::getDependencies()` names the modules that must boot first; ordering them is the caller's job).

**What's actually code-enforced today:** only the `compile()` freeze boundary. `ContainerFactory::addSynthetic()` throws `MiddagLifecycleViolationException` if called after `build()` — that's the one phase rule with a runtime guard and a test (`ContainerFactoryLifecycleTest::addSyntheticAfterBuildThrowsLifecycleViolation`). The `register()`-must-not-resolve / `boot()`-must-not-bind split is a design discipline for `ModuleInterface` implementers, not (yet) a lint rule or runtime check; after `compile()` Symfony itself rejects changes to a frozen `ContainerBuilder`.

**Circular dependencies** are rejected at compile time by Symfony's own `ContainerBuilder::compile()` (`CheckCircularReferencesPass`) — no lazy-proxy escape hatch is offered; a cycle means refactoring the design (setter injection, an intermediate factory, a responsibility split), not wrapping the dependency in a proxy.

## Modules

[`ModuleInterface`](https://github.com/middag-io/middag-php-framework/blob/main/src/Kernel/Contract/ModuleInterface.php) (`@api`, base class `AbstractModule`) is the generic module contract: `getName()`, `getLabel()`, `getVersion()`, `getDependencies()`, `register()`, `boot()`, `isEnabled()`, `isAvailable()`. `AbstractModule` adds `registerControllers()` and `registerHooks()`, which discover `*Controller` and `*Hooks` classes. The legacy MIDDAG "Extension" vocabulary (`REQUIRES`, `DISTRIBUTION`, `GROUP`, `PRIORITY`, dependency cascades, distribution-aware failure policy) is not part of this contract; platform module interfaces in the adapters and the governed extension surface downstream extend it.

## Discovery by suffix

`Kernel/ServiceProvider` scans configured directories under `{projectRoot}/src` and registers any class whose name ends in one of these suffixes, with autowiring enabled:

| Register suffixes | Ignore suffixes (never registered) | Ignore directories (skipped entirely) |
|---|---|---|
| `Service`, `Repository`, `Controller`, `Adapter`, `Handler`, `Hooks`, `Router`, `Builder`, `Factory`, `Registrar`, `Mapper`, `Manager`, `Provider`, `Resolver`, `Validator`, `Dispatcher` | `Entity`, `Interface`, `Trait`, `Enum`, `DTO`, `Dto`, `Exception`, `Signal`, `Event` | `Contract`, `Entity`, `Enum`, `Exception`, `Trait`, `ValueObject`, `DTO`, `Dto` |

A single-interface implementation is auto-aliased so it can be resolved by its interface. Scanned code must live under `{projectRoot}/src`, and the provider's root namespace must map to that tree's PSR-4 root — otherwise the derived FQCN fails `class_exists()` and discovery silently registers nothing for that file.

## Boot-failure policy

A module `boot()` failure is caught by `ContainerFactory::bootModules()` and handed to the bound `BootFailurePolicyInterface`:

| Implementation | Behaviour |
|---|---|
| `BootRethrowFailurePolicy` | Re-throws immediately — fail loud |
| `BootIsolateFailurePolicy` | Logs at `critical`, does not re-throw — the module is skipped, the rest of the boot loop continues |

`ContainerFactory` defaults to `BootRethrowFailurePolicy` when no policy is passed. A consumer binds whichever policy fits its own governance model (or writes its own) — the framework holds no fixed distribution taxonomy. `FailedModuleRegistryInterface` (`register()`/`has()`/`all()`) is the current, framework-agnostic descendant of the legacy `kernel::failed_extensions()` registry: it carries a plain `distribution` string per failure with no opinion on its meaning, for a consumer to inspect programmatically after boot.

**A `register()`-phase failure is not routed through any policy** — `ContainerFactory::build()` does not wrap `$bootstrap->configure()` or `ServiceProvider::register()` in a try/catch, so it always propagates as an ordinary PHP exception. Only `boot()` failures go through `BootFailurePolicyInterface`.

## Anti-patterns

| Anti-pattern | Why it's wrong |
|---|---|
| Resolving from the container inside `register()` | `register()` is the structural, bindings-only phase; resolving there assumes services that may not exist yet. |
| Declaring a new binding inside `boot()` | `boot()` runs after `compile()` has frozen the graph; bindings belong to the register phase. |
| `new {Service}()` inside `boot()` instead of resolving through the container | Bypasses the container entirely, defeating autowiring, testability, and the synthetic/facade wiring that depends on going through it. |
| A circular dependency declaration | Rejected at compile time by design — refactor (setter injection, an intermediate factory, a responsibility split), don't reach for a lazy-proxy workaround. |
| Treating an isolate-tier failure as a rethrow-tier one (or omitting a policy) | Takes the whole host down for a failure that was supposed to be contained to one module. |
| Catching a module's `boot()` exception yourself instead of letting `BootFailurePolicyInterface` handle it | Hides a genuinely structural failure and bypasses the failed-module registry a consumer may depend on for visibility. |
| Continuing to use a module in the same request after its `boot()` has already failed | The module's state is unknown past that point — isolation means "skip it," not "keep partially using it." |
| Relying on ad hoc debug tracing instead of the logger/`FailedModuleRegistryInterface` for boot-failure visibility | Invisible whenever debugging is off — the exact failure mode `BootFailurePolicyInterface` exists to close. |
