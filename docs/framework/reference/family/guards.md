---
title: 'Guards'
---

# Guards

Status: proposed. The automated checks that keep the OSS libraries free of proprietary code and of host code where the design forbids it. Related: [Architecture](../../explanation/architecture), [Platform](./platform), [Pre-PR Boundary Checklist](../../how-to/pre-pr-boundary-checklist).

## What is guarded

| Rule                                                                                         | Applies to                                     | Guard                                                                  |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------- |
| An OSS library never imports proprietary code (`middag-io/core`, `middag-io/licensing`, any product namespace) | `ui`, `framework`, `moodle`, `wordpress` | the cross-repository OSS purity job, plus each library's architecture tests |
| `ui` has no runtime dependency other than PHP                                                | `ui`                                           | `ui` architecture test                                                 |
| No host vocabulary in `ui` code, docblocks or schemas                                        | `ui` (`src/` and `schema/`)                    | `ui` host-vocabulary architecture test                                 |
| No host namespace, global or function in the framework                                       | `framework`                                    | `composer check:portability` (dependency rules plus host-globals scan) |
| No host adapter directory inside the framework                                               | `framework`                                    | framework architecture test                                            |
| Each adapter talks to one host only                                                          | `moodle`, `wordpress`                          | each adapter's architecture tests                                      |
| The demo imports no host API and no proprietary code                                         | `demo-standalone`                              | demo architecture test                                                 |

Rules:

- Every library has a `tests/Architecture/` suite that runs in its test step on every pull request. A new boundary rule lands with its test in the same change.
- A guard fails closed. A guard that finds nothing to scan (no libraries checked out, an empty path) fails; it never reports a skip as a pass.
- A guard scans comments and docblocks too, unless the page that states its rule says otherwise.

## OSS purity

The purity job runs in the CI of `middag-php-dev-tools`, the library that owns the purity command.

- It checks out the public OSS libraries (`ui`, `framework`, `moodle`, `wordpress`) at their `main` and runs the purity command over each.
- It runs on every push and pull request to `dev-tools` and on a schedule, so a change in an OSS library is caught even when `dev-tools` does not change.
- The deny list covers every proprietary namespace, including product namespaces, in both the single- and the double-backslash forms of a fully qualified name.
- Each OSS library's own architecture tests are the per-pull-request guard. The cross-repository job is the second line that sees all libraries with one deny list.

::: warning Decision required at acceptance: where the OSS purity guard runs

| Option                                                                                                   | Effect                                                                                     |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **A. A job in the `dev-tools` CI that checks out the public OSS libraries, plus each library's architecture tests (recommended)** | One deny list, owned by the library that ships the command; the OSS repositories need no token. |
| B. A job in the development environment of the products                                                 | Ties an OSS rule to a product environment.                                                 |
| C. Only each library's architecture tests                                                                | Five copies of the deny list, which drift.                                                 |

Sub-question, with no recommendation: whether `demo-standalone` becomes a fifth checkout of the job. It is public and Apache-2.0, and its own architecture test already forbids proprietary imports.

:::

## No host in `ui`

`middag-io/ui` describes a UI as data. It never knows the host, the transport or the renderer.

- `src/` and `schema/` carry no host vocabulary, in code, docblocks or schema text: no Moodle or WordPress API name, no host form engine, no host database global, no host capability call, no host file-area field and no host plugin convention.
- `ui` may carry a markup body produced downstream as opaque data (`RendererOutput::html()`, `RenderTarget::Html`). No `ui` contract produces markup.
- The guard is a `ui` architecture test that scans `src/` and `schema/`, comments included, against a deny list of host vocabulary. The deny list allows `RenderTarget::Html` and the word `html`.
- The framework keeps its own `check:portability` scan, which skips comments because framework docblocks name hosts as examples.

::: warning Decision required at acceptance: the "no host in `src/`" gate of `ui`

| Option                                                                                         | Effect                                                                         |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **A. A `ui` architecture test over `src/` and `schema/`, comments included (recommended)**      | Matches the `ui` rule exactly; runs on every `ui` pull request with no new CI wiring. |
| B. Reuse the framework's portability scan as a `ui` Composer script                             | Skips docblocks and schemas, so it is weaker than the rule.                    |
| C. Only the cross-repository purity job                                                         | Checks proprietary namespaces, not host vocabulary; does not run on `ui` pull requests. |

:::

::: warning Decision required at acceptance: `RendererOutput::html()`

| Option                                                                                         | Effect                                                                                       |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **A. Keep it as an opaque body produced downstream; it is no exception to the boundary (recommended)** | The rule above stays; the `ui` decision record drops the exception it lists for `html()`.  |
| B. Keep it as a documented exception                                                            | The boundary keeps a known exception.                                                        |
| C. Remove `html()` and `RenderTarget::Html` from `ui`                                           | The Moodle form renderer needs another output type; a breaking change in `ui` and `moodle`. |

:::
