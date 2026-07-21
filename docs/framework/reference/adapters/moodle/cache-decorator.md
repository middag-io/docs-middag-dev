---
title: 'moodle adapter — Cache Decorator Chain, Keys & Invalidation'
---

# Cache Decorator Chain, Keys & Invalidation

Reference for the MUC-backed cache decorator over the `item` repository in `middag-io/middag-php-moodle` — the decorator chain order, cache-key format, invalidation policy, the `cache_support` error contract, and a known discrepancy between the decision record and the current implementation.

## Decorator chain

| Layer | Class | Backing |
|---|---|---|
| Persistence | `item_repository` | Database |
| Cache | `cached_item_repository` | Moodle MUC (Moodle Universal Cache) |
| Audit | `audited_item_repository` | Audit trail |

Call order is `item_repository (DB)` -> `cached_item_repository (MUC)` -> `audited_item_repository (audit)`, aliased behind `item_repository_interface` via DI. Callers depend only on the interface — they never know a cache decorator sits in front of the database-backed implementation.

Audit sits **after** cache in the chain, not before. Consequence: a read that hits the cache skips the database *and* the audit trail entirely — no audit entry is generated for a cache hit. This is deliberate, not an oversight: auditing every cache hit would defeat much of the point of caching.

## Cache keys

| Key pattern | Used for |
|---|---|
| `item_{id}` | Single item lookup by ID |
| `meta_{id}` | Item metadata by ID |
| `find_meta_{md5(key:value)}` | Metadata lookup by arbitrary key/value pair (hashed to keep the key bounded-length) |
| `type_{type}` | Items filtered by type |

## Invalidation policy

| Operation | Behavior | Why |
|---|---|---|
| `create()` / `update()` | Selective invalidation — only the affected keys are cleared | Cheap and precise; the affected keys are known at call time |
| `delete()` / `save_metadata()` | **Full pool purge** — the entire cache pool is cleared | Reliably determining which composite keys (`find_meta_*`, `type_*`) a given delete could have affected is hard to get right; purging the whole pool trades some cache-hit rate for not having to solve that problem |

## `cache_support` error contract

| Method | Notes |
|---|---|
| `get`, `set`, `delete`, `delete_many`, `get_many`, `set_many`, `purge`, `get_or_set` | Full API surface used by the decorator |

Cache unavailability is treated as a normal, expected case, never an exceptional one: every method above returns `false` or an empty array instead of throwing. A cache backend is never assumed to be reliably available, so callers must handle the "miss" return the same way whether it means "not cached" or "cache is down."

## Known limitations

- No in-memory request-level cache (see "Known discrepancy" below).
- Only the `item` aggregate has a cache decorator today — `job`, `audit`, and `activity_feed` do not, by design, not oversight.
- No cache-key versioning.

## Known discrepancy: decision record vs. real implementation

The decision record behind this decorator ([MDL-014](https://github.com/middag-io/middag-php-moodle/blob/docs/docs/decisions/MDL-014-muc-cache-decorator.md)) originally specified **two** caching layers: a request-local in-memory cache plus MUC persisted across requests, with active invalidation on write and TTL as a safety net. The real implementation has only **one** layer — MUC (`MODE_APPLICATION`, `simplekeys: true`) — with no in-memory request cache. Adding one (via `get_many()`) remains a future optimization that has not been built. Treat the real implementation (this page) as authoritative for what exists today; the decision record is tracked as known technical debt on this point, not re-litigated here.

## Anti-patterns

| Anti-pattern | Why it's wrong |
|---|---|
| Bypassing the facade and calling the concrete `item_repository` directly | Skips the cache decorator entirely, defeating its purpose and risking stale reads elsewhere |
| Ad hoc manual caching inside an extension | Duplicates a mechanism that already exists at the repository boundary, with its own inconsistent invalidation rules |
| Hardcoding a per-key TTL | Not supported — TTL is owned by the MUC backend configuration, not by individual call sites |

---

Decision record: [MDL-014 — MUC Cache Decorator over the Item Repository](https://github.com/middag-io/middag-php-moodle/blob/docs/docs/decisions/MDL-014-muc-cache-decorator.md).
