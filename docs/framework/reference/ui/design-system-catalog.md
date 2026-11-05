---
title: 'UI stack and design system'
---

# UI stack and design system

[UI-001](https://github.com/middag-io/middag-php-ui/blob/main/docs/decisions/UI-001-react-typescript-inertia-stack.md) records why the UI contracts are a separate, zero-dependency PHP package that describes UI and never renders it. [UI-003](https://github.com/middag-io/middag-php-ui/blob/main/docs/decisions/UI-003-first-party-client-stack.md) records that the first-party client that renders those contracts is React + TypeScript over Inertia, with ReUI (shadcn/ui, Radix UI and Tailwind CSS, MIT, copy-paste distribution) as the design system foundation. The PHP package [`middag-php-ui`](https://github.com/middag-io/middag-php-ui) owns transport-neutral page and block contracts; [`@middag-io/react`](https://github.com/middag-io/middag-react) owns the React renderer and components. A Moodle or WordPress adapter connects those pieces to its host.

| Concern | Current source |
| --- | --- |
| Package boundary decision | [UI-001](https://github.com/middag-io/middag-php-ui/blob/main/docs/decisions/UI-001-react-typescript-inertia-stack.md) |
| First-party client decision | [UI-003](https://github.com/middag-io/middag-php-ui/blob/main/docs/decisions/UI-003-first-party-client-stack.md) |
| PHP page and block contracts | [`middag-php-ui/src`](https://github.com/middag-io/middag-php-ui/tree/main/src) |
| React components and renderer | [`middag-react/src`](https://github.com/middag-io/middag-react/tree/main/src) |
| React setup and supported components | [`middag-react/docs`](https://github.com/middag-io/middag-react/tree/main/docs) |

At the 2026-11-04 review (`middag-react/main@56f72c697f79da42c4b811f272053a5d1e668c17`, package version 0.42.0), `@middag-io/react` declared React 19 and `@inertiajs/react` 3 as peer dependencies. Check the package version used by a product before selecting components or installation steps. Component inventory, bundle size, and third-party license terms belong to the current package and its dependencies; this page does not freeze those changing values.

## Client stack rationale

Why the first-party client is React + TypeScript with ReUI, and what that choice costs, is explained in [ui architecture](../../explanation/ui/architecture#why-the-first-party-client-is-react-and-reui). The wire contract does not depend on that choice: another renderer can consume the same JSON; see [UI wire contract](./wire-contract).
