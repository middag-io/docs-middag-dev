---
title: 'Signals and hooks'
---

# Signals and hooks

A signal is a PHP object that `middag-io/core` dispatches when something happens, for example when an item is created. An extension reacts to a signal with the `#[On]` attribute (synchronous) or the `#[AsyncOn]` attribute (asynchronous). `middag-io/core` is on its pre-stable `1.x` line; only the curated `@api` types are meant for integrators, and an open enum may gain values, so handle values you do not know. See [Integrating with MIDDAG](/integrate/explanation/overview).

## Types

| Type | Role |
|---|---|
| `Middag\Core\Bus\Signal\Attribute\On` | Method attribute. Subscribes the method to a signal hook. Repeatable. |
| `Middag\Core\Bus\Signal\Attribute\AsyncOn` | Method attribute. Registers the method as an asynchronous consumer of a signal class. Repeatable. |
| `Middag\Core\Bus\Signal\Attribute\NoHook` | Class attribute on a signal class. The signal fires no hook. |
| `Middag\Core\Bus\Signal\Contract\AggregateSignalInterface` | A signal that belongs to an aggregate: `getAggregate()`, `getType()`, `getAction()`. |
| `Middag\Core\Bus\Signal\Contract\AsyncSignalInterface` | A signal that can be serialized for asynchronous delivery: `toPayload()`, `fromPayload()`. |
| `Middag\Core\Domain\Item\ItemSignal` | Signal of the `Item` aggregate. |
| `Middag\Core\Domain\Job\JobSignal` | Signal of the `Job` aggregate. |
| `Middag\Core\Bus\Signal\Enum\Signal` | Recommended vocabulary of actions (`Created`, `Updated`, `Deleted`, `Completed` and others). |
| `Middag\Core\Bus\Signal\AsyncDispatchOptions` | Options for an asynchronous dispatch: target user id and queue priority. |

To dispatch your own signal, type-hint `Middag\Framework\Bus\Contract\SignalDispatcherInterface` (from the public `middag-io/framework`) and call `dispatch(object $signal): object`.

## How the hook name is built

A signal that implements `AggregateSignalInterface` fires two hooks, general first:

```text
middag/{aggregate}/{action}
middag/{aggregate}/{action}/{type}
```

`{action}` is the string value of the action (`Signal::Created` becomes `created`). The second hook fires only when `getType()` is not null or empty.

Any other signal fires one hook: its fully qualified class name with `\` replaced by `/`. A signal class marked `#[NoHook]` fires no hook.

## Item and Job signals

| Signal | Aggregate | Type segment | Payload |
|---|---|---|---|
| `ItemSignal` | `item` | The item type slug, from `$item->getType()` | `item` (`ItemInterface`), `action`, `previous` (`?ItemInterface`), `context` (array) |
| `JobSignal` | `job` | The job type, from `$job->getJobtype()` | `job`, `action`, `context` (array) |

Core does not dispatch `JobSignal` itself today. A `middag/job/...` hook fires only when code dispatches a `JobSignal`.

The item service in core dispatches three `ItemSignal`s:

| Action | Hooks | Notes |
|---|---|---|
| `Signal::Created` | `middag/item/created`, `middag/item/created/{type}` | After the item, its audit entry and its revision are written. |
| `Signal::Updated` | `middag/item/updated`, `middag/item/updated/{type}` | `previous` holds the item before the update. |
| `Signal::Deleted` | `middag/item/deleted`, `middag/item/deleted/{type}` | `item` holds the deleted item. Dispatched only when the item existed. |

`Signal` is a vocabulary, not a closed list: an action can be any string. Match actions with a `default` arm and ignore values you do not know. Items are described in [Items and metadata](/integrate/reference/items-and-metadata); jobs in [Jobs and operations](/integrate/reference/jobs-and-operations).

## Subscribe with `#[On]`

`#[On]` takes four arguments:

| Argument | Type | Default | Meaning |
|---|---|---|---|
| `signal` | `Signal\|string\|null` | `null` | The action. Without it the method is not registered. |
| `type` | `string\|array\|null` | `null` | Type slug, or a list of slugs. `null` subscribes to the general hook. |
| `priority` | `int` | `10` | Lower runs earlier. |
| `aggregate` | `?string` | `null` | The aggregate. `null` means `item`. |

```php
namespace local_acme\extensions\acme\listener;

use Middag\Core\Bus\Signal\Attribute\On;
use Middag\Core\Bus\Signal\Enum\Signal;
use Middag\Core\Domain\Item\ItemSignal;

final class product_signal_handler
{
    #[On(Signal::Created, type: 'product')]
    public function onCreated(ItemSignal $signal): void
    {
        $sku = $signal->item->getMeta('sku');
        // React to the new product.
    }

    #[On(Signal::Updated, type: 'product')]
    public function onUpdated(ItemSignal $signal): void
    {
        $before = $signal->previous;
        // Compare $before with $signal->item.
    }
}
```

Rules:

- **Return `void`.** A method with a non-`void` return type is registered as a filter. The signal dispatch runs only actions, so that method is not called.
- **Put `#[On]` on a public method.** Discovery looks for `#[On]` or `#[AsyncOn]` on public methods. A class-level `#[On(type: ...)]` sets a default `type` for the methods of that class.
- **Set `aggregate` for a non-item signal.** `#[On(Signal::Completed, aggregate: 'job')]` subscribes to `middag/job/completed`. Core does not dispatch `JobSignal` itself today; a `middag/job/...` hook fires only when code dispatches a `JobSignal`.
- **Prefer a slug string for `type`.** A class name also works, but the slug comes from the class's `TYPE` constant, or else from its lowercased short name. The `#[ItemType]` attribute is not read here.
- **Name the file so it is registered as a service.** On the Moodle host, only files with a service suffix such as `_handler.php`, `_service.php` or `_provider.php` become services. A class in any other file is never scanned for `#[On]`. Do not place handlers under directories such as `dto`, `entity`, `enum` or `contract`; those are not scanned.
- **Keep constructor dependencies resolvable.** A handler whose constructor dependencies cannot be resolved is skipped without an error.

## Consume asynchronously with `#[AsyncOn]`

`#[AsyncOn]` registers a method as a consumer of a signal class. The signal class must implement `AsyncSignalInterface`, with a flat, JSON-serializable payload. `ItemSignal` and `JobSignal` do not implement it, so they cannot be consumed with `#[AsyncOn]`.

| Argument | Type | Default | Meaning |
|---|---|---|---|
| `signal` | `string` | (required) | Fully qualified class name of the signal. |
| `priority` | `int` | `10` | Lower is delivered earlier. |
| `maxAttempts` | `?int` | `null` | Retry ceiling for this consumer. `null` keeps the host default. |

```php
use Middag\Core\Bus\Signal\Attribute\AsyncOn;
use Middag\Core\Bus\Signal\Contract\AsyncSignalInterface;

final readonly class report_requested implements AsyncSignalInterface
{
    public function __construct(public int $reportid) {}

    public function toPayload(): array
    {
        return ['reportid' => $this->reportid];
    }

    public static function fromPayload(array $payload): static
    {
        return new static((int) $payload['reportid']);
    }
}

// In report_signal_handler.php:
final class report_signal_handler
{
    #[AsyncOn(signal: report_requested::class, maxAttempts: 3)]
    public function build(report_requested $signal): void
    {
        // Build report $signal->reportid.
    }
}
```

When the host has an outbox, the dispatch writes one delivery per consumer and a worker runs the consumer later. When the host has no outbox, core runs the consumers inline during the dispatch, if the host gave it a way to build them.

## Dispatch behaviour

- `#[NoHook]` skips the hooks, so `#[On]` handlers do not run for that signal. `#[AsyncOn]` consumers still run.
- A signal dispatched from inside a handler is queued and runs after the current signal, not inside it.
- A chain longer than the host limit (16 hops by default) throws `Middag\Core\Exception\CoreLifecycleViolationException`, and the rest of the chain is discarded. See [Errors](/integrate/reference/errors).
- An exception in an `#[On]` handler propagates to the code that dispatched the signal.
- For item signals the write is already done when the handler runs. The item service does not roll it back when a handler throws, so `create()` or `update()` can throw after the item was saved.
