---
title: 'framework — Inertia Protocol: Shared Props, SPA-Safe Redirects & Partial Reloads'
---

# Inertia Protocol: Shared Props, SPA-Safe Redirects & Partial Reloads

Reference for `middag-io/middag-php-framework`'s Inertia bridge (`Http/Inertia/`): shared props, SPA-safe redirects, asset versioning, the partial-reload wire format, and the legacy-to-current component mapping. Backs [FW-006](https://github.com/middag-io/middag-php-framework/blob/main/docs/decisions/FW-006-inertia-spa-bridge.md). Provenance: legacy vault ADR-804 (2026-04-04).

## Server-side placement

The server half of Inertia lives in this framework (`Http/Inertia/`), not in `middag-io/ui`: `ui` describes pages and never knows the transport. The bridge does not depend on any frontend framework. It was designed while the product frontend used Vue, and the later move to React (`@middag-io/react`) needed no change here.

## Rendering a response

```php
use Middag\Framework\Http\Inertia\InertiaAdapter;

return InertiaAdapter::render('Dashboard', ['items' => $items]);   // component + props
return InertiaAdapter::page($pageContract);                        // a middag-io/ui PageContract or Fragment
```

`InertiaResponse` reads the `X-Inertia` request header: an Inertia visit gets the JSON page object (`X-Inertia: true`, `Vary: X-Inertia`); a first visit gets the HTML bootstrap shell. Host-page and JSON responses come from the controller bases instead; see [Rendering Mode Selection](./rendering-mode-selection).

## Shared props

`InertiaManager::share($key, $value)` (also `InertiaAdapter::share()`) registers a prop sent with every Inertia response. Pass a closure to defer the cost: shared closures are resolved once per response by `InertiaResponse`, and a partial reload skips the closures of keys it did not request. `InertiaManager::flush()` clears the map for long-running workers and tests.

The framework itself shares only these keys:

| Prop | Registered by |
| --- | --- |
| `flash`, `errors` | `ShareFlashMiddleware` (one-shot session flash and validation errors) |
| `csrf_token` | `VerifyCsrfMiddleware` |

Everything else is host composition. The Moodle adapter, for example, registers `navigation`, `auth`, `theme`, `scope`, `flash`, `errors`, `locale` and `version` in its `InertiaSharedProps`.

## Redirects

| Call | Inertia visit | Plain visit | Use for |
| --- | --- | --- | --- |
| `InertiaAdapter::redirect($route, $params)` | `303 See Other` | `303` | Another Inertia page after `POST`/`PUT`/`DELETE`; the client re-GETs in place. |
| `InertiaAdapter::location($route, $params)` | `409` + `X-Inertia-Location` | `302` | A destination outside the SPA; the client does a full browser visit. |

The kernel also upgrades a `302` returned from an unsafe method to `303`, because the stock Inertia client mishandles a `302` there. A plain redirect to a non-Inertia page from an SPA-served route is the anti-pattern `location()` exists for: the client would otherwise ignore it. Both calls need a URL generator, which the adapter sets at boot with `InertiaAdapter::setUrlGenerator()` or `useUrlGenerator()`; without one they throw.

## Asset versioning

`InertiaVersionManager::getVersion()` returns a manual version when one was set (`setVersion()`), otherwise the MD5 of the configured bundle file (`setBundlePath()`), otherwise `dev`. When an Inertia `GET` carries an `X-Inertia-Version` that differs from the server's, the response is `409` + `X-Inertia-Location` so the client reloads the new assets.

## Partial reloads

The client sends `X-Inertia-Partial-Component` together with `X-Inertia-Partial-Data` (keys to include) or `X-Inertia-Partial-Except` (keys to drop). The response honours them only when the partial component matches the rendered component, and filters shared and page props server-side. `X-Inertia-Reset` lists merge props the client should replace rather than merge. This is the mechanism `middag-io/ui`'s `Table` block relies on for server-side sort, filter and pagination without a full reload.

## Component reference (legacy → current)

| Legacy component (ADR-804) | Current file |
|---|---|
| `inertia_adapter` (static facade) | `Http/Inertia/InertiaAdapter.php` |
| `inertia_factory` | `Http/Inertia/InertiaFactory.php` |
| `inertia_manager` (shared props) | `Http/Inertia/InertiaManager.php` |
| `inertia_response` | `Http/Inertia/InertiaResponse.php` |
| `inertia_version_manager` | `Http/Inertia/InertiaVersionManager.php` |
| `inertia_field_mapper` | `Form/Renderer/InertiaFieldMapper.php` |
| — (net-new, protocol v3) | `Http/Inertia/DeferProp.php`, `Http/Inertia/MergeProp.php`, `Http/Inertia/OptionalProp.php` |

## Protocol version 3

Beyond the partial reloads and asset versioning above, the framework ships the full Inertia v3 wire protocol: lazy props (`optional`), deferred props (`defer`), and prop merging (`merge`/`deepMerge`) — implemented in `Http/Inertia/{DeferProp,MergeProp,OptionalProp}.php`.

## Known gaps

- **No SSR.** The bridge is SPA-only; `Http/Inertia/` contains no server-side rendering code.
- **A built frontend is required.** Inertia is a runtime dependency: an unbuilt frontend fails as an error, not a silent fallback.
- **Shared props need discipline.** Every extension can register shared props, and nothing guards against the map growing into a global data dump.
- **Process-wide state.** The shared-prop map, the URL generator and the version are static, one per PHP process; this is one of the bounded static exceptions listed in [Architecture](../explanation/architecture).

## Protocol-version disambiguation

"Inertia v3" here refers to the Inertia.js **wire protocol** version (lazy/`optional`, deferred/`defer`, `merge`/`deepMerge`, partial reloads, asset versioning) — the transport this reference describes. `middag-io/ui`'s own "v2 capabilities" (polling, conditional row actions, confirmation dialogs, toasts, rich column variants — see that package's UI-002) is a **different versioning axis**: the page-contract API's own capability rollout, layered on top of whatever Inertia protocol version ships underneath. The two numbers happening to both say "v2"/"v3" in their respective docs is coincidental, not a shared version line — don't cross-reference one as if it gated the other.

Verified against `middag-php-framework/main@c9daec5` on 2026-11-04.
