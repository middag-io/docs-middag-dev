---
title: 'Hooks — Public Surface and Naming'
---

# Hooks — Public Surface and Naming

Reference for the WordPress-style filter/action hooks `middag-io/framework` ships, which members are extension API and which are wiring, and how hook names are formed across the ecosystem. Backs [FW-007](https://github.com/middag-io/middag-php-framework/blob/main/docs/decisions/FW-007-signal-hook-reactive-model.md). For the legacy signal mechanics and the governed engine that is not shipped here, see [Hooks, Filters & Signal Dispatch](./signal-hook-legacy-mechanics).

## What the framework ships

| Piece | Stability | Role |
| --- | --- | --- |
| [`HookManagerInterface`](https://github.com/middag-io/middag-php-framework/blob/main/src/Kernel/Contract/HookManagerInterface.php) | `@api` | The extension contract: filters (transform a value, return it) and actions (side effects, no return). |
| [`HookManager`](https://github.com/middag-io/middag-php-framework/blob/main/src/Kernel/Manager/HookManager.php) | `@api` | The default in-memory implementation. Per-instance registry: no static state, so each container (and each test) gets its own. |
| [`HookFacade`](https://github.com/middag-io/middag-php-framework/blob/main/src/Kernel/Facade/HookFacade.php) | `@api` | Static proxy over the `HookManagerInterface` service, for `HookFacade::addAction(...)` call sites. |
| [`HookRegisterInterface`](https://github.com/middag-io/middag-php-framework/blob/main/src/Kernel/Contract/HookRegisterInterface.php) | `@api` | A class that registers its listeners in a static `register()`. |
| [`HookfileLoaderInterface`](https://github.com/middag-io/middag-php-framework/blob/main/src/Kernel/Contract/HookfileLoaderInterface.php) | `@api` | Discovers and loads hookfiles (plain PHP files that register listeners at boot). A failing hookfile is suspended and logged, not propagated. |
| `AbstractHookRegister`, `HookfileLoader` | `@internal` | Base classes behind the two contracts above. `AbstractModule::registerHooks()` discovers `*Hooks` classes; adapters subclass `HookfileLoader` with their own path discovery. |
| [`HostEventBridgeInterface`](https://github.com/middag-io/middag-php-framework/blob/main/src/Kernel/Contract/HostEventBridgeInterface.php) | `@api` | Synchronous broadcast of named host events to void listeners. Implemented by the adapters, not by the framework. |
| [`SignalDispatcherInterface`](https://github.com/middag-io/middag-php-framework/blob/main/src/Bus/Contract/SignalDispatcherInterface.php) | `@api` | Publish-side contract for object signals. No implementation ships in the framework. |

The framework does not bind `HookManagerInterface` in the container by default; the host's bootstrap binds `HookManager` (or its own implementation).

## `HookManagerInterface` members

| Group | Members | Who calls them |
| --- | --- | --- |
| Register and detach | `addAction`, `removeAction`, `addFilter`, `removeFilter` | Extensions |
| Emit | `doAction`, `applyFilters` | Extensions, adapters |
| Introspect | `hasAction`, `hasFilter`, `currentFilter`, `doingAction`, `didAction` | Extensions |
| Lifecycle | `reset` | Tests and long-running workers only; it clears the whole registry and is not an extension point |

`addAction`/`addFilter` take a priority (lower runs first, default `10`) and an accepted-argument count (default `1`). `removeAction`/`removeFilter` detach by identity: pass back the same closure instance or `[object|class, method]` reference that was registered, at the same priority.

Present on the concrete `HookManager` and deliberately absent from the interface (host wiring, not extension API): the constructor (`?LoggerInterface $logger`, `int $slowThresholdMs = 100`), `setProfileCollector()`, `setSlowThreshold()` and `setLogger()`.

## Behaviour

- **Ordering.** Callbacks run by ascending priority, then registration order within a priority.
- **No exception swallowing.** `doAction` and `applyFilters` wrap no try/catch around callbacks. A callback's exception propagates like any PHP exception; a listener that must not break its caller handles its own failures (`HookManagerTest::testDoActionDoesNotSwallowCallbackExceptions`, `::testApplyFiltersDoesNotSwallowCallbackExceptions`).
- **Re-entrancy is not blocked.** As in WordPress, a listener breaks a loop itself: detach with `removeAction()` before re-dispatching and re-attach after, or refuse re-entry with `doingAction($tag)`.
- **Slow-callback warning.** Each callback is timed; one slower than the threshold (default 100 ms, `0` disables) logs a PSR-3 `warning` through the injected logger.
- **Profiling.** With a `ProfileCollectorInterface` attached, every fired tag is recorded under category `hook` with its kind (`action` or `filter`) and duration. See [Logging & observability](./logging-and-observability).

## Hook names

`HookManager` accepts any string as a tag and validates none: the framework has no naming guard and no naming-policy seam for hooks. Names follow the ecosystem convention that the code already uses: **a `middag/` prefix and `/`-separated segments, general to specific**.

| Source | Name produced | Where |
| --- | --- | --- |
| Named host event through the WordPress adapter | `middag/{event}`, e.g. `middag/quote.created` (the prefix is a constructor argument) | `WpHostEventBridge` in `middag-php-wordpress` |
| Named host event through the Moodle adapter | the event name as given, on the framework `HookManager` | `MoodleHostEventBridge` in `middag-php-moodle` |
| Aggregate signal bridged to hooks by the governed signal layer downstream | `middag/{aggregate}/{action}`, then `middag/{aggregate}/{action}/{type}` when the signal has a type (general fires before specific) | downstream proprietary signal layer |
| Any other signal bridged to hooks downstream | the signal's FQCN with `\` replaced by `/` | downstream proprietary signal layer |

Host event names passed to `HostEventBridgeInterface` are dot-separated (`organization.created`); the adapter decides how they map onto host hooks. A dotted `{component}.{area}.{event}` hook-tag convention with an enforcing guard test was specified on 2026-07-24 but never implemented; no code reads such a policy, so it is not a rule.

## Reactive layers compared

| Layer | Input | Output | Ships here |
| --- | --- | --- | --- |
| `HookManager` filters | a value and arguments, by tag | the transformed value | Yes |
| `HookManager` actions | arguments, by tag | nothing | Yes |
| `HostEventBridgeInterface` | a dot-separated event name and a positional payload | nothing | Contract only; adapters implement it |
| `SignalDispatcherInterface` | any object | the same object, possibly modified | Contract only; governed dispatch, hierarchy, outbox and re-entrance guard live downstream |

Explicit units of work (as opposed to reacting to something that already happened) go through the [command bus](./command-bus), not through hooks.

Verified against `middag-php-framework/main@c9daec5`, `middag-php-wordpress/main` and `middag-php-moodle/main` on 2026-11-04.
