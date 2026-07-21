---
title: 'ui — Design System Catalog & Licensing'
---

# Design System Catalog & Licensing

Reference for the design system underlying `middag-io/ui` and its consumers (`middag-io/framework`, the Moodle and WordPress adapters, `@middag-io/react`). Backs [UI-001](https://github.com/middag-io/ui/blob/docs/docs/decisions/UI-001-react-typescript-inertia-stack.md).

## Component catalog

| Source | Count | Distribution | Notes |
|---|---:|---|---|
| shadcn/ui base components | ~52+ | MIT, copy-paste | Code becomes project-owned on copy — no runtime dependency on an external package. |
| ReUI custom primitives | 17 | MIT, copy-paste | Layered on top of the shadcn/Radix base for product-specific composition needs. |
| TanStack Table v8 | — | npm dependency | Powers the `Table` concern's Data Grid rendering — server-side sort/filter/pagination via Inertia partial reloads. |

## Bundle size

| Stack | Approx. gzip size |
|---|---|
| Atlaskit (Atlassian) | ~350-500 KB |
| ReUI (shadcn/ui + Radix + Tailwind v4) | ~165 KB |

~60-75% smaller than the Atlaskit-class alternative.

## Licensing

| Option | License | Verdict |
|---|---|---|
| Atlaskit (Atlassian) | ADG (Atlassian Design Guidelines) | Ruled out — restricted to products that interoperate with Atlassian software; a standalone Moodle plugin does not qualify. |
| Forge UI (`@forge/react`) | Proprietary | Ruled out — non-DOM renderer, only executes inside the Forge sandbox runtime. |
| ReUI / shadcn/ui | MIT | Chosen — copy-paste distribution: components land in the consuming project's own source tree at adoption time, becoming project-owned code with zero ongoing vendor/runtime dependency. |

## Ecosystem note

The prior stack (Vue 3 + PrimeVue + Pinia) was chosen specifically for alignment with Moodle core's internal use of Vue. Adopting React diverges from that alignment — the product operates as an embedded app with its own UI identity, not a set of components shared with Moodle core rendering.
