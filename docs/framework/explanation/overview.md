---
title: 'framework — Overview'
---

# framework — Overview

A platform-agnostic PHP framework for building business domains that do not depend on their host. Write controllers, forms, queries and services against contracts, then run the same code standalone, inside a Moodle plugin, or inside a WordPress plugin, by swapping a thin adapter.

> Your domain should not know, or care, where it runs.

See [Architecture](./architecture) for the four pillars, the OSS × proprietary boundary, the concern-first 3-tier layout, the bridge contracts, and the Active-Record / Eloquent compatibility matrix. See [Bootstrap](./bootstrap-lifecycle) for the boot phases, what the kernel provides at boot, and the bridge contracts an adapter implements.

::: info Status: in progress
This page states the `2.x` line of the library family. Support starts at `2.0.0`; earlier releases are pre-stable and unsupported. One part is still in progress: the generated reference of the `@api` surface, marked below.
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

The libraries of the family share the MAJOR version; MINOR and PATCH releases are per library ([The family](/libraries/reference/versioning-and-compatibility#the-family)). A project requires each package it imports with `^2.0`, or with the MINOR whose features it uses; a MINOR upgrade inside that range never breaks.

### Dependencies

Besides Symfony and `middag-io/ui`, the framework requires only PSR contracts (container, HTTP messages, factories, client, server handler and middleware, log, clock, simple cache), `monolog/monolog` `^3.0` and `nyholm/psr7` `^1.8`. It requires no host and no database driver.

Optional packages enable a default implementation or a transport. None is needed to run the framework.

| Package                                                                    | Enables                                                                                     |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `ext-curl`                                                                 | the recommended transport of Symfony HttpClient in production                               |
| `illuminate/database` `^11.0 \|\| ^12.0` | a Laravel-style query builder behind the connection adapter port, wired by the application (no integration ships) |
| `doctrine/dbal` `^4.0`                                                     | standalone schema and migrations through the DBAL schema builder                            |
| `league/flysystem` `^3.0`                                                  | a filesystem port implementation over cloud or abstract storage                             |
| `sentry/sentry` `^4.0`                                                     | a ready-to-bind error reporter                                                               |
| `symfony/doctrine-messenger`, `symfony/redis-messenger`, `symfony/amqp-messenger` | async transports for the command worker (database outbox, Redis, AMQP)               |
| `symfony/console`, `symfony/lock`, `symfony/scheduler`                     | a CLI for the command worker and schedule runner, single-run locking, Messenger scheduling |
| `symfony/mailer`, `symfony/rate-limiter`                                   | a standalone mail transport behind the mailer port, throttling of endpoints and workers     |
| `middag-io/moodle`, `middag-io/wordpress`                                  | the host adapters                                                                            |

Optional Symfony components follow the same `^7.4 || ^8.1` range, and the host adapters the family MAJOR. Their wiring is in [Standalone Runtime](../reference/standalone-runtime) and [Dispatch, Handlers & Scheduling](../reference/command-bus).

The platform rules behind these values are in [Platform](/libraries/reference/platform) and [Versioning and compatibility](/libraries/reference/versioning-and-compatibility#compatibility-matrix). A first controller is built in [Getting Started](../tutorials/getting-started); a host-free setup is in [Standalone Runtime](../reference/standalone-runtime).

## Public surface

- Support covers the types tagged `@api` only, under the rules of [Versioning and compatibility](/libraries/reference/versioning-and-compatibility#supported-surface). A type tagged `@internal`, or with no tag, is an implementation detail and may change in any release.
- Every type of the framework carries its stability tag at class level. The `@api` surface is the interfaces in the `Contract/` sub-namespace of each concern, plus the exported `@api` classes: value objects, default implementations, base classes, attributes, enums and exceptions.
- [`API-STABILITY.md`](https://github.com/middag-io/middag-php-framework/blob/main/API-STABILITY.md) in the repository lists every `@api` type of the public surface; a test in the repository keeps the list equal to the tags in `src/`.
- Depend only on `@api` types. When a behavior is reachable only through an `@internal` type, open an issue to have it promoted; a promotion is an additive change for a MINOR.
- The framework ships no MIDDAG domain base classes and no MIDDAG domain helpers. Entity and value-object bases, formatting helpers and validators of the MIDDAG domain belong to the internal library `middag-io/core`; for entities, the framework exposes only the generic `EntityInterface` contract. The generic DTO base and utilities in `Shared` are outside this exclusion.

The contract reference is on this hub, one page per topic:

| Concern (`Middag\Framework\…`)                       | Reference                                                                                                                                                       |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Http`                                                 | [Routing & Auth Attributes](../reference/attribute-routing-and-auth-model), [PSR-15 Bridge & Middleware](../reference/psr15-bridge-and-middleware), [Rendering Mode Selection](../reference/rendering-mode-selection), [Inertia Protocol](../reference/inertia-protocol) |
| `Form`                                                 | [Form Lifecycle & Validation](../reference/form-lifecycle-and-validation), [Form Field Catalog](../reference/form-field-catalog-and-anti-corruption)                                         |
| `Persistence`, `Database`                              | [Database Schema & Migrations](../reference/database-schema-and-migrations), [Active Record (Eloquent Compatibility)](../reference/active-record-eloquent-compatibility)                      |
| `Bus`                                                  | [Dispatch, Handlers & Scheduling](../reference/command-bus)                                                            |
| `Kernel`, `Runtime`                                    | [Kernel Boot Lifecycle](../reference/kernel-boot-lifecycle), [Boot-Time Built-In Features](../reference/bootstrap-contracts), [Module Layout Convention](../reference/module-layout-convention), [Hooks — Public Surface & Naming](../reference/hooks-public-surface) |
| `Exception`                                            | [Exception Hierarchy](../reference/exception-hierarchy)                                                                                                         |
| `Logging`, `Observability`                             | [Logging & Observability](../reference/logging-and-observability)                                                                                               |
| `Filesystem`, `Mail`, `Security`, `Translation` | [Adapter Port Catalog](../reference/bridge-contracts)                                                                                                       |
| `Shared`                                               | No curated page. The DTO contract and base, `#[TrustedOutput]`, `SyncResult`, `DebugMode`, `Operator` and the generic utilities (`Arr`, `Debug`, `Environment`, `Inflector`, `Typing`, `Uuid`) are covered by the generated `@api` reference, in progress |

The ports a host adapter implements, including the neutral component identity `HostComponentContextInterface`, are in [Adapter Port Catalog](../reference/bridge-contracts). The reactive seams `HostEventBridgeInterface` and `SignalDispatcherInterface` are in [Hooks — Public Surface & Naming](../reference/hooks-public-surface). The boot-failure seam `ComponentNameResolverInterface` is in [Bootstrap](./bootstrap-lifecycle).

In progress: the generated reference of the `@api` surface is not published yet ([Documentation publication](/libraries/reference/publication#generated-api-reference)).

## Changelog and releases

- [`CHANGELOG.md`](https://github.com/middag-io/middag-php-framework/blob/main/CHANGELOG.md) records every release.
- [Releases](https://github.com/middag-io/middag-php-framework/releases) on GitHub carry the tags, and [Packagist](https://packagist.org/packages/middag-io/framework) serves the package.
- Releases are cut only by release-please, from Conventional Commits; there are no manual tags. The framework shares only the MAJOR with the rest of the family; its MINOR and PATCH releases are its own. What each part of a version may carry is in [Versioning and compatibility](/libraries/reference/versioning-and-compatibility#lifecycle).

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

The framework, the Moodle and WordPress adapters, `middag-io/ui` and `middag-io/demo-standalone` are open source under Apache-2.0 — the generic plumbing, free, forever. Governed event delivery, async jobs with retry and audit, an EAV query engine and multi-tenancy live in MIDDAG's internal (proprietary, not free) libraries, built on top of this OSS and opt-in; product features live in the products. See [OSS and internal libraries](./architecture#oss-and-internal-libraries). The framework never imports the proprietary layer; the dependency only ever points downward.

## Licensing note

Apache-2.0. Support starts at `2.0.0`, the first stable release of the library family: from there a MINOR never breaks, and a removal leaves only in a MAJOR, deprecated first where possible. Earlier releases are pre-stable and unsupported. The rules and the compatibility matrix are in [Versioning and compatibility](/libraries/reference/versioning-and-compatibility); the public surface is listed in [`API-STABILITY.md`](https://github.com/middag-io/middag-php-framework/blob/main/API-STABILITY.md).

## Contributing

See [`CONTRIBUTING.md`](https://github.com/middag-io/middag-php-framework/blob/main/CONTRIBUTING.md) for the workflow, coding standards and quality gates.
