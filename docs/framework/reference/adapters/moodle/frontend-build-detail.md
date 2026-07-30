---
title: 'moodle — Frontend Build & Theme Bridge Detail'
---

# Frontend Build & Theme Bridge Detail

Reference for how the frontend (built in `middag-io/ui`/`middag-io/framework`, consumed by the Moodle adapter) packages itself for the Moodle host: Moodle-native AMD build output and Moodle theme-color inheritance. Backs [MDL-019](https://github.com/middag-io/middag-php-moodle/blob/docs/docs/decisions/MDL-019-frontend-moodle-integration.md).

## AMD chunk table

| Chunk | Contents | Loading |
|---|---|---|
| `middag-app.min.js` | Entry + app code + registries | Immediate |
| `react-vendor-lazy.min.js` | react, react-dom, `@inertiajs/react` | Lazy |
| `react-ui-lazy.min.js` | Radix UI primitives | Lazy |
| `react-table-lazy.min.js` | TanStack Table | Lazy |
| `middag-ext-{slug}.min.js` | Extension chunks (non-core, via CDN) | Lazy |

The immediately-loaded entry stays small; everything else — the React runtime, UI primitives, the table library, and non-core extension bundles — loads lazily, on demand, through Moodle's native `requirejs.php` mechanism.

## The `moodle-amd` Vite plugin

| Responsibility | Detail |
|---|---|
| Path rewriting | Rewrites relative import paths between compiled chunks into the `local_middag/{name}` format Moodle's AMD/RequireJS loader expects |
| Dev-mode duplication | Duplicates build output into `amd/src/`, so a single `watch` process covers both `amd/build/` and `amd/src/` instead of two separate processes running side by side |

Output goes directly into `amd/build/` — no generic bundler target requiring a manual repackaging step afterward.

## Theme bridge mechanics

| Step | Detail |
|---|---|
| Read | `$PAGE->theme->settings->brandcolor` is read server-side |
| Inject | The value is injected as the `--middag-brand` CSS custom property in `<head>` |
| Map | Tailwind's semantic tokens (`--primary` and siblings) reference `--middag-brand` conditionally |
| Gate | Controlled by the `local_middag/inherit_theme_colors` admin checkbox — off means the product's own fixed theme tokens apply instead |

## Why this lives in the Moodle adapter, not `ui`

Both mechanisms are specifically about adapting to Moodle itself — reading Moodle's own theme configuration, packaging for Moodle's own AMD loading mechanism — rather than a reusable UI mechanism. That is the same criterion used to classify the rest of this adapter's boundary documentation set.

## Out of scope here

- The page-contract/composition mechanism this frontend build serves — lives in `middag-io/ui`'s own decisions record.
- The product shell and visual-identity instance — lives in the consuming product's own decisions record, not this OSS adapter.

## Related

- [MDL-018 — Moodle Navigation Integration](https://github.com/middag-io/middag-php-moodle/blob/docs/docs/decisions/MDL-018-moodle-navigation-integration.md)
