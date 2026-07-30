---
title: 'Framework — Rendering Mode Selection & Anti-Patterns'
---

# Rendering Mode Selection & Anti-Patterns

Reference for how `middag-io/framework` picks between a server-rendered host page, an Inertia SPA response, and a pure JSON API response — and the anti-patterns to avoid on any of the three. Backs [FW-005](https://github.com/middag-io/middag-php-framework/blob/docs/docs/decisions/FW-005-multi-mode-rendering-model.md).

## Mode selection

| Mode | Base class | Output | Typical use |
|---|---|---|---|
| Host pages | `AbstractController` | HTML via the host's own output layer (e.g. Moodle `$OUTPUT` + Mustache) | Admin, settings, reports |
| SPA (Inertia) | `AbstractController` + `InertiaAdapter::render()` | JSON to React | Dashboards, dynamic forms |
| API (JSON) | `AbstractApiController` | Pure JSON | REST / AJAX / mobile |

`AbstractController` and `AbstractApiController` (`Http/Controller/`) are the only two OSS base classes. Host pages and Inertia SPA screens share the same base — the only difference is whether the controller calls `InertiaAdapter::render()`; see [FW-006](https://github.com/middag-io/middag-php-framework/blob/docs/docs/decisions/FW-006-inertia-spa-bridge.md) for the Inertia wire protocol itself (shared props, redirects, partial reloads, versioning).

A single extension can mix all three modes freely across its own controllers — nothing forces every screen in an extension onto the same mode, and using Inertia is never mandatory. A simple extension can stay entirely on host pages.

## Anti-patterns

| Anti-pattern | Why it's a problem | Do instead |
|---|---|---|
| Calling the host's native output renderer directly from an extension (e.g. `$OUTPUT->render()` in a Moodle host) | Bypasses the controller boundary the framework is meant to own | Return output through the controller/renderable, never a bare host call |
| Setting page metadata straight on a host global (e.g. `$PAGE->set_title()`) | Couples extension code to a host global that a different host target (standalone, WordPress) does not have | Go through the page-identity contract the framework or UI package defines |
| Reaching for Inertia on a simple admin-settings screen | SPA overhead with no payoff when a plain host page does the job | Default to a host-page controller; opt into Inertia only when the screen needs it |
| Putting non-trivial logic inside a server-side template (e.g. Mustache) | Template-logic complexity is a smell regardless of which templating mechanism a host adapter uses | Prepare data in the controller/renderable; keep the template a dumb view |

Page-identity concerns (title, breadcrumbs) belong behind a contract the framework or UI package defines, not a bare host global — the same host-portability reasoning applies generally across the framework.

## Table and widget composition

The framework itself has no `Widget/` or `Table/` concern — no `abstract_widget` or Moodle-`flexible_table`-wrapping `table_builder` exists in `src/`. That responsibility belongs entirely to `middag-io/ui`'s own `Table/` builder (its `dense_table`-style block), since a Moodle-specific table abstraction has no place in a host-agnostic framework. The rule survives one layer up: extensions never touch a host's native table class directly — enforced by the UI package's block contract rather than by this framework.
