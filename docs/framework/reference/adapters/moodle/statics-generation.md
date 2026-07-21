---
title: 'moodle adapter — Static Generation: CLI, Naming & Pipeline Exclusions'
---

# Static Generation: CLI, Naming & Pipeline Exclusions

Reference for how `middag-io/moodle` generates the family of Moodle static artifacts a plugin needs — capabilities, services, events, message providers, hooks, caches, and file areas — from typed definition objects.

## What gets generated

One typed definition class per kind of Moodle static, living in the boundary's `definition/` subdirectory. Extensions declare their statics by implementing the matching method on the extension interface:

| Static kind  | Declaration method          |
|--------------|------------------------------|
| Cache        | `get_cache_definitions()`    |
| Capability   | `get_capabilities()`         |
| Service      | (see services reference)     |
| Message      | (message provider method)    |
| Hook         | (hook definition method)     |
| Event        | (event definition method)    |
| File area    | (file area definition method) |

Services and file areas have non-trivial integration and their own dedicated reference material — see the Decision record links at the bottom of this page.

## CLI entry point

```
php cli/build.php --statics [target] [--basedir=.] [--dry-run]
```

| Flag | Purpose |
|---|---|
| `target` | Optional — restrict generation to one static kind (e.g. `capability`, `cache`). Omit to generate all kinds. |
| `--basedir=.` | Project root the generator runs against. Defaults to the current directory. |
| `--dry-run` | Preview generated output without writing files. |

This single entry point replaced two separate legacy scripts, `build_tasks.php` and `build_events.php`, which were removed with no backward-compatibility shim.

## Task declaration — two mechanisms

| Mechanism | Status | When to use |
|---|---|---|
| `#[schedule]` attribute | Preferred | Inline, directly on the task class |
| `get_task_definitions()` | Compatibility | Cases the attribute doesn't fit |

## Naming convention

Capability and file-area naming follow the same rule:

| Extension | Convention | Example |
|---|---|---|
| `core` | No prefix | `local/middag:manage` |
| Any other extension | `{extension_slug}_` prefix | `local/middag:ecommerce_manage` |

## Ordering

All generated files are ordered alphabetically. This is a deliberate choice: it keeps diffs predictable and reviewable — a generated file changing for an unrelated reason is easy to spot.

## Excluded from the generation pipeline

These stay manual, with no generation involved:

| Path | Notes |
|---|---|
| `db/install.xml` | Schema install definition |
| `db/upgrade*.php` | Schema upgrade steps |
| `db/install.php` | Install/upgrade procedural logic |
| `lang/` | Translation strings |

Install/upgrade extension hooks are available as the escape valve for extension-specific logic at these lifecycle points: `extend_local_middag_install_before` / `extend_local_middag_install_after`.

## Settings — the documented exception

Admin settings use the same typed-definition *pattern* as the other static kinds, but they are **not generated** by this pipeline. They resolve at runtime instead, via `settings_resolver`. See the settings-declaration reference material linked below for the full mechanism.

---

Decision record: [MDL-016 — Typed Definitions Generate Moodle Statics; Settings Are the Documented Exception](https://github.com/middag-io/middag-php-moodle/blob/docs/docs/decisions/MDL-016-moodle-statics-generation.md).
