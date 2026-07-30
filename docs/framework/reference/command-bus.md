---
title: 'Command Bus — Dispatch, Scheduling & Job Model'
---

# Command Bus — Dispatch, Scheduling & Job Model

Reference for `middag-io/middag-php-framework`'s command bus: dispatch API, handler resolution, declarative scheduling, the (core-owned) job aggregate, and serialization rules. Backs [FW-008](https://github.com/middag-io/middag-php-framework/blob/docs/docs/decisions/FW-008-command-bus-async-job-model.md).

## Dispatching a command

A command is a plain, `final readonly` class implementing `CommandInterface`; a handler is resolved for it and invoked through `Bus/MessageBus`:

```php
final readonly class CreateItem implements CommandInterface
{
    public function __construct(
        public string $type,
        public array $metadata,
        public int $userId,
    ) {}
}

final class CreateItemHandler
{
    public function __construct(
        private ItemRepositoryInterface $repository,
    ) {}

    public function __invoke(CreateItem $command): Item { /* ... */ }
}

$bus->dispatch(new CreateItem(...));
```

`dispatch()` is the **only** call — there is no `dispatch_async()` and no `handle()`. Whether the command runs inline or gets routed to a transport (drained later by `Bus/Command/CommandWorker`) is decided by middleware/routing configuration, not by which method the caller invokes.

### Dispatch API — design history

Three sources describe this API across the project's history; only the current code is normative:

| Source | Sync call | Async call |
|---|---|---|
| `ADR-705` (legacy, normative) | `$bus->dispatch($command)` | `$bus->dispatch_async($command)` |
| `ref-705` (legacy, contradicted the ADR) | `command_bus::handle($command)` (static facade) | `command_bus::dispatch_async($command)` |
| **`Bus/MessageBus.php` (current)** | **`dispatch($command)`** — one surface for both | same call; transport routing decides |

`MessageBus` extends Symfony Messenger's own `MessageBus` and adds no framework-specific `handle()` or `dispatch_async()` method.

## Handler resolution

| Locator | Resolves via | Use when |
|---|---|---|
| `ConventionHandlersLocator` | Naming convention: `{Command}` → `{Command}Handler` | The handler class name is directly derivable from the command class name. |
| `AttributeHandlersLocator` | `#[AsCommandHandler(command: SomeCommand::class)]` on the handler class | The host's native naming doesn't fit the convention (e.g. a Moodle-style snake_case `*_command_handler` class), or the handler's `__invoke()` has no typed parameter to infer the message type from. |

Both locators are `@api`-relevant extension points — a project picks whichever fits its naming, they are not alternatives to choose between once and discard.

## Declarative scheduling

A `schedule` is a periodic trigger for a command, declared with an attribute:

```php
#[Schedule(minute: '0', hour: '4')]
final readonly class CleanLogsCommand extends Command { /* ... */ }
```

| Field | Notes |
|---|---|
| `minute`, `hour`, `day`, `month`, `weekday` | Standard cron notation. |
| `'R'` (any field) | Accepted for hosts implementing random scheduling (the Moodle `db/tasks.php` pattern). |
| `$exclusive` | Host-neutral "do not run concurrently" hint; the adapter maps it onto its own locking primitive. |

A host adapter converts the attribute into its own native scheduling primitive (Moodle's task-definition array, WordPress's `wp_schedule_event` payload). The reading/matching/running side of the DSL is implemented by `Bus/Schedule/CronFieldMatcher.php`, `Bus/Schedule/ScheduleReader.php`, and `Bus/Schedule/ScheduleRunner.php`.

## Job aggregate (core-owned, not shipped in this framework)

This framework's OSS surface is transport-agnostic: `Bus/MessageBus`, `Bus/Transport/InMemoryTransport` (the OSS default transport), and `Bus/Command/CommandWorker`. Governed job observability — retry, correlation, dedup, full lifecycle persistence — is `middag-io/core` territory (see `architecture.md`, Pillar 3). The table below documents that core-owned aggregate for whoever implements or maintains that layer.

**Lifecycle:** `pending` → `started` → `completed`, or `failed` (recorded as a `job_attempt`) → retried → back to `pending` with `attempts` incremented → `failed` permanently at max attempts.

| Field | Purpose |
|---|---|
| `uuid` | Job identity. |
| `extension`, `jobtype` | What kind of work this is and who owns it. |
| `status` | Current lifecycle state. |
| `priority` | Scheduling weight among pending jobs. |
| `payload` | The command's serialized `to_payload()` output. |
| `attempts`, `maxattempts` | Retry counter and ceiling. |
| `correlationid` | Ties related jobs together across a business transaction. |
| `dedupkey` | Prevents duplicate enqueue of equivalent work. |
| `groupkey` | Groups jobs that must serialize relative to each other. |
| `transport` | Which transport the job was routed through. |

`job_attempt` is an immutable satellite record written once per attempt.

## Serialization

Commands serialize via a framework-defined `CommandInterface::to_payload()` / `from_payload()` pair — **never** a generic `serialize()`/`json_encode()`. This keeps a queued payload's shape independent of PHP's own serialization format. Incompatible schema changes to an already-queued command still require explicit rollout coordination; no automatic payload-versioning mechanism exists.

## Anti-patterns

| Anti-pattern | Why it's wrong |
|---|---|
| Logic in the handler's constructor instead of `__invoke()` | Constructor runs at resolution time, not dispatch time — breaks the handler's single point of execution. |
| A mutable command class | Commands should be `final readonly`; mutability invites state to change between dispatch and handling. |
| Serializing objects directly inside `to_payload()` instead of primitive/array data | Defeats the point of a dedicated payload contract — reintroduces PHP-serialization coupling through the back door. |
| A handler reaching for a host's raw data-access global instead of an injected repository | Violates the persistence boundary — see [FW-013](https://github.com/middag-io/middag-php-framework/blob/docs/docs/decisions/FW-013-repository-persistence-boundary.md). |
| Calling `dispatch()` on an async-routed message without testing the `from_payload(to_payload())` round trip | The only way to catch a payload that doesn't survive serialization before it reaches production. |
| A job with no `maxattempts` set | An infinite retry loop waiting to happen. |
