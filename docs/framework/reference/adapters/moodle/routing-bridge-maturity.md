---
title: 'Moodle Adapter — Routing Bridge & Component Maturity'
---

# Routing Bridge Component Maturity

Reference for the Moodle adapter's (`middag-io/moodle`, [middag-php-moodle](https://github.com/middag-io/middag-php-moodle)) routing: which pieces are the framework's own router adapted to Moodle, which are the bridge to Moodle's native router, and the code-verified maturity of each. Verified against `middag-php-moodle` `main@6aae04d` on 2026-11-04.

## The model

The framework's router is the **primary** router for every controller, on every Moodle version. Moodle ships its own router (Slim 4 and FastRoute, entry point `/r.php`, classes under `core\router`), already present in Moodle 5.0 builds. The adapter gates its bridge to that router at Moodle 5.1; on 5.1+ the native router can optionally receive thin proxy routes that forward to the same framework kernel, so both paths converge on one dispatch.

- Discovery is by namespace convention: Moodle scans the **consumer plugin's** `route\api\*` and `route\controller\*` namespaces (files under `classes/route/api/`). The proxies live there, not in this package.
- Availability is version-gated: `RouterBridgeSupport::isAvailable()` is `false` below 5.1 (routing only through the consumer's own entry points) and `true` on 5.1+ when `core\router\route_loader_interface` exists.
- What does not change: the consumer's entry points (`index.php`, `ajax.php`, and any webhook endpoint) stay primary; existing controllers need no change; the framework container keeps resolving controllers; Moodle's own middleware pipeline is fixed and outside this decision.
- An extension that specifically needs Moodle's middleware (CORS, `wstoken`), visibility only in the Mobile App, or a place in Moodle's native OpenAPI spec may write a Moodle-native route itself, outside the framework kernel, and reach framework services through the [DI bridge](./di-bridge-mechanics).

On 5.1+, the consumer's OpenAPI spec is reachable through Moodle's native Swagger UI (`getOpenapiJsonUrl()`, `getOpenapiYamlUrl()`).

## Component maturity at a glance

| Component | File(s) | Status | Notes |
|---|---|---|---|
| Framework's own router | `src/Http/Routing/MoodleRouter.php`, `src/Http/Routing/RouteLoader.php` | **Coded, always active** | Not part of the native-router bridge at all — this is the framework's primary routing mechanism, adapted to the Moodle host. Active regardless of Moodle version. |
| `RouterBridgeSupport::isAvailable()` | `src/Support/RouterBridgeSupport.php` | **Coded, active** | Checks `VersionSupport::supports('moodle_router', FEATURE_MATRIX)` (gated `since => '5.1'`) plus `VersionSupport::symbolExists('core\router\route_loader_interface')`. |
| `RouterBridgeSupport::register()` | same | **Coded, active (correct no-op)** | Moodle 5.1+ auto-discovers routes from the *consumer plugin's* `route\api\*`/`route\controller\*` namespaces — there is nothing for this OSS adapter to register programmatically. This is accurate behavior, not an unfinished implementation. |
| `RouterBridgeSupport::getOpenapiJsonUrl()` / `getOpenapiYamlUrl()` | same | **Coded, active** | Build a URL from `$CFG->wwwroot` + `ComponentContext::baseUrlPath()`. No availability guard inside these methods themselves — the caller is expected to check `isAvailable()` first. |
| `RouterBridgeSupport::proxyRequest()` | same | **Coded, active** | See "`proxyRequest()` behaviour" below. |
| `MiddagProxy` | `src/Http/Routing/MiddagProxy.php` | **Inert placeholder (`@internal`)** | 37-line file, entire body is `final class MiddagProxy {}`. Its docblock waits on Moodle's `core\router\route_controller` trait, which Moodle core already ships (a Moodle 5.0.9 build has both `core\router\route_controller` and `core\router\route_loader_interface` in `lib/classes/router/`). The adapter has not adopted the trait and still gates the bridge at 5.1, so Moodle's router does not see the class today; the 5.1 gate may be stale. |

## `MoodleRouter` / `RouteLoader` — the framework's own router

Independent of the native-router bridge and never a stub:

- `MoodleRouter` (`Middag\Moodle\Http\Routing\MoodleRouter`, implements `Middag\Moodle\Http\Contract\RouterInterface`) is a Symfony Routing–based router: holds a `RouteCollection`, resolves the request context from globals, registers a default `route_not_found` route plus global regex requirements, and generates URLs through `PluginAwareUrlGenerator`.
- It derives its entry point from the running host component via `ComponentContext::baseUrlPath()` (e.g. `/local/middag/index.php`), so the adapter never hardcodes a product.
- `RouteLoader` (implements the framework's `RouteLoaderInterface`) reflects controller classes for `#[Route]` attributes and builds the `RouteCollection`. It also detects external-plugin controllers by namespace and injects `_plugin_base` (`ajax.php` for `AbstractApiController` subclasses, `index.php` otherwise) so `PluginAwareUrlGenerator` produces correct cross-plugin URLs.

Confusing this pair with the Moodle-native-router bridge (because of the `MoodleRouter` name) is a common misreading — they are unrelated mechanisms.

## `proxyRequest()` behaviour

`proxyRequest(object $request, object $response, string $path = ''): object` dispatches `/api/{path}` through `Kernel::handleReturning(): ResponseInterface`, the same dispatch path as a normal page load minus the emit step. It then copies the status, headers and body of the returned `ResponseInterface` onto the response object Moodle's router supplied, with no output buffering. `tests/Support/RouterBridgeSupportCoverageTest.php` covers the forwarding path with stubs.

## Version-guard cross-reference

Ties to the native-router row of the [version gates](./api-coverage-inventory#version-gates-in-the-code): `VersionSupport::supports('moodle_router', ['since' => '5.1'])` and `VersionSupport::symbolExists('core\router\route_loader_interface')`, via `RouterBridgeSupport::isAvailable()`. That guard governs `RouterBridgeSupport` and `MiddagProxy`; it does not gate the framework's own router (`MoodleRouter`/`RouteLoader`), which has no Moodle-version dependency of its own.

## Enforcement state

| Clause                                                                       | Verification                                                                 | State       |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------- |
| The framework router (`MoodleRouter`, `RouteLoader`) stays primary           | This page                                                                    | **coded**   |
| `RouterBridgeSupport` works on Moodle 5.1+                                   | `tests/Support/RouterBridgeSupportCoverageTest.php` | **coded**   |
| Availability gated below 5.1                                                 | `RouterBridgeSupport::isAvailable()`                                         | **coded**   |
| `MiddagProxy` adopts `core\router\route_controller` (now present in Moodle 5.0.9) | Manual re-check against each Moodle core bump                                | **planned** |

---

Decision record: MDL-017 in [`middag-php-moodle/docs/decisions`](https://github.com/middag-io/middag-php-moodle/tree/main/docs/decisions).
