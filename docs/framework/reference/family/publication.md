---
title: 'Documentation publication'
---

# Documentation publication

Status: proposed. Where the documentation of each MIDDAG PHP library and product lives, and what each public site publishes. Related: [Versioning and compatibility](./versioning-and-compatibility).

## Sites

| Site                                        | Audience                                    | Publishes                                                                                                            |
| ------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| [docs.middag.dev](https://docs.middag.dev) | Developers who write code against MIDDAG    | Everything technical: the full documentation of the OSS libraries, the public API of the internal libraries, and the public API of the products |
| [docs.middag.io](https://docs.middag.io)   | People who use the products                 | The products themselves; `local_middag` is the first, others follow                                                  |

The test for a page: if its reader writes code against MIDDAG, it belongs on `docs.middag.dev`; otherwise on `docs.middag.io`.

Both sites are hub proxies:

- They aggregate the documentation each repository publishes. A repository (or a proxy repository that publishes on its behalf) pushes a versioned docs payload; the hub pulls it at build time.
- They may also host consolidated documentation authored in the hub itself, when a subject spans several repositories and reads better as one tree.
- A hub never edits aggregated content. A change goes to the source repository.
- Decision records stay in the repository that owns them. No hub publishes them.

## Where each library's documentation lives

| Repository                   | Full documentation                                                  | On `docs.middag.dev`                        | Kept in the repository                                     |
| ---------------------------- | ------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------- |
| `middag-php-ui`              | this hub (consolidated)                                             | everything                                  | `README`, `API-STABILITY.md`, `CHANGELOG`, decision records |
| `middag-php-framework`       | this hub (consolidated)                                             | everything                                  | same                                                       |
| `middag-php-moodle`          | this hub (consolidated)                                             | everything                                  | same                                                       |
| `middag-php-wordpress`       | this hub (consolidated)                                             | everything                                  | same                                                       |
| `middag-php-demo-standalone` | this hub (consolidated)                                             | everything                                  | same, plus its coverage ledger                             |
| `middag-php-core`            | its own repository                                                  | its public API only                         | full documentation and decision records                    |
| `middag-php-licensing`       | its own repository                                                  | its public API only                         | full documentation and decision records                    |
| `middag-php-dev-tools`       | its own repository                                                  | its public API only                         | full documentation and decision records                    |

Rules:

- The OSS libraries are documented once, here. Architecture, reference and guides of an OSS library are not kept in its repository: a page such as `docs/architecture.md` in an OSS repository is a short pointer to the matching page of this hub, never a second normative copy.
- An internal library's public API on this hub is a curated surface: the `@api` types a consumer codes against, their contracts and their errors. Internal design, internal operations and decision records stay in the library's repository.
- The product sites follow the same split: product developer documentation (public API, integration) is published here when its channel opens; user and administrator guides go to `docs.middag.io`.

::: warning Decision required at acceptance: the public API of the internal libraries on this hub

| Option                                                                                         | Effect                                                                                                    |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **A. One curated public-API section per internal library, opened when its surface is written (recommended)** | Opens the paused product/core section of this hub for the curated surface only; the full documentation stays in each repository. |
| B. Each internal library publishes its public-API payload through the aggregation layer         | No consolidated section here; the payload is versioned by the library's own release.                      |
| C. Keep the section paused; internal libraries publish nothing here until the products launch   | The hub documents the OSS libraries only for now.                                                         |

:::

::: warning Decision required at acceptance: the product site

| Option                                                                         | Effect                                                                                    |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| **A. `docs.middag.io` is the single product site, aggregated like this hub (recommended)** | Depends on the product-site decision record of the MIDDAG profile, still proposed; no content is committed by this design. |
| B. Each product keeps its own site and `docs.middag.io` links to them          | No shared navigation or search across products.                                          |

:::

## Generated API reference

- On this hub, generated API reference covers only the `@api` surface of a family library: the types, signatures and docblocks a consumer codes against. Untagged and `@internal` types are not published here.
- The library generates it from its source and publishes it as a versioned docs payload through the docs proxy, like any aggregated channel. The hub never commits generated reference and never edits it.
- Generated reference complements the curated public-API section of an internal library; it does not replace it. The curated section explains contracts and errors; the generated reference lists signatures.
- This is the target rule. ADR-015 of the MIDDAG profile still sends the reference of a consumer-facing library to a site of its own, and the [Generate PHP reference docs](../../how-to/generate-php-reference) guide follows ADR-015. Both change with the ADR-015 amendment, not with this page.

::: warning Decision required at acceptance: generated API reference on this hub

| Option | Effect |
| --- | --- |
| **A. Only the `@api` surface, published through the docs proxy (recommended)** | Amends the publish-target clause of ADR-015: a family library publishes its `@api` reference here instead of on a site of its own. Proprietary internals stay unpublished. The choice of generator (the tool clause of ADR-015) is a separate decision. |
| B. The full generated reference, published through the docs proxy | Publishes `@internal` types of the proprietary libraries on a public site; contradicts the curated-surface rule above. |
| C. No generated reference on this hub; ADR-015 unchanged | Each library keeps its reference in `docs/reference/` or on a site of its own; readers of this hub have no signature reference. |

:::

## PHP-React correspondence map

The correspondence map lists each UI contract type emitted by PHP and the React component that renders it. It is a reference, not a design: it describes the wire contract both sides already share.

- **Open-source half:** each `$defs` type of the `middag-php-ui` schema bundles, its PHP class and the `@middag-io/react` export that renders it, one row per type. It is a reference page of this hub (to be added), next to the [UI wire contract](../ui/wire-contract). `middag-php-ui` owns it, because its schemas are the source the React types are generated from.
- **Proprietary half:** the UI contract types of `middag-php-core` and the `middag-react-pro` components that render them. It lives in the `middag-php-core` repository, which owns those schemas, and reaches this hub only as part of the curated public API of `middag-php-core`.
- The owner's maintainers approve the map in the pull request that adds it, against the schemas of a named release. A rename or a move on either side updates the map in the same change.
- No reorganization of PHP UI classes starts before the map is approved.

::: warning Decision required at acceptance: where the PHP-React map lives and who owns it

| Option | Effect |
| --- | --- |
| **A. Split by license: the OSS half on this hub, owned by `middag-php-ui`; the proprietary half in `middag-php-core`, owned by it (recommended)** | Each half sits with the schemas it describes and is readable by the people who can read those schemas. The tracking of the OSS half moves to `middag-php-ui`, where outside contributors can see it. |
| B. One map in `middag-php-core`, covering both halves | One document, but the OSS half becomes invisible to contributors of the open-source libraries. |
| C. One map in the `middag-react` documentation, owned by the React side | The map follows the renderer instead of the contract source; the proprietary half cannot be published there. |

:::
