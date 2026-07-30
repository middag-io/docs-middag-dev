---
title: 'moodle — External Services Migration & Mobile API'
---

# External Services Migration & Mobile API

Reference for the Moodle adapter's External Functions integration (`db/services.php`, `{slug}_external` classes) in `middag-io/moodle`. Backs [MDL-007](https://github.com/middag-io/moodle/blob/docs/docs/decisions/MDL-007-external-services-mobile-api.md).

## Legacy migration status

A population of externals predates the generated, typed-definition convention and has not fully migrated. This is live roadmap-relevant debt, not historical trivia.

| Extension | Status |
|---|---|
| `core` | New-style (migrated) |
| `helpdesk` | Legacy |
| `trilha` | Legacy |
| `studyplan` | Legacy |

**Legacy shape:** the external class lives at `classes/extensions/{slug}/legacy/classes/external.php`, declared manually in `legacy/db/services.php`, sometimes under an older namespace convention (`mtool_*`), entirely outside the `build_statics` generation pipeline.

## Migrating an extension from legacy to new-style

| Step | Action |
|---:|---|
| 1 | Move the external class out of `legacy/`. |
| 2 | Rename the namespace to the current convention. |
| 3 | Declare the function via `get_service_definitions()` using the typed `service` definition. |
| 4 | Remove `legacy/db/services.php`. |
| 5 | Regenerate `db/services.php` via the CLI. |
| 6 | Preserve the public function name `local_middag_{name}` so existing clients do not break. |

The last step is the one migration mistake with real blast radius: renaming the public function name breaks any client (including the official mobile app) already calling it.

## Mobile API

Including `MOODLE_OFFICIAL_MOBILE_SERVICE` in a service definition's `services` array exposes that function to Moodle's official mobile app.

## Anti-patterns

| Anti-pattern | Why it matters |
|---|---|
| Editing `db/services.php` by hand | The generation pipeline overwrites it on the next run — manual edits are silently lost. |
| Business logic living inside the external class instead of delegating to a service/command | The external class is a boundary adapter, not a place for domain logic. |
| Adding a new external under `legacy/` | `legacy/` is migration debt, not a place to grow — new externals must use the typed-definition convention from the start. |
| Forgetting `self::validate_parameters()` | A security vulnerability, not just a style issue. |
| Using `type: 'read'` for an operation that mutates state | Moodle permits a `read`-typed call without a sesskey — any mutation must be declared `write`. |
