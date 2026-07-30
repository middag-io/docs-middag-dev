---
title: 'Bootstrap Lifecycle & Tier Responsibilities'
---

# Bootstrap Lifecycle & Tier Responsibilities

How the MIDDAG kernel boots a product — from container registration through module boot — and how responsibility for each part of that sequence splits across the adapter, core, and product layers. See [Bootstrap — Built-in Features & Adapter Contracts](../reference/bootstrap-contracts) for the concrete feature and contract lookup tables this page assumes, and [FW-012](https://github.com/middag-io/middag-php-framework/blob/docs/docs/decisions/FW-012-kernel-boot-lifecycle.md) for the decision this lifecycle enforces.

## The boot sequence

`Kernel/ContainerFactory::build(BootstrapInterface $bootstrap, array $synthetics = [], ?string $projectRoot = null)` runs, in order:

1. `registerSyntheticDefinitions()` — declares placeholders for `ContainerInterface` and whichever synthetics the caller passed in.
2. `$bootstrap->configure($builder)` — the **adapter** registers the host's own services.
3. `ServiceProvider::register()` — suffix-based auto-discovery, run only when `$projectRoot` is not null.
4. `$container->compile()` — freezes the dependency graph; every definition becomes immutable from this point on.
5. `set()` for each synthetic — injects the runtime instances the host provides (e.g. its own `$DB`).
6. `AbstractFacade::setFacadeContainer()` — wires the compiled container into the facade layer.

`bootModules($modules)` is a distinct, later step: it runs each module's `ModuleInterface::boot()` under whichever `BootFailurePolicyInterface` was configured.

**The frozen-container invariant.** Once `compile()` has run, no code may add a definition or trigger new autowiring — the graph is frozen. The one operation still allowed post-compile is `set()` on a *synthetic*, i.e. a placeholder declared back in step 1. Calling `addSynthetic()` after `build()` has already completed throws `MiddagLifecycleViolationException`, specifically so this boundary fails hard instead of silently doing nothing.

## Host context: a registry outside the container, not a synthetic

The host's composition root calls `HostContext::set()` exactly once during bootstrap, before any Inertia/bootstrap logic reads it. Two things are worth making explicit:

- `HostContext` is a **composition-root registry**, not a synthetic in the DI graph. Static adapter helpers that live outside the container read the active context through `HostContext::get()`; when no host has configured one, that call returns `null`, so those callers degrade gracefully instead of throwing.
- `HostComponentContextInterface::componentName()` and `ComponentNameResolverInterface::nativeComponent()` both surface the same underlying value — the identifier of the host component that owns the boot cycle (a Moodle frankenstyle like `local_example`, or a WordPress plugin slug) — but for different consumers. `nativeComponent()` exists purely so `BootRethrowFailurePolicy` can classify a failing class as native vs. third-party during fatal-boot isolation. `componentName()` exposes that same identity as one field of a broader neutral runtime-context descriptor (alongside `assetVersion()` and `basePath()`) that adapter helpers read through `HostContext`. The two contracts overlap only on the identifier value — they are resolved and registered independently because they serve different seams.

## Wiring a product's bootstrap

The **product** — the composition root, e.g. `local_middag` — is what chooses which bootstrap to use, in code rather than config, because it is the one piece that knows which host it runs on:

```php
// The product's AppBootstrap (illustrative)
$bootstrap = new MoodleBootstrap(...);              // the target host's adapter

if ($bootstrap->maintenanceGate()->isUnderMaintenance()) {
    return;                                          // host upgrading → MIDDAG does not boot
}

$factory = new ContainerFactory(
    logger: $logger,
    failurePolicy: new BootIsolateFailurePolicy($logger),   // prod: do not take the host down
);
(new FatalErrorHandler($logger, $profile, debug: false))->register();  // no white screen
$shutdown = new ShutdownCleanup($logger);
$shutdown->register();

$container = $factory->build($bootstrap, $synthetics, $bootstrap->getProjectRoot());
$factory->bootModules($modules);
```

Two things vary outside this shape:

- **Standalone** (no host at all): `StandaloneKernel` is the HTTP entry point, wired with a minimal `BootstrapInterface` whose `platform()` returns `'standalone'`, and `NullMaintenanceGate` as the gate.
- **Where the adapter triggers this inside the host** differs by platform — a Moodle callback / `setup`, a WordPress `plugins_loaded` / `init` hook — and is the adapter's own responsibility, still to be confirmed once each adapter is actually built.

## Tier responsibilities

- **Adapter:** implements the bridge contracts (see the reference doc linked above); binds `BootIsolateFailurePolicy`; registers `FatalErrorHandler` / `ShutdownCleanup`; decides where in the host it injects itself.
- **Core:** subclasses `ServiceProvider` and modules for cross-cutting concerns (signal, job, EAV, multi-tenant); binds a governed boot policy; never imports an adapter.
- **Product:** owns the `AppBootstrap` shown above — wires framework + core + adapter together, marks heavy services `#[Lazy]`, and registers `addCleanup()` for every resource it opens.

## Known limitations

- **Multi-plugin collision.** PHP does not isolate classes per plugin, so two MIDDAG-based products at different versions installed on the same host will collide. The real mitigation lives at the product's build step — PHP-Scoper or Mozart prefixing the `Middag\` namespace — not in this framework. The framework helps by avoiding global `static` state, so per-instance state doesn't leak across the two installs, but it does not solve the double-autoload problem itself. Whichever guide a product team follows when installing two MIDDAG products side by side on one host needs to spell this out.
- **No global recovery around `compile()`.** `ContainerFactory::build()` has no try/catch wrapping `compile()` itself. The `FatalErrorHandler` shutdown handler covers the boot fatal, but there is no per-service, granular recovery at compile time if a single definition is broken.
