---
title: 'Generate PHP Reference Docs'
---

# Generate PHP Reference Docs

How a PHP repository of the MIDDAG ecosystem (a `middag-php-*` library, or a Docker stack with its own namespace) generates, stores and publishes its reference documentation: class signatures, method parameters, return types and inheritance trees. The decision behind it is ADR-015 of the MIDDAG operations documentation.

## Tooling

| Language | Standard tool                        | Notes                                                    |
| -------- | ------------------------------------ | -------------------------------------------------------- |
| PHP      | [phpDocumentor](https://phpdoc.org/) | Doctum and Sami are not supported.                       |
| JS/TS    | TypeDoc                              | Parallel standard for JavaScript and TypeScript; not covered here. |

## 1. Set up phpDocumentor in the repository

1. Add phpDocumentor to `composer.json` as a `require-dev` dependency.
2. Create the configuration at `phpdoc.dist.xml`, at the repository root.
3. Add a `make reference` (or `composer reference`) target that runs phpDocumentor with that configuration.

## 2. Generate the docs

```bash
make reference
# or
composer reference
```

The output is HTML under `docs/reference/`, with a stable index at `index.html`.

## 3. Decide whether to commit

The generated output is committed to the source repository, so the reference stays navigable from any checkout. Commit it only when the public API changed; an internal refactor does not produce churn in `docs/reference/`. A repository that publishes `xref` artifacts to the documentation storage instead of committing them follows the storage contract of the docs proxy ([`worker-ts-middag-docs-proxy`](https://github.com/middag-io/worker-ts-middag-docs-proxy)).

## 4. Choose the publish target

| Repository type             | Publish target                                          |
| --------------------------- | ------------------------------------------------------- |
| Internal infrastructure     | `docs/reference/` in the repository only; no site.      |
| Consumer-facing PHP library | A docs site of its own (for example `docs.{product}.middag.io`). |
| Customer-facing platform    | The customer-facing docs domain of the project.         |

The organization meta repository `github-private` never hosts generated reference content.

## 5. Until the reusable workflow ships

No reusable pipeline component builds the reference yet. One is planned in `middag-io/actions` or `middag-io/actions-private`, and waits for the first repository that opts in. Until then, run phpDocumentor by hand (steps 1 and 2) or copy a per-repository workflow from an existing consumer.

## Out of scope

- TypeScript and JavaScript reference docs (TypeDoc).
- API specifications (OpenAPI, JSON Schema).
- End-user product documentation.
