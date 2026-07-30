---
title: 'framework — Composer Portability Audit (Historical)'
---

# Composer Portability Audit (Historical)

Snapshot of a portability audit run against `framework/` inside the `moodle-local_middag` legacy codebase, before that code was extracted into `middag-io/framework` as a standalone Composer package. Preserved as a historical record, not a current-state report — the constraint it measured is now enforced structurally by this repository's own existence as a plugin-independent package. Useful as a template for anyone scoping a similarly-shaped extraction elsewhere in the ecosystem. Backs [FW-011](https://github.com/middag-io/framework/blob/docs/docs/decisions/FW-011-framework-composer-portability.md).

## Portability score at audit time

| Dimension | Score |
|---|---:|
| Namespace isolation | 100% |
| Deptrac boundary | 90% |
| Moodle boundary | 40% |
| Hard-coded paths | 30% |
| `require_once` discipline | 85% |
| **Average** | **69%** |

## Named violations at audit time

**Host globals read directly, outside the `moodle/` adapter layer (4 files):**

| File | Globals read directly |
|---|---|
| `shared/util/helper.php` | `$OUTPUT`, `$PAGE` |
| `infrastructure/adapter/inertia/inertia_response.php` | `$PAGE` |
| `infrastructure/adapter/inertia/inertia_shared_props.php` | `$USER`, `$PAGE` |
| `infrastructure/logging/file_logger.php` | `$USER` |

**Hard-coded paths (6 files):** `kernel/router.php`, `kernel/container_factory.php`, `kernel/http/plugin_aware_url_generator.php`, `kernel/http/abstract_controller.php` (entry-point/asset paths), `infrastructure/adapter/inertia/inertia_response.php` (a CSS path), `service/extension_service.php` (a binary/Pix path).

**Accepted exceptions** (justified, not counted as violations):

| File | Justification |
|---|---|
| `kernel/container_factory.php` | Reads `$DB`/`$CFG` directly — runs at bootstrap, before the DI container exists to inject anything into it. Governed by a separate, older decision (legacy `ADR-926`). |
| `shared/util/environment.php` | Reads `$CFG` for environment detection, same bootstrap-timing rationale. |

## Blockers named for the extraction, and how they were resolved

| # | Blocker | Resolved by, in `middag-io/framework` |
|---|---|---|
| 1 | The Inertia adapter and `shared/util/helper` read host globals directly instead of receiving them via an injected adapter. | The bridge-contract pattern (`HostComponentContextInterface`, `UserContextResolverInterface`, etc.) — see `architecture.md` §5. |
| 2 | Entry-point URLs, asset paths and binary paths were hard-coded instead of read from injected configuration. | `ConfigResolverInterface` (`EnvConfigResolver` default). |
| 3 | `kernel/` inferred the host's plugin identity from a global constant instead of accepting it via DI. | `BootstrapInterface::getProjectRoot()`/`platform()`, fed into `ContainerFactory::build()` — see `bootstrap.md` §1. |

Whether the exact five-file violation list above was fixed file-by-file before this package was assembled, or the package was written fresh against the bridge-contract pattern from the start, is not established by the historical record. Either way, each blocker maps directly onto a mechanism this framework now ships as a first-class contract, and the 69% score has no live equivalent to compute here — there is no host plugin left to score against.
