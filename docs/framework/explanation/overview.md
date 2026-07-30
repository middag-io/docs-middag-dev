---
title: 'framework — Overview'
---

# framework — Overview

A platform-agnostic PHP framework for building business domains that do not depend on their host. Write controllers, forms, queries and services against contracts, then run the same code standalone, inside a Moodle plugin, or inside a WordPress plugin, by swapping a thin adapter.

> Your domain should not know, or care, where it runs.

See [Architecture](./architecture) for the four pillars, the OSS × proprietary boundary, the concern-first 3-tier layout, the bridge contracts, and the Active-Record / Eloquent compatibility matrix. See [Bootstrap](./bootstrap) for the boot phases, what the kernel provides at boot, and the bridge contracts an adapter implements.

## Open source and MIDDAG

The framework, the Moodle and WordPress adapters, and `middag-io/ui` are open source under Apache-2.0 — the generic plumbing, free, forever. The governed domain infrastructure that is genuinely hard to get right — reliable event delivery, async jobs with retry and audit, an EAV query engine, multi-tenancy, and licensing — is MIDDAG's proprietary product, built on top of this OSS and opt-in. The framework never imports the proprietary layer; the dependency only ever points downward.

## Licensing note

Apache-2.0. On the `1.x` line the API is still consolidating: a minor release may carry a documented breaking change — see [`API-STABILITY.md`](https://github.com/middag-io/middag-php-framework/blob/main/API-STABILITY.md).

## Contributing

See [`CONTRIBUTING.md`](https://github.com/middag-io/middag-php-framework/blob/main/CONTRIBUTING.md) for the workflow, coding standards and quality gates.
