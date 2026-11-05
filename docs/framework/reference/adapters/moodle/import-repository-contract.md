---
title: 'Moodle Adapter — Import Repository (Backup/Restore, Downstream)'
---

# Import Repository Contract & Operational Detail

> **Downstream.** Only `BackupStepsProviderInterface` ships in this OSS adapter. The import repository described below lives in a proprietary package downstream of the adapter; it is documented here because it is the reference use of the adapter's backup contract. Names verified against the downstream code on 2026-11-04.

Reference for how backup/restore rehydrates persisted state on Moodle: direct, unvalidated insertion of historical data that deliberately bypasses the normal domain-creation path.

## Why restore does not use the normal creation path

Restoring a course reconstitutes historical state exactly as it existed on the source site; it is not a new business event. Routing restored rows through the ordinary creation flow (`ItemRepository::create()` and friends) would generate new timestamps, fire domain events and mint a new GUID on every row, which is exactly wrong when the goal is to reproduce history. The import repository gives restore a narrow path that does none of that. The bypass is restricted to this restore boundary.

## Contracts

```php
// OSS — middag-io/moodle, Domain\Backup\Contract (@api)
interface BackupStepsProviderInterface {
    public function getBackupSteps(): array;   // backup_step instances
    public function getRestoreSteps(): array;  // restore_step instances
}

// Downstream (proprietary)
interface ImportRepositoryInterface {
    public function importItem(array $data): int;      // raw item insert
    public function importItemmeta(array $data): int;  // raw metadata insert
}
```

A plugin or integration with its own storage participates in backup/restore through `BackupStepsProviderInterface`. Integrations that only use the central persistence need no provider of their own; the central handler covers them. The downstream import contract deliberately does not extend the framework's generic Active Record repository contract.

## Tables involved

The central EAV tables (`middag_items`, `middag_itemmeta` in the MIDDAG product). The OSS adapter never hard-codes these names (`tests/AdapterPluginIsolationTest.php`).

## What the import repository does on insert

| Step                                 | Behavior                                                                                    | Why                                                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `id` field                           | Removed before insertion                                                                    | Moodle Restore always remaps ids on the target site; keeping the source `id` would collide with auto-increment or mean nothing |
| Insert path                          | Directly through the adapter's `DbSupport::insertRecord()`                                  | No domain events, no entity hydration, no validation: this is the deliberate bypass, spelled out so nobody "cleans it up" |
| `timecreated`, `timemodified`, `guid` | Kept exactly as read from the `.mbz` file                                                  | Faithful reproduction depends on not regenerating them                                                                 |
| Id remapping                         | `$this->get_mappingid('course'\|'user', $old_id)` inside the extension's own `restore_step` | Source ids do not exist on the destination; this is the only correct translation                                      |

Bypassing domain rules is not bypassing the boundary: the raw insert still goes through `DbSupport`, never an ad hoc `$DB` call from outside the adapter.

## Anti-patterns

| Anti-pattern                            | Why it is wrong                                                                         |
| --------------------------------------- | --------------------------------------------------------------------------------------- |
| `ItemRepository::create()` during restore | New timestamps, events and GUID: wrong for historical import                          |
| Not remapping ids                       | The source site's ids do not exist on the destination                                   |
| Inserting with the `id` field present   | Auto-increment collision; it means the import repository was bypassed                   |
| Validating data during restore          | Historical data may not satisfy today's rules; the bypass is deliberate, not a bug      |

## Downstream consequence

Asynchronous work restored this way may need its own governance pass after import; that is a downstream concern.

## Related

- [Boundary & Whitelist — mandatory plugin APIs](./boundary-whitelist#mandatory-plugin-apis-are-thin-adapters): the Privacy API faces the same "platform contract meets repository boundary" problem and delegates the same way.

---

Decision records: MDL-001 and MDL-010 in [`middag-php-moodle/docs/decisions`](https://github.com/middag-io/middag-php-moodle/tree/main/docs/decisions).
