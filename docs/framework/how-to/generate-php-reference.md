---
title: 'Generate PHP Reference Docs'
---

# Generate PHP Reference Docs

How a PHP library of the MIDDAG ecosystem generates and publishes its reference documentation: class signatures, method parameters, return types and inheritance trees. The decision behind it is ADR-015 of the MIDDAG operations documentation; what this hub publishes is in [Documentation publication](/libraries/reference/publication#generated-api-reference).

## Tooling

| Language | Standard tool                        | Notes                                                              |
| -------- | ------------------------------------ | ------------------------------------------------------------------ |
| PHP      | [phpDocumentor](https://phpdoc.org/) | Doctum and Sami are not supported.                                 |
| JS/TS    | TypeDoc                              | Parallel standard for JavaScript and TypeScript; not covered here. |

## 1. Set up phpDocumentor in the repository

1. Add phpDocumentor to `composer.json` as a `require-dev` dependency.
2. Create the configuration at `phpdoc.dist.xml`, at the repository root.
3. Add a `make reference` (or `composer reference`) target that runs phpDocumentor with that configuration.

## 2. Generate the docs locally

```bash
make reference
# or
composer reference
```

A local run is for checking the output only. The output is never committed: keep the output directory in `.gitignore`.

## 3. Publish on each release

CI/CD generates the reference on each release, from the released tag, and publishes it as a versioned docs payload through the docs proxy ([`worker-ts-middag-docs-proxy`](https://github.com/middag-io/worker-ts-middag-docs-proxy)):

| Library | Bucket                | Reaches this hub                                                    |
| ------- | --------------------- | ------------------------------------------------------------------- |
| OSS     | `middag-docs-public`  | Yes: the `@api` surface.                                            |
| Internal | `middag-docs-private` | Only the types the hub publishes for that library; see [Documentation publication](/libraries/reference/publication). |

- There is no reference site per library: this hub aggregates the public payloads.
- The organization meta repository `github-private` never hosts generated reference content.

## 4. Until the shared pipeline component ships

No shared pipeline component builds and publishes the reference yet. One is planned in `middag-io/actions` and waits for the first library that opts in. Until then, no library publishes generated reference.

## Out of scope

- TypeScript and JavaScript reference docs (TypeDoc).
- API specifications (OpenAPI, JSON Schema).
- End-user product documentation.
