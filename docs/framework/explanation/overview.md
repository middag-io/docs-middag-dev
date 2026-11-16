---
title: 'framework — Overview'
---

# framework — Overview

A platform-agnostic PHP framework for building business domains that do not depend on their host. Write controllers, forms, queries and services against contracts, then run the same code standalone, inside a Moodle plugin, or inside a WordPress plugin, by swapping a thin adapter.

> Your domain should not know, or care, where it runs.

See [Architecture](./architecture) for the four pillars, the OSS × proprietary boundary, the concern-first 3-tier layout, the bridge contracts, and the Active-Record / Eloquent compatibility matrix. See [Bootstrap](./bootstrap-lifecycle) for the boot phases, what the kernel provides at boot, and the bridge contracts an adapter implements.

::: info Status: in progress
This page states the `2.x` line of the library family. Support starts at `2.0.0`; earlier releases are pre-stable and unsupported. Some sections below are still being written and say so.
:::

## Who it is for

- Developers who build a business domain once and run it standalone, in Moodle or in WordPress.
- Developers of a host adapter, who implement the framework's ports for a new host.
- Developers of the products and internal libraries built on top of the framework.

## Requirements and install

| Item                | Value                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| Package             | `middag-io/framework` ([middag-php-framework](https://github.com/middag-io/middag-php-framework)), Apache-2.0 |
| PHP                 | `^8.3`: 8.3, 8.4 and 8.5, with the `intl`, `json`, `mbstring` and `pdo` extensions                       |
| Symfony             | `^7.4 \|\| ^8.1` for every Symfony component it requires (contracts and polyfills keep their own ranges); PHP 8.3 resolves Symfony 7.4                    |
| Sibling libraries   | `middag-io/ui`, on the family MAJOR (`^2.0` on `2.x`)                                                     |
| Host                | none: the framework runs standalone; a host needs its adapter ([Moodle](../reference/adapters/moodle/), [WordPress](../reference/adapters/wordpress/)) |

```bash
composer require middag-io/framework
```

The platform rules behind these values are in [Platform](/libraries/reference/platform) and [Versioning and compatibility](/libraries/reference/versioning-and-compatibility#compatibility-matrix). A first controller is built in [Getting Started](../tutorials/getting-started); a host-free setup is in [Standalone Runtime](../reference/standalone-runtime).

## Public surface

- Support covers the types tagged `@api` only. Anything untagged, or tagged `@internal`, may change in any release.
- [`API-STABILITY.md`](https://github.com/middag-io/middag-php-framework/blob/main/API-STABILITY.md) in the repository lists the public surface.
- The contract reference is on this hub, grouped by topic in [Reference](../reference/). The ports a host adapter implements are in [Adapter Port Catalog](../reference/bridge-contracts).
- In progress: the generated reference of the `@api` surface is not published yet ([Documentation publication](/libraries/reference/publication#generated-api-reference)).

## Changelog and releases

- [`CHANGELOG.md`](https://github.com/middag-io/middag-php-framework/blob/main/CHANGELOG.md) records every release.
- [Releases](https://github.com/middag-io/middag-php-framework/releases) on GitHub carry the tags.

## Decision records

The records live in the repository, in [`docs/decisions`](https://github.com/middag-io/middag-php-framework/tree/main/docs/decisions). This hub explains the design they record; it does not host them.

| Id                                                                                                                                   | Decision                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| [FW-001](https://github.com/middag-io/middag-php-framework/blob/main/docs/decisions/FW-001-psr15-http-kernel-boundary.md)              | Build on Symfony and PSR; public contracts are PSR or framework-owned    |
| [FW-002](https://github.com/middag-io/middag-php-framework/blob/main/docs/decisions/FW-002-attribute-routing-controller-auth-model.md) | Declarative routing and authorization                                    |
| [FW-003](https://github.com/middag-io/middag-php-framework/blob/main/docs/decisions/FW-003-schema-first-forms-form-request-escalation.md) | Validation declared as data                                           |
| [FW-004](https://github.com/middag-io/middag-php-framework/blob/main/docs/decisions/FW-004-form-renderer-adapters-field-type-dsl.md)   | The renderer seam lives in ui; host widgets only in adapters             |
| [FW-005](https://github.com/middag-io/middag-php-framework/blob/main/docs/decisions/FW-005-multi-mode-rendering-model.md)              | Multi-mode rendering, no template engine                                 |
| [FW-006](https://github.com/middag-io/middag-php-framework/blob/main/docs/decisions/FW-006-inertia-spa-bridge.md)                      | Inertia server side inside the framework                                 |
| [FW-007](https://github.com/middag-io/middag-php-framework/blob/main/docs/decisions/FW-007-signal-hook-reactive-model.md)              | The OSS ships only the generic reactive seam                             |
| [FW-008](https://github.com/middag-io/middag-php-framework/blob/main/docs/decisions/FW-008-command-bus-async-job-model.md)             | One command bus over Messenger; sync or async decided by routing         |
| [FW-009](https://github.com/middag-io/middag-php-framework/blob/main/docs/decisions/FW-009-shortcode-processing.md)                   | Output sanitized by default; opt out with `#[TrustedOutput]`             |
| [FW-010](https://github.com/middag-io/middag-php-framework/blob/main/docs/decisions/FW-010-typed-exception-hierarchy.md)               | One framework exception family that carries the HTTP status              |
| [FW-011](https://github.com/middag-io/middag-php-framework/blob/main/docs/decisions/FW-011-framework-composer-portability.md)          | Why a separate framework package exists                                  |
| [FW-012](https://github.com/middag-io/middag-php-framework/blob/main/docs/decisions/FW-012-kernel-boot-lifecycle.md)                   | Compiled container as the only resolver, frozen before modules boot      |
| [FW-013](https://github.com/middag-io/middag-php-framework/blob/main/docs/decisions/FW-013-repository-persistence-boundary.md)         | Own Active Record and Data Mapper                                        |
| [FW-014](https://github.com/middag-io/middag-php-framework/blob/main/docs/decisions/FW-014-segregated-controller-role-interfaces.md)   | Segregated controller role interfaces                                    |
| [FW-015](https://github.com/middag-io/middag-php-framework/blob/main/docs/decisions/FW-015-hosts-are-adapters-of-framework-ports.md)   | Hosts are adapters of framework ports                                    |
| [FW-016](https://github.com/middag-io/middag-php-framework/blob/main/docs/decisions/FW-016-statics-as-a-bounded-exception.md)         | Static state as a bounded exception                                      |
| [FW-017](https://github.com/middag-io/middag-php-framework/blob/main/docs/decisions/FW-017-database-abstraction.md)                    | Database abstraction                                                     |

## Help

- Questions and bugs: [issues of `middag-php-framework`](https://github.com/middag-io/middag-php-framework/issues).
- Security reports: [`SECURITY.md`](https://github.com/middag-io/middag-php-framework/blob/main/SECURITY.md). Do not open a public issue for a vulnerability.

## Open source and MIDDAG

The framework, the Moodle and WordPress adapters, `middag-io/ui` and `middag-io/demo-standalone` are open source under Apache-2.0 — the generic plumbing, free, forever. Governed event delivery, async jobs with retry and audit, an EAV query engine, multi-tenancy and licensing live in MIDDAG's internal (proprietary, not free) libraries, built on top of this OSS and opt-in; product features live in the products. See [OSS and internal libraries](./architecture#oss-and-internal-libraries). The framework never imports the proprietary layer; the dependency only ever points downward.

## Licensing note

Apache-2.0. Support starts at `2.0.0`, the first stable release of the library family: from there a MINOR never breaks, and a removal is deprecated first and leaves only in the next MAJOR. Earlier releases are pre-stable and unsupported. The rules and the compatibility matrix are in [Versioning and compatibility](/libraries/reference/versioning-and-compatibility); the public surface is listed in [`API-STABILITY.md`](https://github.com/middag-io/middag-php-framework/blob/main/API-STABILITY.md).

## Contributing

See [`CONTRIBUTING.md`](https://github.com/middag-io/middag-php-framework/blob/main/CONTRIBUTING.md) for the workflow, coding standards and quality gates.
