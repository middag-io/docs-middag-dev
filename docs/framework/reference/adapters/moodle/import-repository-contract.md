---
title: 'moodle — Import Repository Contract & Operational Detail'
---

# Import Repository Contract & Operational Detail

Reference for the repository that backup/restore uses to rehydrate persisted state on the Moodle adapter — direct, unvalidated insertion of historical data, deliberately bypassing the normal domain-creation path. Backs [MDL-010](https://github.com/middag-io/middag-php-moodle/blob/docs/docs/decisions/MDL-010-backup-restore-import-repository.md).

## Why restore does not use the normal creation path

Restoring a course reconstitutes historical state exactly as it existed on the source site — it is not a new business event. Routing restored rows through the ordinary domain-creation flow (`item_repository::create()` and friends) would generate new timestamps, fire domain events, and mint a new GUID on every row — exactly wrong when the goal is to reproduce history faithfully. The import repository exists to give restore a narrow, honest path that does none of that.

## Contract

```php
interface backup_steps_provider_interface {
    public function get_backup_steps(): array;   // backup_step instances
    public function get_restore_steps(): array;  // restore_step instances
}

interface import_repository_interface extends repository_interface {
    public function import_item(array $data): int;      // raw item insert
    public function import_itemmeta(array $data): int;   // raw metadata insert
}
```

`backup_steps_provider_interface` is how a plugin or integration with its own storage participates in backup/restore (Group A, stable public API). Integrations that only use the framework's central persistence (core EAV tables) need no provider of their own — the central handler covers them.

## Tables involved

Core EAV tables: `middag_items`, `middag_itemmeta`.

## What the import repository does on insert

| Step | Behavior | Why |
|---|---|---|
| `id` field | Stripped before insertion | Moodle Restore always remaps IDs on the target site — preserving the source `id` would either collide with auto-increment or be meaningless. |
| Insert path | Direct via `db_support::insert_record()` | No domain events, no entity hydration, no validation — this is the deliberate bypass; spelled out here so it can't be "cleaned up" by someone unaware of the rationale. |
| `timecreated`, `timemodified`, `guid` | Preserved exactly as read from the `.mbz` file | Faithful historical reproduction depends on not silently regenerating these. |
| ID remapping | `$this->get_mappingid('course'\|'user', $old_id)` inside the extension's own `restore_step` | The source site's IDs do not exist on the destination — this is the only correct way to translate them. |

## Anti-patterns

| Anti-pattern | Why it's wrong |
|---|---|
| Using `item_repository::create()` during restore | Generates new timestamps/events/GUID — exactly wrong for historical import. |
| Not remapping IDs | The source site's IDs do not exist on the destination site. |
| Inserting with the `id` field present | Auto-increment collision risk; the import repository already strips it — doing this means bypassing the import repository and inserting directly. |
| Validating data during restore | Historical data may not satisfy today's domain rules. The bypass is deliberate, not a bug to fix. |

## Downstream consequence to track separately

Asynchronous jobs/work restored this way may need their own governance pass after import — tracked in the framework's own decisions record, out of scope for this adapter.

## Related

- [MDL-009 — Privacy Provider Delegates to a Specialized Repository](https://github.com/middag-io/middag-php-moodle/blob/docs/docs/decisions/MDL-009-privacy-provider-repository-delegation.md) — a structurally similar "platform contract meets repository boundary" problem.
- [MDL-001 — Consolidate the Moodle Boundary Behind a Physical Whitelist](https://github.com/middag-io/middag-php-moodle/blob/docs/docs/decisions/MDL-001-boundary-consolidation-whitelist.md) — the import repository still lives inside this physical boundary; bypassing domain rules is not the same as bypassing the boundary.
