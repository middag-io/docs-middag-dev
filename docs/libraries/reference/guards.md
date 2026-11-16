---
title: 'Guards'
---

# Guards

The automated checks that keep the OSS libraries free of proprietary code and of host code where the design forbids it. Related: [Architecture](/framework/explanation/architecture), [Platform](./platform), [Pre-PR Boundary Checklist](/framework/how-to/pre-pr-boundary-checklist).

## What is guarded

| Rule                                                                                         | Applies to                                     | Guard                                                                  |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------- |
| An OSS library never imports proprietary code (`middag-io/core`, `middag-io/licensing`, any product namespace) | `framework`, `ui`, `moodle`, `wordpress`, `demo-standalone` | the cross-repository OSS purity job |
| `ui` has no runtime dependency other than PHP                                                | `ui`                                           | `ui` architecture test                                                 |
| No host vocabulary in `ui` code, docblocks or schemas                                        | `ui` (`src/` and `schema/`)                    | `ui` host-vocabulary architecture test (`tests/Architecture/HostVocabularyTest.php`) |
| No host namespace, global or function in the framework                                       | `framework`                                    | `composer check:portability` (dependency rules plus host-globals scan) |
| No host adapter directory inside the framework                                               | `framework`                                    | framework architecture test                                            |
| Each adapter talks to one host only                                                          | `moodle`, `wordpress`                          | each adapter's architecture tests (to be added)                        |
| The demo imports no host API                                                                 | `demo-standalone`                              | demo architecture test (to be added)                                   |

Rules:

- Every library has a `tests/Architecture/` suite that runs in its test step on every pull request. A new boundary rule lands with its test in the same change.
- A guard fails closed. A guard that finds nothing to scan (no libraries checked out, an empty path) fails; it never reports a skip as a pass.
- A guard scans comments and docblocks too, unless the page that states its rule says otherwise. The OSS purity job is a partial exception: type tags in docblocks are scanned; free-text comments are not ([OSS purity](#oss-purity)).
- No public repository names a proprietary namespace, in code, tests or scripts. Proprietary-import rules are checked only by the OSS purity job; library architecture tests check host rules.

## OSS purity

The purity job runs in the CI of `middag-php-dev-tools`, the library that owns the purity command.

- It checks out the five public OSS libraries (`framework`, `ui`, `moodle`, `wordpress` and `demo-standalone`) at their `main` and runs the purity command over each.
- It fails closed. A library that is missing, a missing `src/` or a `src/` with no `.php` file fails the job; nothing is skipped.
- Type tags in docblocks are scanned; free-text comments are not. The scanned tags include `@var`, `@param`, `@return`, `@throws`, `@method`, `@property`, `@extends`, `@implements`, `@use` and `@mixin`, with their `@phpstan-` and `@psalm-` forms ([Public surface of dev-tools](./dev-tools/public-api#gates-for-the-library-family)).
- It runs on every pull request to `dev-tools`, on every push to its `main` and on a weekly schedule, so a change in an OSS library is caught even when `dev-tools` does not change.
- The deny list covers every proprietary namespace, including product namespaces, in both the single- and the double-backslash forms of a fully qualified name.
- The deny list lives only in `dev-tools`, which is private. No OSS library copies it into its own tests or scripts: a per-library copy would name proprietary namespaces in a public repository.
- A proprietary import in an OSS library is caught on the next push or scheduled run of the job, not on the library's own pull request.

## No host in `ui`

`middag-io/ui` describes a UI as data. It never knows the host, the transport or the renderer.

- `src/` and `schema/` carry no host vocabulary, in code, docblocks or schema text: no Moodle or WordPress API name, no host form engine, no host database global, no host capability call, no host file-area field and no host plugin convention.
- `ui` may carry a markup body produced downstream as opaque data (`RendererOutput::html()`, `RenderTarget::Html`). No `ui` contract produces markup. `html()` is not an exception to the boundary.
- The guard is the `ui` architecture test `tests/Architecture/HostVocabularyTest.php`. It scans `src/` and `schema/`, comments included, against a deny list of host vocabulary. The deny list allows `RenderTarget::Html` and the word `html`. It fails closed when a root has nothing to scan.
- A host-specific value travels as an opaque, host-neutral field that the adapter maps. A pending file upload is `FileValue::$uploadToken` (`?string`; `uploadToken` on the wire): `ui` and the client only carry it. Mapping it to the Moodle draft area is a duty of the Moodle host adapter, `middag-io/moodle`.
- The framework keeps its own `check:portability` scan, which skips comments because framework docblocks name hosts as examples.
