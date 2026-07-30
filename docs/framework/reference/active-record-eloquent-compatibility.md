---
title: 'framework — Active Record ↔ Eloquent Compatibility'
---

# Active Record ↔ Eloquent Compatibility

`middag-io/framework` does not depend on Eloquent. It ships its own host-agnostic, Eloquent-inspired Active-Record layer built on `ConnectionAdapterInterface`, plus a Data-Mapper path for a clean domain. The two paths coexist by design — see [Architecture](../explanation/architecture) for how persistence fits into the wider ecosystem.

## The three pieces

- **`Persistence/Model.php`** — the Active Record base: `find`/`all`/`where`/`save`/`delete`/casts/`fillable`, creators, opt-in timestamps, `fresh`/`refresh`/`replicate`, local scopes, relationships with eager loading. `save()` is **not final** — persistence itself lives in `performInsert()`/`performUpdate()`, which are seams — so `middag-io/core` can subclass `Model` and wrap those seams with audit, revisioning or events, without this OSS layer ever knowing about it.
- **`Persistence/Query/QueryBuilder.php`** — an **immutable** query builder: every fluent method returns a new copy rather than mutating in place. It has an **ON** mode (terminals execute via the connection) and an **OFF** mode (`compile()`/`toSql()`/`getBindings()` for inspection, caching, or testing without a live connection).
- **`Persistence/Repository/AbstractRepository.php`** + **`Mapper/AbstractMapper.php`** — the Data-Mapper path into the domain: hydrates plain POPO entities (`EntityInterface`) from rows, so the Active-Record `Model` never leaks outside infrastructure.

**Two paths, by design, not an accident:** Active Record (`Model`) for fast writes inside infrastructure code; Data-Mapper (`Repository` → POPO) for a clean domain layer. The rule that ties them together: no domain entity ever extends `Model`, and no controller ever calls the query builder directly — both are the infrastructure/repository layer's job.

## Public API compatibility matrix

The framework's Active Record layer honours a **subset** of Eloquent's public API, using the same names and semantics, plus one addition (the OFF mode above). A developer coming from Laravel will recognise the surface immediately — but the gaps and divergences below are real, and copying Eloquent habits blindly here will break.

### Compatible — same name, same semantics

`find` · `findOrFail` · `all` · `first` · `where` · `orWhere` · `whereIn` · `whereNotIn` · `orWhereIn` · `whereBetween` · `whereNull` · `whereNotNull` · `whereColumn` · `orWhereColumn` · `select` · `addSelect` · `distinct` · `join` · `leftJoin` · `orderBy` · `orderByDesc` · `latest` · `oldest` · `groupBy` · `having` · `orHaving` · `union` · `unionAll` · `limit` · `offset` · `forPage` · `lockForUpdate` · `sharedLock` · `value` · `pluck` · `count` · `sum` · `avg` · `min` · `max` · `exists` · `get` · `cursor` · `chunk` · `lazy` · `insertGetId` · `updateOrInsert` · `upsert` · `save` · `delete` · `fill` · `toArray` · `getKey` · `getKeyName` · `create` · `firstOrNew` · `firstOrCreate` · `updateOrCreate` · `fresh` · `refresh` · `replicate` · `hasOne` · `hasMany` · `belongsTo` · `belongsToMany` · `with` · `load` · local scopes (`scopeX`) · `$fillable` · `$guarded` · `$casts` · `$incrementing` · `$primaryKey` · `$table` · `$timestamps`.

### Behavioural divergences — footguns to always document

| Aspect | Eloquent | MIDDAG Active Record | Impact |
|---|---|---|---|
| **Builder mutability** | Mutable (`$q->where()` mutates in place) | **Immutable** (returns a copy) | `$q->where('a', 1);` without reassigning is a **silent no-op**. Always write `$q = $q->where(...)`, or chain. |
| **Collection return** | `Illuminate\Support\Collection` | Plain `array` | No `->map()`/`->filter()` chaining — use PHP array functions instead. |
| **`paginate()`** | Reads the page number from the global request | Explicit `paginate(int $page, int $perPage)` | Host-agnostic by design — pagination is never implicitly coupled to a global request object. |
| **Casts** | Rich + custom `CastsAttributes` | Primitives + backed enum + array/json, lazy on read | A custom cast has to be implemented in the mapper or in core. |
| **Relation collection** | `Collection` (lazy/eager) | Plain `array`, cached in `$relations` | Eager-load via `with()`/`load()`; no Collection chaining on the result. |
| **`$timestamps`** | Defaults to `true` | Defaults to **`false`** (opt-in) | A table without `created_at`/`updated_at` does not break anything by default; turn timestamps on per model when you need them. |

### Absent — a recorded gap, not an oversight

- **Model events/observers** (`saving`/`saved`/`creating`, …) — intentional: core's governed layer supplies these via subclassing (`performInsert`/`performUpdate` are exactly the seams for it).
- **Global scopes** (a multi-tenant `GlobalScope`) — core's concern; local `scopeX()` methods are OSS.
- **Audited soft deletes** (`SoftDeletes`, `withTrashed`) — core.
- **Relation wheres** (`whereHas`/`has`/`withCount`) — need a correlated subquery; added only against a real, concrete use case.
- **Custom casts** (`CastsAttributes`) — OSS covers primitives, backed enums, and array/json; a genuinely custom cast object belongs in the mapper or in core.
- **Rich `Collection`** (`Illuminate\Support\Collection`) — an intentional divergence; the framework returns plain `array` throughout.

## Gap policy

The OSS layer stays deliberately lean. Governed features — model events, multi-tenant global scopes, audited soft delete — belong to **core**, via subclassing. Query-builder parity and the Model conveniences already listed (creators, opt-in timestamps, rich-enough casts, `fresh`/`refresh`/`replicate`, local scopes, relationships with eager loading) are OSS and host-agnostic. New public surface only lands against a real use case — open an issue first rather than pre-building for a hypothetical one.
