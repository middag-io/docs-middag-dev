---
title: 'Command bus, handlers and scheduling'
---

# Command bus, handlers and scheduling

The framework exposes one dispatch operation for commands. A configured bus handles a message immediately when there is no sender route, or sends it to a transport for a worker to handle later. [FW-008](https://github.com/middag-io/middag-php-framework/blob/main/docs/decisions/FW-008-command-bus-async-job-model.md) records that choice. This reference describes the current `middag-php-framework` API.

## Public contracts

| Type | Role |
| --- | --- |
| [`CommandInterface`](https://github.com/middag-io/middag-php-framework/blob/main/src/Bus/Contract/CommandInterface.php) | Command payload contract: `toPayload(): array` and `fromPayload(array): static`. |
| [`AbstractCommand`](https://github.com/middag-io/middag-php-framework/blob/main/src/Bus/Command/AbstractCommand.php) | Optional base class implementing `CommandInterface`; a command may implement the interface directly. |
| [`MessageBusInterface`](https://github.com/middag-io/middag-php-framework/blob/main/src/Bus/Contract/MessageBusInterface.php) | Framework bus contract extending Symfony Messenger's message bus interface. Call `dispatch($command)` on this contract. |
| [`MessageBusFactory`](https://github.com/middag-io/middag-php-framework/blob/main/src/Bus/MessageBusFactory.php) | Creates the bus with send/handle middleware and a default convention handler locator. Accepts a sender locator, another handler locator and prepended middleware. |

The concrete `MessageBus` is `@internal`; integrations depend on `MessageBusInterface`. The factory's default has no sender locator, so it handles messages synchronously. With sender routing, the same `dispatch()` call sends matching messages to a transport; `CommandWorker` consumes them. There is no framework `dispatch_async()` or `handle()` method on the bus.

## Handlers

[`ConventionHandlersLocator`](https://github.com/middag-io/middag-php-framework/blob/main/src/Bus/Command/ConventionHandlersLocator.php) resolves a command class to a handler service named `{Command}Handler`. [`AttributeHandlersLocator`](https://github.com/middag-io/middag-php-framework/blob/main/src/Bus/Command/AttributeHandlersLocator.php) binds handlers marked with `#[AsCommandHandler(command: ...)]`; it can fall back to a convention locator when no attribute matches. Both locators are marked `@api`. The host must register handler services in its container.

A command carries data; its handler performs the work when the bus invokes it. `CommandInterface` does not require a command class to be `final` or `readonly`, although immutable commands simplify queued execution.

## Queued payloads

[`CommandSerializer`](https://github.com/middag-io/middag-php-framework/blob/main/src/Bus/Command/CommandSerializer.php) calls `toPayload()` and encodes that array as JSON; deserialization calls the command's `fromPayload()`. Commands should return values that survive this round trip. Changing the payload shape of messages already waiting in a transport requires a rollout plan; the interface does not version payloads automatically.

The payload methods use **camelCase** (`toPayload()`/`fromPayload()`), matching both the interface and the current FW-008 text. Older material that spells them `to_payload()`/`from_payload()` predates this contract.

## Periodic commands

[`#[Schedule]`](https://github.com/middag-io/middag-php-framework/blob/main/src/Bus/Attribute/Schedule.php) declares `minute`, `hour`, `day`, `month` and `dayOfWeek`, plus `disabled` and `exclusive`. `ScheduleReader` discovers annotated commands and omits disabled ones. `CronFieldMatcher` treats `R` as a wildcard when matching; a host adapter may assign its own random schedule. `ScheduleRunner` invokes matching commands, but it does not enforce `exclusive`: a host that needs non-overlap must provide locking. Scheduled commands must be constructible without arguments: the runner dispatches each due command as `new $class()` and carries no per-invocation payload.

## Transports, workers and retry

[`TransportInterface`](https://github.com/middag-io/middag-php-framework/blob/main/src/Bus/Contract/TransportInterface.php) is the MIDDAG-scoped alias of Symfony Messenger's transport contract. The framework ships `@api` transport pieces under [`Bus/Transport`](https://github.com/middag-io/middag-php-framework/tree/main/src/Bus/Transport): `InMemoryTransport` (an in-process queue drained later in the same process), `MiddagDoctrineTransport` with `DoctrineTransportFactory` (Symfony's Doctrine transport behind the MIDDAG interface), and `TransportLocator` (a PSR-11 map from a transport alias such as `async` to its transport). [`CommandWorker`](https://github.com/middag-io/middag-php-framework/blob/main/src/Bus/Command/CommandWorker.php) drains transports; each `drain()` call makes one pass and returns, so it can run from a long-lived process or a cron tick.

The framework also defines the retry seam, all `@api` under [`Bus/Retry`](https://github.com/middag-io/middag-php-framework/tree/main/src/Bus/Retry): `RetryPolicyInterface` with the default `MultiplierRetryPolicy` (exponential backoff with a cap and optional jitter), `AttemptableInterface` (an item's attempts, ceiling and next eligible time), `AttemptStoreInterface` (the persistence boundary for those items) and `AttemptStamp` (binds a received envelope to its stored item). When an envelope carries `AttemptStamp` and the worker is constructed with both a retry policy and an attempt store, a handler failure is classified by the policy and recorded through the store. Without them, the worker logs and rejects the failed message.

## Boundary of governed jobs

This package ships no `AttemptStoreInterface` implementation, and its bundled transports do not attach `AttemptStamp`. The persisted store, retry history, correlation and job lifecycle belong to the host side, for example `middag-php-core` and its host adapters. A command dispatched through this framework is therefore not automatically a persisted job aggregate, and this page does not define job fields, states or database behavior for the OSS bus.

Verified against `middag-php-framework/main@c9daec5fa289116487aa842f4de1dfa0fa8e2f2a` on 2026-11-04. Recheck the code and the installed version when implementing a transport, attempt store or handler locator.
