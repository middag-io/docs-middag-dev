---
title: 'Documentation publication'
---

# Documentation publication

Where the documentation of each MIDDAG PHP library and product lives, and what each public site publishes. Related: [Versioning and compatibility](./versioning-and-compatibility).

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
- Each internal library has one curated public-API section on this hub, opened when its surface is written. The full documentation stays in its repository.
- An internal library's public API on this hub is a curated surface: the `@api` types a consumer codes against, their contracts and their errors. Internal design, internal operations and decision records stay in the library's repository.
- `docs.middag.io` is the single site of every MIDDAG product, aggregated like this hub. A product keeps no site of its own; ADR-029 of the MIDDAG profile records the site.
- The products follow the same split: product developer documentation (public API, integration) is published here when its channel opens; user and administrator guides go to `docs.middag.io`.

## Generated API reference

- On this hub, generated API reference covers only the `@api` surface of a family library: the types, signatures and docblocks a consumer codes against. Untagged and `@internal` types are not published here.
- The library generates it from its source and publishes it as a versioned docs payload through the docs proxy, like any aggregated channel. The hub never commits generated reference and never edits it.
- Generated reference complements the curated public-API section of an internal library; it does not replace it. The curated section explains contracts and errors; the generated reference lists signatures.
- This is the target rule. ADR-015 of the MIDDAG profile still sends the reference of a consumer-facing library to a site of its own, and the [Generate PHP reference docs](/framework/how-to/generate-php-reference) guide follows ADR-015. Both change with the ADR-015 amendment of its publish-target clause, not with this page. The choice of generator (the tool clause of ADR-015) is outside this page.

## PHP-React correspondence map

The correspondence map lists each UI contract type emitted by PHP and the React component that renders it. It is a reference, not a design: it describes the wire contract both sides already share.

- **Open-source half:** each `$defs` type of the `middag-php-ui` schema bundles, its PHP class and the `@middag-io/react` export that renders it, one row per type. It is a reference page of this hub (to be added), next to the [UI wire contract](/framework/reference/ui/wire-contract). `middag-php-ui` owns it, because its schemas are the source the React types are generated from.
- **Proprietary half:** the UI contract types of `middag-php-core` and the proprietary React components that render them. It lives in the `middag-php-core` repository, which owns those schemas, and reaches this hub only as part of the curated public API of `middag-php-core`.
- The owner's maintainers approve the map in the pull request that adds it, against the schemas of a named release. A rename or a move on either side updates the map in the same change.
- The tracking of the OSS half lives in `middag-php-ui`, where outside contributors can see it.
- No reorganization of PHP UI classes starts before the map is approved.
