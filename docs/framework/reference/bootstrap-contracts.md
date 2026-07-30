---
title: 'Bootstrap — Built-in Features & Adapter Contracts'
---

# Bootstrap — Built-in Features & Adapter Contracts

Reference for what `middag-io/framework`'s kernel already wires at boot, and the bridge contracts a host adapter (Moodle, WordPress) must implement to plug a host in. See [Bootstrap Lifecycle & Tier Responsibilities](../explanation/bootstrap-lifecycle) for how these pieces fit together during `ContainerFactory::build()`, and [FW-012](https://github.com/middag-io/middag-php-framework/blob/docs/docs/decisions/FW-012-kernel-boot-lifecycle.md) for the underlying decision.

## Built-in boot-time features

| Feature | Symbol | OSS default |
|---|---|---|
| Phased, compiled DI container (PSR-11) | `ContainerFactory` | Symfony `ContainerBuilder` |
| Service auto-discovery by class-name suffix | `ServiceProvider` (`*Service`, `*Repository`, `*Controller`, …) | Scans `{projectRoot}/src` |
| Single-interface auto-alias to implementation | `ServiceProvider::registerInterfaceAliases()` | On |
| Synthetics (host globals injected post-compile) | `addSynthetic()` / `setSynthetic()` | `ContainerInterface` |
| Lazy services (ghost proxy, built on first use) | `#[Lazy]` + `LazyServiceInstantiator` | On (no-op unless `#[Lazy]` is used) |
| Fatal boot isolation | `BootFailurePolicyInterface` | `BootRethrowFailurePolicy` (dev) / `BootIsolateFailurePolicy` (prod) |
| Real fatal-error guard (shutdown) | `Http/FatalErrorHandler` | Opt-in via `register()` |
| Resource cleanup on shutdown | `Kernel/ShutdownCleanup` | Opt-in via `register()` |
| Host maintenance gate | `MaintenanceGateInterface` | `NullMaintenanceGate` (never under maintenance) |
| Facades (testable static proxy) | `AbstractFacade` (`swap()` / `reset()`) | On |
| 12-factor config | `ConfigResolverInterface` | `EnvConfigResolver` |
| Form pipeline (validation + Inertia) | `ServiceProvider::registerFormDefaults()` | Bound, overridable |

## Adapter bridge contracts

An adapter is what plugs a specific host into the kernel. It implements:

| Contract | Responsibility | Moodle (ref.) | WordPress (ref.) |
|---|---|---|---|
| `BootstrapInterface` | Register host services; define `platform()` / `getProjectRoot()` | `MoodleBootstrap` | `WordPressBootstrap` |
| `ConnectionAdapterInterface` | Expose `$DB` / `$wpdb` as a connection | `MoodleConnectionAdapter` | `WpdbConnectionAdapter` |
| `MaintenanceGateInterface` | Report the host as under upgrade/maintenance | `$CFG->upgraderunning \|\| during_initial_install()` | `wp_is_maintenance_mode()` |
| `ConfigResolverInterface` | Resolve host configuration | `MoodleConfigResolver` | `WpConfigResolver` |
| `UserContextResolverInterface` | Resolve host user identity | `MoodleUserContext` | `WpUserContext` |
| `TranslatorInterface` | Host i18n | `get_string()` wrapper | `__()` wrapper |
| `HostEventBridgeInterface` *(experimental)* | Translate an event to/from a native hook — in practice, the core signal layer is what gets used | — | — |
| `HostComponentContextInterface` | Neutral host-component identity (`componentName()`, `assetVersion()`, `basePath()`), registered once by the composition root via `HostContext::set()` | `MoodleHostContext` | `WpComponentContext` |

> The concrete classes named above (`MoodleBootstrap` / `WordPressBootstrap`, `MoodleHostContext` / `WpComponentContext`, and the rest of the "ref." columns) live in the adapter repos — `middag-php-moodle` and `middag-php-wordpress` — not in this framework repo. As of this writing those adapters have not been built yet; this table documents the contract surface they are expected to implement.
