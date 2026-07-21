---
title: 'framework — Inertia Protocol: Shared Props, SPA-Safe Redirects & Partial Reloads'
---

# Inertia Protocol: Shared Props, SPA-Safe Redirects & Partial Reloads

Reference for `middag-io/middag-php-framework`'s Inertia bridge (`Http/Inertia/`) — the shared-props catalog, SPA-safe redirect mechanics, partial-reload wire format, and the legacy-to-current component mapping. Backs [FW-006](https://github.com/middag-io/middag-php-framework/blob/docs/docs/decisions/FW-006-inertia-spa-bridge.md).

## Response shapes

A controller picks one of three response shapes per route:

```php
return $this->inertia('Dashboard', ['items' => $items]);        // Inertia SPA
return $this->render_from_template('local_middag/page', $data); // host template
return $this->json_response($data);                             // JSON API
```

## Shared props registered at boot

| Prop | Content |
|---|---|
| `navigation` | 3-level tree + `activeKey` + footer |
| `auth` | `{id, name, email, avatarUrl, capabilities[]}` |
| `theme` | `{strings, appearance, brandColor, inherit}` |
| `scope` | identifiers registered by extensions at boot |
| `flash` | one-shot session flash |
| `locale`, `version` | — |

Custom registration: `inertia_adapter::share('key', fn() => [...])`. Always wrap the value in a closure — a shared prop registered without one computes its value eagerly at boot, even for requests that never read it. A closure defers that cost to only the requests that actually read the prop.

## SPA-safe redirects

`inertia_location(route, params)` returns `409` plus an `X-Inertia-Location` header to an Inertia-aware client; a non-SPA request gets a normal redirect. Calling a plain `redirect()` from a route the SPA served is an anti-pattern — the SPA client ignores it silently, producing a confusing "nothing happened" bug instead of a clean failure.

## Partial reloads

The frontend sends `X-Inertia-Partial-Component` + `X-Inertia-Partial-Data` request headers; the response filters shared/page props server-side to return only what was requested. This is the mechanism `middag-io/ui`'s `Table` block relies on for server-side sort/filter/pagination without a full page reload (see that package's UI-002).

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

A frontend build pipeline (Vite) is required; Inertia is a runtime dependency — an unbuilt frontend fails as an error, not a silent fallback. SSR is not implemented (SPA-only); whether that remains true in the current codebase has not been re-verified since the original reconstruction — check `Http/Inertia/` directly before restating it as still the case. Shared props grow with the number of extensions registering into them, which requires ongoing discipline to avoid an undisciplined global-data dump — no automated guard exists for this.

## Protocol-version disambiguation

"Inertia v3" here refers to the Inertia.js **wire protocol** version (lazy/`optional`, deferred/`defer`, `merge`/`deepMerge`, partial reloads, asset versioning) — the transport this reference describes. `middag-io/ui`'s own "v2 capabilities" (polling, conditional row actions, confirmation dialogs, toasts, rich column variants — see that package's UI-002) is a **different versioning axis**: the page-contract API's own capability rollout, layered on top of whatever Inertia protocol version ships underneath. The two numbers happening to both say "v2"/"v3" in their respective docs is coincidental, not a shared version line — don't cross-reference one as if it gated the other.
