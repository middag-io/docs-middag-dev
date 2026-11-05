---
title: 'Moodle Adapter — Frontend Build & Theme Bridge'
---

# Frontend Build & Theme Bridge

Reference for how a compiled frontend (React and Inertia, built by the consumer) is hosted on a Moodle page: the adapter's host-page bridge, the theme-color bridge, and the consumer-side AMD build. Verified against `middag-php-moodle` `main@6aae04d` on 2026-11-04.

These mechanisms adapt to Moodle itself (Moodle's page pipeline, theme settings and AMD loader), which is why they live in the Moodle adapter and the consumer rather than in `middag-io/ui`. The page contract the frontend renders is `middag-io/ui`'s concern (see [UI Wire Contract](../../ui/wire-contract)); the product shell and visual identity belong to the consuming product.

## Host-page bridge (adapter)

`Http\Inertia\MoodleInertiaBootstrap::registerHooks()` wires the framework's Inertia runtime into Moodle. The conventions are per component and product-agnostic:

| Convention                    | Value                                                                                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| AMD entry module              | `{component}/inertia_app`, called with `$PAGE->requires->js_call_amd($module, 'init')`; Moodle resolves `{component}/*` to the plugin's `amd/build/` |
| Version hash source           | `{plugin dir}/amd/build/inertia_app.min.js` (`InertiaVersionManager::setBundlePath()`)                                                   |
| Stylesheets                   | `styles/middag-app.css` and `styles/isolation.css`, each added only if the file exists                                                   |
| Mount point                   | `<div id="{appId}" class="middag-root">` plus `<script type="application/json" data-page="{appId}">` (Inertia v3 bootstrap); the id comes from the composition root (`InertiaFactory::setAppId()`) |
| Appearance                    | A small blocking script applies the stored light/dark preference to `<html>` before React mounts, to avoid a flash of the wrong theme     |

## Theme-color bridge (adapter)

The frontend can inherit the active Moodle theme's brand color.

| Step   | Detail                                                                                                                                                                                  |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Read   | `ThemeSupport::getBrandColor()` reads `$PAGE->theme->settings->brandcolor` and returns it only if it is a well-formed CSS color (hex, `rgb()`/`rgba()`/`hsl()`/`hsla()` with numeric arguments, or a plain identifier); otherwise `null` |
| Gate   | `ThemeSupport::isInheritanceEnabled()` reads the `inherit_theme_colors` setting of the `core` extension (`{prefix}core_inherit_theme_colors`; see [Settings & Config Keys](./settings-and-config-keys)) |
| Inject | `ThemeSupport::getCssInjection()` returns `:root { --brand: <color>; }` for the consumer to place in the page head, or `null` when inheritance is off or no valid color exists. A host whose stylesheets read another variable overrides `brandCssVariable()` (the MIDDAG product uses `--middag-brand`) |
| Share  | `ThemeSupport::buildTheme()` feeds `brandColor` and `inherit` into the Inertia shared props (`InertiaSharedProps`)                                                                      |
| Map    | The consumer's design tokens (`--primary` and siblings) reference the brand variable when inheritance is on; off means the product's own fixed theme applies                            |

The color validation matters: the value is interpolated into inline `<style>` content.

## AMD build output (consumer)

The adapter ships no frontend build. The consumer compiles its bundle for Moodle's AMD/RequireJS loader. The MIDDAG Moodle plugin, the reference consumer, does it this way:

| Chunk                      | Contents                                | Loading   |
| -------------------------- | --------------------------------------- | --------- |
| `middag-app.min.js`        | Entry, app code, registries             | Immediate |
| `react-vendor-lazy.min.js` | react, react-dom, `@inertiajs/react`    | Lazy      |
| `react-ui-lazy.min.js`     | Radix UI primitives                     | Lazy      |
| `react-table-lazy.min.js`  | TanStack Table                          | Lazy      |
| `middag-ext-{slug}.min.js` | Extension chunks (non-core, via CDN)    | Lazy      |

The entry stays small; the React runtime, UI primitives, the table library and extension bundles load on demand through Moodle's `requirejs.php`.

A dedicated Vite plugin (`vite-plugin-moodle-amd`) emits AMD output directly into `amd/build/`, with no manual repackaging step:

| Responsibility       | Detail                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Path rewriting       | Rewrites relative imports between chunks into the `{component}/{name}` form Moodle's AMD loader expects                       |
| Dev-mode duplication | Copies the lazy chunks into `amd/src/`, so one `watch` process covers both `amd/build/` and `amd/src/`                         |

The cost is a bespoke plugin that must track Moodle's `requirejs.php` expectations.

## Enforcement state

| Clause                                                                 | State                                  |
| ---------------------------------------------------------------------- | -------------------------------------- |
| Theme inheritance is gated by the setting; invalid colors are rejected | **coded** — `ThemeSupport`             |
| AMD path rewriting matches Moodle's loader                             | **planned** — no check in the adapter  |

---

Decision records: MDL-001 and MDL-019 in [`middag-php-moodle/docs/decisions`](https://github.com/middag-io/middag-php-moodle/tree/main/docs/decisions).
