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

The current PHP methods use **camelCase**. The decision text in FW-008 still spells them `to_payload()`/`from_payload()`; use the interface signatures above when implementing a command. That discrepancy is tracked with the ADR/MADR provenance review in `docs-middag-ops#68`.

## Periodic commands

[`#[Schedule]`](https://github.com/middag-io/middag-php-framework/blob/main/src/Bus/Attribute/Schedule.php) declares `minute`, `hour`, `day`, `month` and `dayOfWeek`, plus `disabled` and `exclusive`. `ScheduleReader` discovers annotated commands and omits disabled ones. `CronFieldMatcher` treats `R` as a wildcard when matching; a host adapter may assign its own random schedule. `ScheduleRunner` invokes matching commands, but it does not enforce `exclusive`: a host that needs non-overlap must provide locking.

## Boundary of governed jobs

A command dispatched through this framework is not automatically a persisted job aggregate. Retry history, correlation and job lifecycle are owned by `mittag-php-core` and its host adapters. This page therefore does not define job fields, states or database behavior for the OSS bus.
