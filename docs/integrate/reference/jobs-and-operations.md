---
title: 'Jobs and operations'
---

# Jobs and operations

The `@api` types an extension uses to record governed jobs, to send messages on the job bus, and to take part in import, export and clone operations over items. `middag-io/core` is on its pre-stable `1.x` line; only the curated `@api` types are meant for integrators, and an open enum may gain values, so handle values you do not know. See [Integrating with MIDDAG](/integrate/explanation/overview).

## Jobs

The curated contracts are `JobServiceInterface` and `JobMessage`. The rows marked as supporting types are `@api` types that appear in their signatures.

| Type | Role |
|---|---|
| `Middag\Core\Domain\Job\Contract\JobServiceInterface` | Opens and reads job records, and records attempts. |
| `Middag\Core\Domain\Job\Contract\JobMessage` | Marker contract for a message that MIDDAG governs on the job bus. |
| `Middag\Core\Domain\Job\Contract\JobControllerInterface` | Supporting type. Sends a `JobMessage` through the job bus. |
| `Middag\Core\Domain\Job\JobDto` | Supporting type. Input for a new or updated job record. |
| `Middag\Core\Domain\Job\Contract\JobInterface` | Supporting type. A job record, read-only. |
| `Middag\Core\Domain\Job\Contract\JobAttemptInterface` | Supporting type. One attempt of a job. |

### JobServiceInterface

| Method | Behaviour |
|---|---|
| `dispatch(JobDto $dto): JobInterface` | Creates the job record. When `$dto->command` is set, the job type becomes the command's class name and the payload becomes the JSON of `toPayload()`. |
| `find(int $id): ?JobInterface` | Returns the job, or `null` when the id does not exist. |
| `recordAttempt(int $jobid, JobAttemptInterface $attempt): void` | Appends an attempt to the job's attempt log. |

`JobDto` fields include `extension`, `jobtype`, `transport`, `priority`, `dedupkey`, `groupkey`, `correlationid`, `subjecttype`, `subjectid`, `subjectkey`, `payload` and `maxattempts`. The defaults are `extension: 'system'`, `jobtype: 'generic'`, `priority: 50` and `maxattempts: 3`.

### JobMessage

A message opts in to MIDDAG governance (persistence, retry policy, observability) by implementing `JobMessage`. Any other object on the bus is not governed. Keep the message immutable and make `toPayload()` and `fromPayload()` exact inverses, so the message survives a round trip through the transport.

```php
<?php

declare(strict_types=1);

namespace Acme\Reports\Job;

use Middag\Core\Domain\Job\Contract\JobMessage;

final readonly class RebuildReport implements JobMessage
{
    public function __construct(public int $reportId) {}

    public function getJobtype(): string
    {
        return 'acme.reports.rebuild';
    }

    public function toPayload(): array
    {
        return ['reportId' => $this->reportId];
    }

    public static function fromPayload(array $payload): static
    {
        return new static((int) $payload['reportId']);
    }
}
```

Send it with `JobControllerInterface::dispatch(JobMessage $message, array $stamps = []): Envelope`. The return value is a Symfony Messenger `Envelope`.

For the signals that jobs raise, see [Signals and hooks](/integrate/reference/signals-and-hooks).

## Operations

An operation is one unit of work over a set of items: an import, an export, a clone or a format migration. A product extends it in four ways, from the smallest to the largest reach: declare the metadata fields of an item type, add a hook, transform the payload between export and import, or register a whole operation of its own.

| Type | Role |
|---|---|
| `Middag\Core\Operation\Contract\OperationInterface` | Any operation: `kind()`, `name()`, `supports($request)` and `execute($request)`. |
| `Middag\Core\Operation\Contract\OperationHookInterface` | Listener around a run: `before()`, `after()` and `failed()`. |
| `Middag\Core\Operation\Contract\ImportOperationInterface` | Adds `import(ImportRequest $request): ImportResult`. |
| `Middag\Core\Operation\Contract\ExportOperationInterface` | Adds `export(ExportRequest $request): ExportResult`. |
| `Middag\Core\Operation\Contract\CloneOperationInterface` | Adds `duplicate(CloneRequest $request): CloneResult`. |
| `Middag\Core\Operation\Export\Contract\ExportSourceInterface` | Where an export reads raw item rows, metadata and child ids. |
| `Middag\Core\Operation\Import\Contract\ImportTargetInterface` | Where an import writes. Extends `ImportRepositoryInterface` with lookup by guid, item update, metadata upsert and metadata delete. |
| `Middag\Core\Operation\Contract\OperationRegistryInterface` | Supporting type. `register()`, `forRequest()` and `all()`. |
| `Middag\Core\Operation\Enum\OperationKind` | Supporting type. `Import`, `Export`, `Clone` or `Migrate`. |
| `Middag\Core\Operation\Enum\ImportMode` | Supporting type. `Upsert`, `Insert` or `Skip`. |

Rules the contracts set:

- `name()` is a stable, namespaced id such as `core.item.import`. Prefix your own names with your extension so they do not take the slot of a core operation.
- `forRequest()` checks the most recently registered operation first and returns the first one of the request's kind whose `supports()` returns `true`. With no match it throws `CoreOperationException`. Registering a name again replaces the old entry. The core request classes are final. To handle your own requests without replacing the generic operation, define your own `OperationRequestInterface` implementation, register an operation under a new name, and claim that request type in `supports()`.
- `OperationKind` is not an open enum. Core adds a kind only by its own decision. To add behaviour, register a variant of an existing kind and select it with `supports()`.
- `before()` may throw to stop the run before it touches the target. `after()` and `failed()` run when the outcome is decided; core treats them as best effort. `failed()` runs only when the run aborted; a run that finished with errors reaches `after()` with `isSuccessful() === false`.
- `ImportMode::Upsert` matches by guid and rewrites the match, so a repeated import converges on the same rows. `Insert` always inserts. `Skip` leaves a matched row untouched. An item without a guid always inserts.
- `ExportSourceInterface` and `ImportTargetInterface` implementations only persist. They do not check capabilities or validate. Their methods throw `CorePersistenceException`.

Operations throw `CoreOperationException` when a request is not supported, a document cannot be decoded or the run aborts. See [Errors](/integrate/reference/errors). For the item model that operations move, see [Items and metadata](/integrate/reference/items-and-metadata).
