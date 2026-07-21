---
title: 'ui — Overview'
---

# ui — Overview

Transport-agnostic PHP **contract builders** for contract-driven UI. Describe a page once — its regions, forms, tables, blocks, navigation and actions — as an immutable value object, then let any host or adapter render it. The library produces a JSON **page contract**; it never produces HTML.

> Describe the page once. Render it anywhere.

The builders carry no transport and no host knowledge: the same contract renders standalone, inside a Moodle plugin, or inside WordPress, by swapping the renderer downstream. See [Architecture](./architecture) for how the contract system is built and organized.

## Open source and MIDDAG

`middag-io/ui`, `middag-io/framework`, and the Moodle/WordPress adapters are open source under Apache-2.0 — the generic plumbing, free, forever. The governed domain infrastructure built on top is MIDDAG's proprietary product, opt-in; this library has zero dependencies and never points at it.

## Licensing note

Apache-2.0. On the `1.x` line a minor release may carry a documented breaking change, cut deliberately by a maintainer — strict semver (breaking only in majors) starts at `2.0`.
