---
title: 'Bootstrap — Built-in Features & Adapter Contracts'
---

# Bootstrap — Built-in Features & Adapter Contracts

Reference for what `middag-io/framework`'s kernel already wires at boot, and the bridge contracts a host adapter (Moodle, WordPress) must implement to plug a host in. See [Bootstrap Lifecycle & Layer Responsibilities](../explanation/bootstrap-lifecycle) for how these pieces fit together during `ContainerFactory::build()`, and [FW-012](https://github.com/middag-io/middag-php-framework/blob/main/docs/decisions/FW-012-kernel-boot-lifecycle.md) for the underlying decision.

## Built-in boot-time features

| Feature | Symbol | OSS default |
|---|---|---|
| Phased, compiled DI container (PSR-11) | `ContainerFactory` | Symfony `ContainerBuilder` |
| Service auto-discovery by class-name suffix | `ServiceProvider` (`*Service`, `*Repository`, `*Controller`, …) | Scans `{projectRoot}/src` |
| Single-interface auto-alias to implementation | `ServiceProvider::registerInterfaceAliases()` | On |
| Synthetics (host globals injected post-compile) | `addSynthetic()` / `setSynthetic()` | `ContainerInterface` |
| Lazy services (ghost proxy, built on first use) | framework `#[Lazy]` (shadows Symfony's) + Symfony `LazyServiceInstantiator` | On (no-op unless `#[Lazy]` is used) |
| Fatal boot isolation | `BootFailurePolicyInterface` | `BootRethrowFailurePolicy` when none is passed to `ContainerFactory`; `BootIsolateFailurePolicy` is opt-in |
| Real fatal-error guard (shutdown) | `Http/FatalErrorHandler` | Opt-in via `register()` |
| Resource cleanup on shutdown | `Kernel/ShutdownCleanup` | Opt-in via `register()` |
| Host maintenance gate | `MaintenanceGateInterface` | `NullMaintenanceGate` (never under maintenance) |
| Facades (testable static proxy) | `AbstractFacade` (`swap()` / `reset()`) | On |
| 12-factor config | `ConfigResolverInterface` | `EnvConfigResolver` |
| Logging defaults (`#[LogChannel]` resolvable) | `ServiceProvider::registerLoggingDefaults()` | Disabled `LoggerFactory` (every channel is a `NullLogger`) until the app rebinds it |
| Form pipeline (validation + Inertia) | `ServiceProvider::registerFormDefaults()` | Bound, overridable |

## Adapter bridge contracts

An adapter plugs a specific host into the kernel by implementing the framework's ports; the full port table, with the OSS default and the Moodle and WordPress implementations of each, is in [Bridge Contracts](./bridge-contracts). The ones every host bootstrap touches at boot:

| Contract | Responsibility at boot | Moodle | WordPress |
|---|---|---|---|
| `BootstrapInterface` | Register host services in `configure()`; report `platform()` and `getProjectRoot()` | `MoodleBootstrap` | `WpBootstrap` |
| `MaintenanceGateInterface` | Report the host as upgrading or in maintenance, so the product skips booting | `MoodleMaintenanceGate` | `WpMaintenanceGate` |
| `HostComponentContextInterface` | Neutral component identity (`componentName()`, `assetVersion()`, `basePath()`) | `MoodleHostContext`, registered with `HostContext::set()` | `WpComponentContext`, injected per plugin |

The concrete classes live in `middag-php-moodle` and `middag-php-wordpress`. A standalone app supplies its own `BootstrapInterface` (and can skip the container entirely for a worker; see [Standalone Runtime](./standalone-runtime)).
