---
title: 'framework — Composer Portability Audit (Historical)'
---

# Composer Portability Audit (Historical)

> **Historical page.** The score and violations below describe the legacy `moodle-local_middag` tree in 2026-04 and are not a current-state report. The current gate is described under [The current gate](#the-current-gate).

Snapshot of a portability audit run against `framework/` inside the `moodle-local_middag` legacy codebase, before that code was extracted into `middag-io/framework` as a standalone Composer package. Preserved as a historical record, not a current-state report — the constraint it measured is now enforced structurally by this repository's own existence as a plugin-independent package. Useful as a template for anyone scoping a similarly-shaped extraction elsewhere in the ecosystem. Backs [FW-011](https://github.com/middag-io/middag-php-framework/blob/main/docs/decisions/FW-011-framework-composer-portability.md).

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

## Extraction rules (legacy ADR-927, 2026-04-11)

The extraction was governed by five rules. Each maps onto something the package now does by construction:

| # | Rule | Where it lives today |
|---|---|---|
| 1 | No hard-coded reference to the host plugin outside `namespace`/`use` statements | `bin/portability-scan.php` (below) |
| 2 | Plugin-specific configuration (naming prefixes, capability prefixes) flows in from outside | `ConfigResolverInterface` (default `EnvConfigResolver`) and the other [bridge contracts](./bridge-contracts) |
| 3 | A Deptrac-enforced boundary: the framework may depend on Symfony, PSR, the PHP stdlib and its own shared/contract layers, never on the plugin's extensions or `base/` | `deptrac.yaml` (below) |
| 4 | Namespaces stay semantically stable across the move | `Middag\Framework\` mapped to `src/` by PSR-4 (the legacy guess was `middag\framework\*`) |
| 5 | The kernel receives the host identity by argument or provider, never a global constant | `BootstrapInterface::getProjectRoot()`/`platform()` passed to `ContainerFactory::build()` |

## The current gate

`composer check:portability` runs two checks, and `composer check` (run by the framework's CI workflow) includes it:

- **Namespace axis — `deptrac.yaml`.** The `Framework` layer may depend only on `Ui`, `Symfony`, `Psr`, `Monolog`, `Nyholm`, `Doctrine`, `League` and `Sentry`. A `Host` layer collects any Moodle or WordPress namespace (`core\`, `core_`, `mod_`, `local_`, `block_`, `tool_`, `WP_`, `Automattic\`), and no layer may depend on it. Deptrac runs with `--fail-on-uncovered`.
- **Host-globals axis — `bin/portability-scan.php`.** Scans `src/` line by line for Moodle globals (`global $CFG`, `$DB`, `$USER`, ...), `use` of Moodle namespaces, Moodle and WordPress host functions, hard-coded absolute paths, `$CFG->dirroot`/`wwwroot`/`dataroot`, and `require`/`include` statements. Exits 1 on any hit.

**Acceptance floor: zero violations on both axes.** There is no percentage score and no exceptions allowlist; the 69% metric above is retired. The re-measurement against the PSR-4 tree on 2026-07-24 found 0 violations (deptrac: 945 allowed edges, 0 uncovered, 0 violations; scan: 250 files, 0 violations).
