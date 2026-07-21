---
title: 'ui — Composition Levels, Block Catalog & Capabilities'
---

# Composition Levels, Block Catalog & Capabilities

Reference for how a page contract (`middag-io/ui`) is composed and what the block system supports. Backs [UI-002](https://github.com/middag-io/ui/blob/docs/docs/decisions/UI-002-page-contract-composition-model.md).

## Composition levels

The same wire contract serves every level — only how much of it you write by hand changes.

| Level | API | Use | Controller | Frontend |
|---|---|---|---|---|
| L1 | `page_builder::crud(Entity::class)` | Standard CRUD, minimal config | `page_builder` | Renders via registries |
| L2 | `page_builder::crud(...)->without(...)` | CRUD with adjustments | `page_builder` + overrides | Renders via registries |
| L3 | `page_builder::page('key')->region(...)` | Custom pages composed from blocks | `page_builder` + custom blocks | Registries + custom components |
| L4 | `inertia::render('Page', $props)` | Fully dedicated React page | `inertia::render()` | Purpose-built React page |

A single screen may mix standard and custom blocks in one composition — the contract does not distinguish origin.

### `page_builder`

Convenience layer producing a standard `page_contract` — the frontend consumes the same contract whether a builder generated it or it was assembled by hand. L1 conventions (naming, entity introspection) derive form fields, table columns, actions, routes, and permissions automatically; each convention accepts an explicit override.

## Block catalog

| Block | Role | Notes |
|---|---|---|
| `dense_table` | Server-side sort/filter/paginate abstraction | Fluent API (columns, data source, pagination, sort, filters, actions); React side renders via TanStack Table v8, dispatching through Inertia partial reloads. |
| `form_panel` | Bridges the form field DSL to the page contract | CRUD pages generated via `page_builder` automatically produce a `stack` layout with a `form_panel` in the content region. Client side: `@inertiajs/react`'s `useForm()`, React Hook Form + Zod for client-side validation, ReUI/shadcn form fields. |

Extensions register custom block types by implementing `block_type_interface` (PHP) and registering the matching React component in the client-side `blockRegistry`. Standard blocks live in `base/blocks/`; custom blocks live per-extension.

### Reserved layouts

`wizard` (steps/content/actions — multi-step forms, onboarding flows) and `canvas` (toolbar/canvas/inspector — visual builder UIs) are reserved in both the TypeScript types and the PHP value objects, but no React component implements them yet — the reservation avoids a breaking schema change whenever they ship.

## Capabilities

| Capability | Mechanism |
|---|---|
| Polling | Blocks declare `block.meta.polling` (`interval`, `enabled`); the server stays the source of truth, refresh cycles run through `router.reload({ only: ['contract'] })` (Inertia-native — no SSE/WebSockets). Client hook: `usePolling()`. |
| Conditional row actions | `visible_when` / `disabled_when` / `loading_when` / `disabled_reason_field`, using the same `FormCondition` model as the form DSL. Complex logic evaluates server-side as derived (`_`-prefixed) fields; the client only evaluates simple conditions via a shared `evaluateCondition()`. |
| Confirmation dialogs | `ActionConfirmation` (title/message with `{field}`-style interpolation, intent, confirm/cancel labels, `waitForPolling`, `waitingMessage`) shared between row actions and page actions via a generic `ConfirmationDialog` component. |
| Toast notifications | Two channels converge on one renderer (Sonner): a server flash channel (`flash.toast` via Inertia, rendered by `FlashProvider`) and an imperative client hook (`useToast()`). |
| Rich column variants | `rich_status` (colored badge, preferred for new work), `html` (`dangerouslySetInnerHTML` with sanitization — discouraged for new development), `link_group` (conditional icon-button group). |
| Page actions with side effects | `page_action` supports in-place POST/PUT/DELETE without navigation (`router[method]()` with `preserveState: true`), button-level loading state, reuses `ActionConfirmation`. Superseded the earlier inline `ActionButton`, keeping backward compatibility for `requiresConfirmation`. |

An admin-configurable persistence mode for L3 dashboards (DB-backed layout editing, reusing the same block infrastructure) is deferred to a future milestone.
