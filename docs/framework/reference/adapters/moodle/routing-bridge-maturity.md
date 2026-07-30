---
title: 'moodle — Routing Bridge Component Maturity'
---

# Routing Bridge Component Maturity

Reference for the Moodle adapter's (`middag-io/middag-php-moodle`) routing setup: which pieces are the framework's own router, which are the Moodle-native-router bridge, and the code-verified maturity of each. Backs [MDL-017](https://github.com/middag-io/middag-php-moodle/blob/docs/docs/decisions/MDL-017-routing-bridge-coexistence.md).

## Component maturity at a glance

| Component | File(s) | Status | Notes |
|---|---|---|---|
| Framework's own router | `src/Http/Routing/MoodleRouter.php`, `src/Http/Routing/RouteLoader.php` | **Coded, always active** | Not part of the native-router bridge at all — this is the framework's primary routing mechanism, adapted to the Moodle host. Active regardless of Moodle version. |
| `RouterBridgeSupport::isAvailable()` | `src/Support/RouterBridgeSupport.php` | **Coded, active** | Checks `VersionSupport::supports('moodle_router', FEATURE_MATRIX)` (gated `since => '5.1'`) plus `VersionSupport::symbolExists('core\router\route_loader_interface')`. |
| `RouterBridgeSupport::register()` | same | **Coded, active (correct no-op)** | Moodle 5.1+ auto-discovers routes from the *consumer plugin's* `route\api\*`/`route\controller\*` namespaces — there is nothing for this OSS adapter to register programmatically. This is accurate behavior, not an unfinished implementation. |
| `RouterBridgeSupport::getOpenapiJsonUrl()` / `getOpenapiYamlUrl()` | same | **Coded, active** | Build a URL from `$CFG->wwwroot` + `ComponentContext::baseUrlPath()`. No availability guard inside these methods themselves — the caller is expected to check `isAvailable()` first. |
| `RouterBridgeSupport::proxyRequest()` | same | **Coded, active (fixed 2026-07-17)** | See "The 2026-07-17 fix" below. |
| `MiddagProxy` | `src/Http/Routing/MiddagProxy.php` | **Blocked — inert placeholder** | 37-line file, entire body is `final class MiddagProxy {}`. Waits on Moodle's `core\router\route_controller` trait, confirmed absent from the Moodle 5.0.7 checkout audited alongside this reference. Instantiating it under Moodle 5.0.x is a no-op; Moodle's router does not see it. |

## `MoodleRouter` / `RouteLoader` — the framework's own router

Independent of the native-router bridge and never a stub:

- `MoodleRouter` (`Middag\Moodle\Http\Routing\MoodleRouter`, implements `Middag\Moodle\Http\Contract\RouterInterface`) is a Symfony Routing–based router: holds a `RouteCollection`, resolves the request context from globals, registers a default `route_not_found` route plus global regex requirements, and generates URLs through `PluginAwareUrlGenerator`.
- It derives its entry point from the running host component via `ComponentContext::baseUrlPath()` (e.g. `/local/middag/index.php`), so the adapter never hardcodes a product.
- `RouteLoader` (implements the framework's `RouteLoaderInterface`) reflects controller classes for `#[Route]` attributes and builds the `RouteCollection`. It also detects external-plugin controllers by namespace and injects `_plugin_base` (`ajax.php` for `AbstractApiController` subclasses, `index.php` otherwise) so `PluginAwareUrlGenerator` produces correct cross-plugin URLs.

Confusing this pair with the Moodle-native-router bridge (because of the `MoodleRouter` name) is a common misreading — they are unrelated mechanisms.

## The 2026-07-17 `proxyRequest()` fix

`proxyRequest(object $request, object $response, string $path = ''): object` was, until this pass, the one method in `RouterBridgeSupport` still carrying stub behavior:

| | Before | After |
|---|---|---|
| Docblock claim | Blamed a pending "ADR-208" migration ("`http_kernel::handle()` calls `Response::send()` internally") | Removed — that migration had already shipped |
| Dispatch call | `Middag\Moodle\Runtime\Kernel::handle()` — a void-returning wrapper that emits the response (echoes headers/body) for normal Moodle page loads | `Kernel::handleReturning(): ResponseInterface` — same dispatch path, minus the emit step |
| Response recovery | `ob_start()` / `ob_get_clean()` output-buffering workaround | Direct copy of status/headers/body from the returned `ResponseInterface` onto the Slim-supplied response object |
| Risk | Output buffering, potential header conflicts | None — no buffering, no header-conflict risk |
| Test coverage | — | `RouterBridgeSupportCoverageTest`, updated to assert the deterministic 404 status and to send a realistic `Accept: application/json` header (the framework kernel's JSON-vs-HTML error rendering depends on it) |

Full suite (3140 + 8 tests) and `composer check` (style/rector/stan) pass clean after the fix.

## Version-guard cross-reference

Ties to the Routing row of the [API coverage inventory](./api-coverage-inventory): `min_moodle: 5.1`, guard `class_exists('core\router\route_loader_interface')` via `router_bridge_support::is_available()`. That guard governs `RouterBridgeSupport` and `MiddagProxy`; it does not gate the framework's own router (`MoodleRouter`/`RouteLoader`), which has no Moodle-version dependency of its own.
