---
title: 'Moodle Adapter — Cache Decorator (Downstream)'
---

# Cache Decorator Chain, Keys & Invalidation

> **Downstream.** This OSS adapter ships the cache port only: `CacheSupport` (Moodle's MUC) and `CacheSupportPsr16` (the same store as PSR-16). The item-repository decorator chain described below lives in a proprietary package downstream and consumes that port. Names verified against the downstream code on 2026-11-04.

Reference for the MUC-backed cache decorator over the `item` repository: chain order, key format, invalidation policy, the adapter's cache error contract, and a known discrepancy between the original decision and the implementation.

## Decorator chain

| Layer       | Class                   | Backing                                     |
| ----------- | ----------------------- | ------------------------------------------- |
| Persistence | `ItemRepository`        | Database                                    |
| Cache       | `CachedItemRepository`  | Moodle MUC, through the adapter's PSR-16 port |
| Audit       | `AuditedItemRepository` | Audit trail                                 |

Wiring is `ItemRepository` (DB) → `CachedItemRepository` (cache) → `AuditedItemRepository` (audit), with `ItemRepositoryInterface` aliased to the outermost layer. Callers depend only on the interface and never know a cache sits in front of the database.

Audit sits **after** cache. A read that hits the cache skips the database and the audit trail: no audit entry is written for a cache hit. This is deliberate; auditing every hit would defeat much of the point of caching.

## Cache keys

| Key pattern                  | Used for                                                       |
| ---------------------------- | -------------------------------------------------------------- |
| `item_{id}`                  | One item by id                                                 |
| `meta_{id}`                  | Item metadata by id                                            |
| `find_meta_{md5(key:value)}` | Metadata lookup by key/value pair (hashed to bound key length) |
| `type_{type}`                | Items filtered by type                                         |

## Invalidation policy

| Operation                     | Behavior                                                   | Why                                                                                                                                                       |
| ----------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create()` / `update()`       | Selective: only the affected keys                          | Cheap and precise; the affected keys are known at call time                                                                                               |
| `delete()` / `saveMetadata()` | **Full pool purge**                                        | Working out which composite keys (`find_meta_*`, `type_*`) a delete could affect is hard to get right; purging trades some hit rate for not solving it |

## The adapter's cache error contract

`CacheSupport` (OSS) exposes `make`, `get`, `set`, `has`, `delete`, `deleteMany`, `getMany`, `setMany`, `purge` and `getOrSet`. Cache unavailability is a normal case, never an exceptional one: the methods return `false` or an empty array instead of throwing, because a cache backend is never assumed to be available. Callers handle a "miss" the same way whether it means "not cached" or "cache is down".

## Known limitations

- No request-level in-memory cache (see below).
- Only the `item` aggregate has a cache decorator; `job`, `audit` and `activity_feed` do not, by design.
- No cache-key versioning.

## Known discrepancy: original decision vs implementation

The original decision specified **two** layers: a request-local in-memory cache plus MUC across requests, with active invalidation on write and TTL as a safety net. The implementation has **one** layer, MUC (application mode, simple keys), with no in-memory request cache. Adding one (for example through `getMany()`) remains a possible optimization that has not been built. This page describes what exists.

## Anti-patterns

| Anti-pattern                                                  | Why it is wrong                                                                          |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Injecting the concrete `ItemRepository` instead of the interface | Skips the cache decorator and risks stale reads elsewhere                             |
| Ad hoc caching inside an extension                            | Duplicates a mechanism that exists at the repository boundary, with inconsistent invalidation |
| Hard-coding a per-key TTL                                     | Not supported; TTL belongs to the MUC store configuration                               |

---

Decision records: MDL-001 (cache port) and MDL-014 in [`middag-php-moodle/docs/decisions`](https://github.com/middag-io/middag-php-moodle/tree/main/docs/decisions).
