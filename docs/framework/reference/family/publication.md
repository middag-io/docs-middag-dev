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
