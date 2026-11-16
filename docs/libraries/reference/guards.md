---
title: 'Guards'
---

# Guards

Status: proposed. The automated checks that keep the OSS libraries free of proprietary code and of host code where the design forbids it. Related: [Architecture](/framework/explanation/architecture), [Platform](./platform), [Pre-PR Boundary Checklist](/framework/how-to/pre-pr-boundary-checklist).

## What is guarded

| Rule                                                                                         | Applies to                                     | Guard                                                                  |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------- |
| An OSS library never imports proprietary code (`middag-io/core`, `middag-io/licensing`, any product namespace) | `ui`, `framework`, `moodle`, `wordpress`, `demo-standalone` | the cross-repository OSS purity job |
| `ui` has no runtime dependency other than PHP                                                | `ui`                                           | `ui` architecture test                                                 |
| No host vocabulary in `ui` code, docblocks or schemas                                        | `ui` (`src/` and `schema/`)                    | `ui` host-vocabulary architecture test (to be added, with the `draftitemid` replacement) |
| No host namespace, global or function in the framework                                       | `framework`                                    | `composer check:portability` (dependency rules plus host-globals scan) |
| No host adapter directory inside the framework                                               | `framework`                                    | framework architecture test                                            |
| Each adapter talks to one host only                                                          | `moodle`, `wordpress`                          | each adapter's architecture tests (to be added)                        |
| The demo imports no host API                                                                 | `demo-standalone`                              | demo architecture test (to be added)                                   |

Rules:

- Every library has a `tests/Architecture/` suite that runs in its test step on every pull request. A new boundary rule lands with its test in the same change.
- A guard fails closed. A guard that finds nothing to scan (no libraries checked out, an empty path) fails; it never reports a skip as a pass.
- A guard scans comments and docblocks too, unless the page that states its rule says otherwise.
- No public repository names a proprietary namespace, in code, tests or scripts. Proprietary-import rules are checked only by the OSS purity job; library architecture tests check host rules.

## OSS purity

The purity job runs in the CI of `middag-php-dev-tools`, the library that owns the purity command.

- It checks out the five public OSS libraries (`ui`, `framework`, `moodle`, `wordpress` and `demo-standalone`) at their `main` and runs the purity command over each.
- It runs on every push and pull request to `dev-tools` and on a schedule, so a change in an OSS library is caught even when `dev-tools` does not change.
- The deny list covers every proprietary namespace, including product namespaces, in both the single- and the double-backslash forms of a fully qualified name.
- The deny list lives only in `dev-tools`, which is private. No OSS library copies it into its own tests or scripts: a per-library copy would name proprietary namespaces in a public repository.
- A proprietary import in an OSS library is caught on the next push or scheduled run of the job, not on the library's own pull request.

::: warning Decision required at acceptance: where the OSS purity guard runs

| Option                                                                                                   | Effect                                                                                     |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **A. A job in the `dev-tools` CI that checks out the public OSS libraries (recommended)**                 | One deny list, owned by the private library that ships the command; no public repository names a proprietary namespace; the OSS repositories need no token. A violation is caught on the next push or scheduled run, not on the OSS pull request. |
| B. A job in the development environment of the products                                                 | Ties an OSS rule to a product environment.                                                 |
| C. Each library's architecture tests                                                                     | Each public repository names the proprietary namespaces it forbids, which leaks them; the copies drift. |

:::

## No host in `ui`

`middag-io/ui` describes a UI as data. It never knows the host, the transport or the renderer.

- `src/` and `schema/` carry no host vocabulary, in code, docblocks or schema text: no Moodle or WordPress API name, no host form engine, no host database global, no host capability call, no host file-area field and no host plugin convention.
- `ui` may carry a markup body produced downstream as opaque data (`RendererOutput::html()`, `RenderTarget::Html`). No `ui` contract produces markup.
- The guard is a `ui` architecture test that scans `src/` and `schema/`, comments included, against a deny list of host vocabulary. The deny list allows `RenderTarget::Html` and the word `html`.
- Known violation: `Form/FileValue` is `@api` and has a public `?int $draftitemid` property, whose docblock names the Moodle draft area, and `schema/page-contract.json` and `schema/fragment.json` define a `draftitemid` field. `draftitemid` is a host file-area field.
- `draftitemid` is replaced by a host-neutral field in a `1.x` MINOR of `ui`, in the change that resolves [middag-io/middag-php-ui#64](https://github.com/middag-io/middag-php-ui/issues/64). The replacement is direct, with no alias. Only the name of the neutral field is chosen in that change.
- The host-vocabulary architecture test of `ui` lands in the same change, so it does not fail on its first run.
- `middag-io/moodle`, `middag-react`, the proprietary React components and the products that read the field follow that change. `middag-io/moodle` maps the neutral field to the Moodle draft area.
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
