---
title: 'Signal & Hook Reactive Model — Legacy Mechanics and Core-Owned Design'
---

# Signal & Hook Reactive Model — Legacy Mechanics and Core-Owned Design

Reference for the reactive (signal/hook/filter) model behind `middag-io/framework`, its WordPress-style `HookManager` (shipped, current), and the governed dispatch/hierarchy/outbox engine that is **not** shipped in this OSS repo but reserved for `middag-io/core`. Backs [FW-007](https://github.com/middag-io/middag-php-framework/blob/docs/docs/decisions/FW-007-signal-hook-reactive-model.md).

> Read the mechanisms marked **core-owned** below as archaeology for whoever implements or maintains `middag-io/core` — they describe the legacy `moodle-local_middag` design, not anything shipped in this framework today. The mechanisms marked **shipped** are real and current; check `Kernel/Manager/HookManager.php` before restating any exact behaviour, since implementation detail can drift from this document.

## Three-mechanism hierarchy

| Mechanism | Scope | Typing | Use | Ships in this OSS repo? |
|---|---|---|---|---|
| `dispatch()` + signal | Framework-internal | Typed (any PHP object) | Primary publication | Contract only (`SignalDispatcherInterface`) — governed dispatch is core-owned |
| Action hooks (`add_action`/`do_action`) | Public | String-based | Extension point for plugins | Yes — `HookManager` |
| Filters (`add_filter`/`apply_filters`) | Public | String-based | Value-transform pipeline | Yes — `HookManager` |

Any PHP object is a signal — no mandatory base class. The legacy governance ADR (`ADR-901`) classified `dispatcher_interface` (now `SignalDispatcherInterface`) as stable public API, Group A. The engine behind it was Symfony EventDispatcher, never exposed as the primary contract. A bridge automatically fired `do_action()` whenever `dispatch($signal)` ran — one-directional, hooks never trigger signals back — with the hook name derived from the signal's FQCN (a normalized short alias for known MIDDAG entities, a normalized FQCN otherwise); `#[no_hook]` opted a signal out of the bridge. Filters sit outside this bridge entirely, an independent mechanism with a mandatory return value.

## Signal enum vocabulary (core-owned)

Not present in this OSS repo. The legacy design introduced a controlled `signal` enum with roughly 50 cases grouped by category:

| Category | Example cases |
|---|---|
| CRUD | `CREATE`, `CREATED`, `UPDATE`, … |
| Validation / authorization | — |
| Processing / job | — |
| Audit | — |
| Content lifecycle | — |
| Data exchange | — |
| Status transitions | — |
| Workflow | — |
| Queue | — |

Extensions could use custom strings outside the enum — a recommendation, not a restriction. If `middag-io/core` reintroduces this vocabulary, this table is the historical starting point.

## Hierarchical dispatch via `aggregate_signal_interface` (core-owned)

```php
interface aggregate_signal_interface
{
    public function get_aggregate(): string;     // 'item', 'job', 'audit'
    public function get_type(): ?string;         // item_type slug or null
    public function get_action(): Signal|string;
}
```

A signal implementing this interface generated **two** hooks per dispatch: a general one (`middag/{aggregate}/{action}`) fired first, and a type-specific one (`middag/{aggregate}/{action}/{type}`) fired second — general before specific, so a listener could intercept before refinement. A signal without the interface generated exactly one hook (its normalized FQCN).

## Auto-discovery via `#[on]` (core-owned)

```php
#[Attribute(Attribute::TARGET_METHOD | Attribute::TARGET_CLASS | Attribute::IS_REPEATABLE)]
final readonly class on
{
    public function __construct(
        public Signal|string|null $signal = null,
        public string|array|null $type = null,
        public int $priority = 10,
        public string|null $aggregate = null,
    ) {}
}
```

Filter versus action was decided by the annotated method's return type: `void` registered as an action, anything else as a filter. Discovery ran via a dedicated `signal_loader` at boot. This attribute was not documented in the original `ADR-701` source itself.

## Reentrance guard (core-owned)

A composite key `{class}:{action}:{type}:{id}` guarded against loops:

| Reentrant call | Behaviour |
|---|---|
| First reentrant call on a key | Skipped, with a warning logged |
| Second reentrant call on the same key | Throws `middag_lifecycle_violation_exception` (see [exception hierarchy](https://github.com/middag-io/middag-php-framework/blob/docs/docs/decisions/FW-010-typed-exception-hierarchy.md) for the current mapping) |
| Different actions on the same ID, or same signal across different IDs | Never blocked — this guard targets true reentrance, not general high-frequency dispatch |

Not mentioned in `ADR-701` at all; reconstructed separately.

## Host events → signals → hooks (adapter/core boundary)

A `moodle_event_bridge`-equivalent converted native host events into signals through three registration styles:

- A generic declarative form with no dedicated signal class.
- An explicit-boot form with a real signal class.
- A `#[moodle_event]`-attribute auto-discovery form needing no explicit boot call.

External plugins extended this via a `lib.php`-style hook: `{plugin}_extend_local_middag_moodle_signal_loader(array $dirs): array`.

This entire bridge is host-adapter territory by construction — it translates a specific host's native events, so it cannot live in a host-agnostic framework. Whether it now lives in a host adapter repo or in core was not confirmed at reconstruction time.

## Failure isolation matrix

| Mechanism | Default role | Exception propagates? |
|---|---|---|
| `dispatch()` / signal dispatcher | Accompanies the main flow | Yes |
| `hook_manager::do_action()` | Lateral | Yes (even though lateral) |
| `hook_manager::apply_filters()` | Mandatory | Yes |
| A selected shortcode render | Mandatory | Yes |
| Bootstrap/discovery loaders | Its own bootstrap-exception rule | See [FW-012](https://github.com/middag-io/middag-php-framework/blob/docs/docs/decisions/FW-012-kernel-boot-lifecycle.md) |

The decisive rule is not "hook versus service" — it is whether the step composes the contract promised to the caller (a return value or a documented mandatory side effect). If it does, its failure travels with the main flow; otherwise it is lateral by default. **Lateral never means automatically suppressed** — there is no implicit try/catch in the hook manager; an action-hook or filter callback's exception propagates exactly like any other PHP exception, and it is the registering developer's responsibility to handle it if it should not bubble up. The one carve-out with a different rule entirely is boot-time failure isolation (FW-012, originally `ADR-609`) — that rule isolates a misbehaving *extension* at boot, a different question from whether a *single reactive callback's* exception should propagate.

## Hooks WordPress-style — mechanics (shipped, current)

`HookManager` (`Kernel/Manager/HookManager.php`) is deliberately the **secondary** public mechanism — `dispatch()`/signals is primary — aimed at casual integrators.

| Concept | Detail |
|---|---|
| Actions | `add_action`/`do_action` — side effects, no return value |
| Filters | `add_filter`/`apply_filters` — synchronous transform, mandatory return value |
| Ordering | Priority (lower runs earlier) + accepted-argument count |
| Naming | Derived automatically from the signal's FQCN, same convention as the dispatch bridge; legacy `lib.php` host-integration hooks not derived from a signal kept a host-specific prefix |
| Registration | Per extension at boot: inline in a `register_hooks()`-style method, or auto-discovery via classes extending `Kernel/Module/AbstractHookRegister.php` |
| State | Per-instance, not static/global — closes a multi-plugin-collision failure mode the legacy static registry carried |
| Observability | The legacy `hook_manager` measured execution time per callback and logged a warning past a configurable slow-callback threshold (`middag_hook_slow_threshold_ms`, default 100 ms, `0` disables it) — purely passive, no throttling or cancellation. Whether the live `HookManager`'s opt-in `setProfileCollector()` mechanism still enforces a default threshold, or leaves that entirely to the bound `ProfileCollectorInterface` consumer, was not confirmed at reconstruction time — check `Kernel/Manager/HookManager.php` before restating either behaviour as current. |
| Coexistence with host hooks | Scoped as non-overlapping by design (e.g. Moodle Hooks 4.4+): host hooks integrate with the platform itself, MIDDAG hooks exist for product extensibility |

Substantial I/O inside a callback was expected to move to the async command/job model instead — see [FW-008](https://github.com/middag-io/middag-php-framework/blob/docs/docs/decisions/FW-008-command-bus-async-job-model.md), a deliberately distinct mechanism (explicit intent to do work, versus reactive observation here).

## The legacy async signal outbox (core-owned)

An outbox layer sitting over the signal dispatcher, for asynchronous consumers reacting to an already-dispatched signal without the publisher needing to know who they are — explicitly distinct from the command/job model: outbox is for *observers reacting to something that happened*; commands are for *explicit intent to do work*.

**Serialization contract:**

```php
interface async_signal_interface
{
    public function to_payload(): array;
    public static function from_payload(array $payload): static;
}
```

**Consumer registration:**

```php
#[async_on(signal: enrollment_completed::class, priority: 10)]
public function sync_warehouse(enrollment_completed $signal): void { ... }
```

Discovered at boot via an `async_signal_loader` scanning services tagged `middag.signal_handler`; the attribute is `IS_REPEATABLE`.

**Persistence — two tables:**

| Table | Grain | Key fields |
|---|---|---|
| `middag_event_outbox` | One row per dispatch that has async consumers | `signal_class`, `payload`, `status pending → done` |
| `middag_event_delivery` | One row per consumer per dispatch | `status pending → queued → done/failed → dead`, `attempts`, `last_error` |

**Pipeline:** `outbox_write()` → a scheduled `outbox_worker_task` (every minute, `blocking:1`) → `queue_worker` → an ad hoc job per delivery → an async delivery task → `from_payload()` → resolve the consumer from the container → execute → mark the delivery done and attempt to close the outbox entry.

**Retry / dead-letter:** below `max_attempts` (default 3), a failed delivery re-queues on the next cycle; at or above `max_attempts` it becomes `dead` and requires manual intervention — no automatic replay in this design; replay was a documented manual `UPDATE` against the database.

**Idempotency guard:** the async delivery task checks for `status = done` before executing, to avoid double-processing when the outbox worker re-queues a `failed` delivery while a host's own native retry for the original ad hoc job is still pending.

**Purge:** a daily task (3 AM) removes `done` rows older than a configurable retention window (default 30 days) and `dead` rows older than a separate window (default 90 days).

**Wiring detail (container-specific):** the async consumer registry and the outbox store were registered as explicit **public** services in the container's basic-configuration step — necessary because resolving a service from a compiled Symfony DI container works only for public services, and neither of these two classes carried a suffix the service loader would auto-register.

## Checklist for implementing an async signal consumer (core-owned)

- A signal must implement `async_signal_interface`.
- `to_payload()`/`from_payload()` must be exact inverses, including nullable fields.
- A consumer must be idempotent and must not depend on the original HTTP request's state (no session, no request-scoped user context).
- A consumer must catch its own expected exceptions and let only genuinely unexpected ones propagate.
- A signal must not carry non-serializable objects in its constructor.
