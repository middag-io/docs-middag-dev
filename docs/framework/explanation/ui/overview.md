---
title: 'ui — Overview'
---

# ui — Overview

Transport-agnostic PHP **contract builders** for contract-driven UI. Describe a page once — its regions, forms, tables, blocks, navigation and actions — as an immutable value object, then let any host or adapter render it. The library produces a JSON **page contract**; it never produces HTML.

> Describe the page once. Render it anywhere.

The builders carry no transport and no host knowledge: the same contract renders standalone, inside a Moodle plugin, or inside WordPress, by swapping the renderer downstream. See [Architecture](./architecture) for how the contract system is built and organized.

::: info Status: in progress
This page states the `2.x` line of the library family. Support starts at `2.0.0`; earlier releases are pre-stable and unsupported. Two references are not published yet: the generated reference of the `@api` surface and the PHP-React correspondence map ([Public surface](#public-surface)).
:::

## Who it is for

- Developers of `middag-io/framework`, the host adapters and any renderer that consumes the page contract.
- Developers who build pages for a MIDDAG-based product and want them to render on any host.
- Authors of a client, such as `@middag-io/react`, that codegens against the published JSON schemas.

## Requirements and install

| Item                | Value                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------- |
| Package             | `middag-io/ui` ([middag-php-ui](https://github.com/middag-io/middag-php-ui)), Apache-2.0    |
| PHP                 | `^8.3`: 8.3, 8.4 and 8.5                                                                    |
| Symfony             | none: `ui` depends on no Symfony component                                                  |
| Sibling libraries   | none: `ui` is the bottom of the stack and requires no other library                         |
| Host                | none: `ui` runs with no host                                                                |

```bash
composer require middag-io/ui
```

The platform rules behind these values are in [Platform](/libraries/reference/platform) and [Versioning and compatibility](/libraries/reference/versioning-and-compatibility#compatibility-matrix). A first page is built in [Getting Started](../../tutorials/ui/getting-started).

## Public surface

- Support covers the types tagged `@api` only. Every type in `src/` carries exactly one class-level tag, `@api` or `@internal`; a type with neither is `@internal`. An `@internal` type may change in any release.
- The `@api` surface is the interfaces in each concern's `Contract/` sub-namespace (suffix `Interface`), the concern builders and the value objects they produce, and the cross-cutting types under `Shared/`.
- The emitted JSON is a second, stronger contract. A PHP rename that leaves the JSON unchanged is not a wire break; a change to the JSON shape is, and follows the same versioning rules ([Versioning and compatibility](/libraries/reference/versioning-and-compatibility)).
- [`API-STABILITY.md`](https://github.com/middag-io/middag-php-ui/blob/main/API-STABILITY.md) in the repository lists the public surface and the rules for changing it.
- The contract reference is on this hub: [Page Composition Contract](../../reference/ui/composition-levels-and-capabilities), [UI Wire Contract](../../reference/ui/wire-contract) and [UI Stack & Design System](../../reference/ui/design-system-catalog).
- The JSON schemas the library emits (`schema/page-contract.json`, `schema/fragment.json`) are published artifacts of each release.
- In progress: the generated reference of the `@api` surface ([Documentation publication](/libraries/reference/publication#generated-api-reference)) and the PHP-React correspondence map ([Documentation publication](/libraries/reference/publication#php-react-correspondence-map)) are not published yet.

## Changelog and releases

- Releases are cut only by release-please from Conventional Commits; there are no manual tags.
- [`CHANGELOG.md`](https://github.com/middag-io/middag-php-ui/blob/main/CHANGELOG.md) records every release.
- [Releases](https://github.com/middag-io/middag-php-ui/releases) on GitHub carry the tags, and [Packagist](https://packagist.org/packages/middag-io/ui) serves them to Composer.

## Decision records

The records live in the repository, in [`docs/decisions`](https://github.com/middag-io/middag-php-ui/tree/main/docs/decisions). This hub explains the design they record; it does not host them.

| Id     | Decision                                                                            |
| ------ | ----------------------------------------------------------------------------------- |
| [UI-001](https://github.com/middag-io/middag-php-ui/blob/main/docs/decisions/UI-001-zero-dependency-contracts-package.md) | UI contracts are a separate zero-dependency package at the bottom of the stack      |
| [UI-002](https://github.com/middag-io/middag-php-ui/blob/main/docs/decisions/UI-002-page-contract-composition-model.md) | A versioned data contract, published as schema                                      |
| [UI-003](https://github.com/middag-io/middag-php-ui/blob/main/docs/decisions/UI-003-first-party-client-stack.md) | The first-party UI client is React + TypeScript + Inertia + ReUI                    |

## Help

- Questions and bugs: [issues of `middag-php-ui`](https://github.com/middag-io/middag-php-ui/issues).
- Security reports: [`SECURITY.md`](https://github.com/middag-io/middag-php-ui/blob/main/SECURITY.md). Do not open a public issue for a vulnerability.
- Contributions: [`CONTRIBUTING.md`](https://github.com/middag-io/middag-php-ui/blob/main/CONTRIBUTING.md).

## Open source and MIDDAG

`middag-io/ui`, `middag-io/framework`, the Moodle and WordPress adapters and `middag-io/demo-standalone` are open source under Apache-2.0 — the generic plumbing, free, forever. The governed domain infrastructure built on top lives in MIDDAG's internal (proprietary, not free) libraries, opt-in; product features live in the products. See [OSS and internal libraries](../architecture#oss-and-internal-libraries). This library has zero dependencies and never points at the internal libraries.

## Licensing note

Apache-2.0. Support starts at `2.0.0`, the first stable release of the library family: from there breaking changes land only in a MAJOR. Earlier releases are pre-stable and unsupported. See [Versioning and compatibility](/libraries/reference/versioning-and-compatibility).
