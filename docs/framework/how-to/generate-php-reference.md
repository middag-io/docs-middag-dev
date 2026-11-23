---
title: 'Generate PHP Reference Docs'
---

# Generate PHP Reference Docs

How a PHP library of the MIDDAG ecosystem generates and publishes its reference documentation: class signatures, method parameters, return types and inheritance trees. What this hub publishes is in [Documentation publication](/libraries/reference/publication#generated-api-reference).

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

CI/CD generates the reference on each release, from the released tag, and publishes it as a versioned `xref` payload through the MIDDAG docs proxy:

| Library | Bucket                | Reaches this hub                                                    |
| ------- | --------------------- | ------------------------------------------------------------------- |
| OSS     | `middag-docs-public`  | Yes: the `@api` surface.                                            |
| Internal | `middag-docs-private` | Only the types the hub publishes for that library; see [Documentation publication](/libraries/reference/publication). |

- There is no reference site per library: this hub aggregates the public payloads.
- The organization meta repository `github-private` never hosts generated reference content.

## 4. Use the shared pipeline component

An OSS library publishes with the reusable workflow `cloudflare-r2-reference-publish.yml` of `middag-io/actions`, pinned to the `cloudflare-r2-reference-publish-v1` tag. Read the component README before wiring it.

## 5. Read the published reference

The hub copies each declared `xref` channel to `/api/{repo}/{segment}/`, as the generator produced it. A library reaches it only when `hub.config.json` declares `"xref"` in its `kinds`.

| Library                | API reference                                                       |
| ---------------------- | ------------------------------------------------------------------- |
| `middag-php-wordpress` | <a href="/api/middag-php-wordpress/latest/index.html">Latest</a>    |

## Out of scope

- TypeScript and JavaScript reference docs (TypeDoc).
- API specifications (OpenAPI, JSON Schema).
- End-user product documentation.
