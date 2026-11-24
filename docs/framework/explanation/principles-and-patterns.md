---
title: 'Principles & Patterns'
source:
  - repo: middag-io/middag-php-framework
    commit: 864faac0a621d2914e56924ad9c80bcf53921da5
    paths:
      - src/Database/Contract/ConnectionAdapterInterface.php
      - src/Database/Contract/SqlDialectInterface.php
      - src/Database/StandardSqlDialect.php
      - src/Database/MysqlSqlDialect.php
      - src/Database/PrefixingSqlDialect.php
      - src/Database/PdoConnectionAdapter.php
      - src/Mail/Contract/MailerInterface.php
      - src/Mail/NullMailer.php
      - src/Observability/Contract/ErrorReporterInterface.php
      - src/Observability/NullErrorReporter.php
      - src/Observability/SentryErrorReporter.php
      - src/Filesystem/Contract/FilesystemInterface.php
      - src/Filesystem/LocalFilesystem.php
      - src/Filesystem/FlysystemFilesystem.php
      - src/Kernel/Contract/MaintenanceGateInterface.php
      - src/Kernel/Bootstrap/NullMaintenanceGate.php
      - src/Kernel/Contract/BootFailurePolicyInterface.php
      - src/Kernel/Bootstrap/BootRethrowFailurePolicy.php
      - src/Kernel/Bootstrap/BootIsolateFailurePolicy.php
      - src/Kernel/ContainerFactory.php
      - src/Kernel/Contract/HostEventBridgeInterface.php
      - src/Kernel/Contract/HookManagerInterface.php
      - src/Kernel/Manager/HookManager.php
      - src/Kernel/Module/AbstractModule.php
      - src/Http/HttpKernel.php
      - src/Http/HttpKernelFactory.php
      - src/Http/Contract/ExceptionRendererInterface.php
      - src/Http/DefaultExceptionRenderer.php
      - src/Http/Contract/RouteMiddlewareInterface.php
      - src/Http/Controller/AbstractController.php
      - src/Http/Contract/RetryPolicyInterface.php
      - src/Bus/Retry/RetryPolicyInterface.php
      - src/Bus/Retry/MultiplierRetryPolicy.php
      - src/Bus/Contract/CommandInterface.php
      - src/Bus/Command/AbstractCommand.php
      - src/Bus/Command/CommandWorker.php
      - src/Bus/Attribute/AsCommandHandler.php
      - src/Bus/Attribute/Schedule.php
      - src/Bus/Contract/MessageBusInterface.php
      - src/Bus/Contract/SignalDispatcherInterface.php
      - src/Bus/MessageBusFactory.php
      - src/Bus/Middleware/ProfilingMiddleware.php
      - src/Logging/LoggerFactory.php
      - src/Persistence/Repository/AbstractRepository.php
      - src/Exception/MiddagException.php
      - src/Shared/Util/Arr.php
      - src/Shared/Util/Inflector.php
---

# Principles & Patterns

The engineering principles and design patterns the MIDDAG Framework (`middag-io/framework`) is built
on, each tied to the classes that show it. They are decision filters for design and code review, not
a checklist: a principle helps you name a problem, it does not mandate a structure. Every item here
is backed by code on the framework's `main`; the one common pattern it does not use, Abstract Factory, appears only to say so.

This page does not repeat the architecture. The layering, the OSS boundary, the ownership map and the
locked decisions are in [Architecture](./architecture). Where a file lives inside `src/` is in
[Module Layout Convention](../reference/module-layout-convention).

Classes below are named relative to `Middag\Framework\`. Only classes tagged `@api` are extension
points; a class tagged `@internal` may change in any release (see
[Versioning and compatibility](/libraries/reference/versioning-and-compatibility)).

## Principles

### Proportionality

Add a layer only when it solves a problem you have now. The framework keeps concrete, stable helpers
concrete: `Shared\Util\Arr` and `Shared\Util\Inflector` are `final` classes with no interface,
because nobody needs a second implementation of array merging or pluralisation. An interface, a hook
or a policy object is worth its cost only where a real variation exists, which the next principles
make concrete.

### One reason to change

A class should have one reason to change. Use it as a review question: does this class mix
orchestration with persistence, integration or formatting? Would changing how data is stored force
an edit to a business rule?

The framework splits along those lines. `Database\Contract\ConnectionAdapterInterface` composes three
focused contracts (`ConnectionInterface` for raw SQL, `RecordConnectionInterface` for record CRUD and
streaming, `SqlDialectInterface` for dialect rendering) and adds only capability reporting. It speaks
tables, records and SQL, never domain types: mapping rows to entities happens above it, in
repositories.

Two interfaces that share a name show the same rule. `Bus\Retry\RetryPolicyInterface` decides whether
a queued item is retried and how long to wait, with no host dependency. `Http\Contract\RetryPolicyInterface` decides the same for an outbound HTTP attempt, from the
attempt number, the response status and a `Retry-After` header. Each has its own reason to change, so they stay separate.

Split a class when its parts change on different schedules, or when testing one part needs heavy
mocking of the other. Keep it whole when its parts always change together and splitting would add
more coordination than it removes.

### Depend on a contract where variation is real

Introduce an interface when at least one of these holds:

- the dependency is an external integration (mail, storage, error reporting, a database);
- the component is a published extension point of the framework;
- it is the boundary between a rule and the mechanism that carries it out;
- an isolated test gains real value from a fake.

When none holds, a concrete class is the better choice.

The framework pairs each such contract with an OSS default, so it runs with no host adapter installed:

| Contract | OSS default | Other implementation in the framework |
|---|---|---|
| `Mail\Contract\MailerInterface` | `Mail\NullMailer` (discards) | – |
| `Observability\Contract\ErrorReporterInterface` | `Observability\NullErrorReporter` | `Observability\SentryErrorReporter` (needs `sentry/sentry`) |
| `Filesystem\Contract\FilesystemInterface` | `Filesystem\LocalFilesystem` | `Filesystem\FlysystemFilesystem` (needs `league/flysystem`) |
| `Kernel\Contract\MaintenanceGateInterface` | `Kernel\Bootstrap\NullMaintenanceGate` | – |
| `Http\Contract\ExceptionRendererInterface` | `Http\DefaultExceptionRenderer` | – |

Host adapters implement the same contracts against the host. The full list of ports an adapter
fills is in [Bridge Contracts](../reference/bridge-contracts).

Before adding an interface, ask: is there more than one real or planned implementation? Is this a
rule/infrastructure boundary or an extension point? Does an isolated test depend on it? Would the
concrete dependency be expensive to undo later? If most answers are no, wait.

### Composition over inheritance

Inherit only for a real subtype relation, from a base class designed to be extended, where any
consumer of the base can take the subclass without surprise. The framework's abstract bases are those
designed extension points: `Http\Controller\AbstractController` (host adapters extend it with page
setup, auth and rendering), `Kernel\Module\AbstractModule`, `Persistence\Repository\AbstractRepository`
and `Bus\Command\AbstractCommand`. `Exception\MiddagException` roots a typed is-a hierarchy (see
[Exception Hierarchy](../reference/exception-hierarchy)). `Database\MysqlSqlDialect` is deliberately
not `final`, so a host on the MySQL family can override only its host-specific idioms and inherit the
MySQL SQL as is.

Compose when the variation is behavioural, configurable or an integration. The kernel does not expect
to be subclassed for a themed error page: `Http\HttpKernel` resolves an `ExceptionRendererInterface`
from its argument or the container, and falls back to `DefaultExceptionRenderer`. `Kernel\ContainerFactory` takes a
`BootFailurePolicyInterface` in its constructor.
Most concrete classes are `final`, which keeps inheritance an explicit choice of the base class.

Before writing `extends`, ask: is it really a subtype? Does the subclass keep the base contract? Is
it modelling a type, or only reusing code? Would composition say the same thing more plainly?

### Explicit extension points

Open the code to extension only at points that are deliberate and documented. In the framework, an
extension point is a published `@api` contract, attribute or base class; `@api` is also the surface
the [Versioning and compatibility](/libraries/reference/versioning-and-compatibility) promise covers.
An `@internal` class is not an extension point even when it implements a public contract:
`Kernel\Bootstrap\BootRethrowFailurePolicy` is `@internal`, while `BootFailurePolicyInterface`, which
it implements, is `@api`. Bind your own implementation of the contract instead of extending it.

A seam can exist with no OSS implementation when the behaviour belongs to a tier above.
`Bus\Contract\SignalDispatcherInterface` is the publish-side contract for signals, and the framework
ships no implementation of it: a host adapter or a library downstream provides one. Do not add a hook,
a contract or an interface on speculation; if nothing extends a point, it did not need to exist.

## Patterns

Read each pattern's "when not" first: an unneeded pattern costs as much as a missing one.

### Strategy

Use it when the same intent has several real algorithms or policies, selected by type, configuration
or context, or when a growing `if`/`switch` on a type is appearing. Skip it for a small local variation
a plain `if` handles, or when only one implementation exists and none is planned.

In the framework, a strategy is a small contract resolved through the container or passed to a
constructor:

- `Kernel\Contract\BootFailurePolicyInterface`: `BootRethrowFailurePolicy` (the default, loud in
  development) or `BootIsolateFailurePolicy` (log at `critical` and boot the remaining modules), given
  to `ContainerFactory`. See [Bootstrap Lifecycle](./bootstrap-lifecycle).
- `Bus\Retry\RetryPolicyInterface`, implemented by `Bus\Retry\MultiplierRetryPolicy`, shared by
  unrelated queue implementations that only agree on the attempt shape.
- `Database\Contract\SqlDialectInterface`: `StandardSqlDialect` (ANSI, a near-passthrough) or
  `MysqlSqlDialect` (MySQL and MariaDB idioms).
- `Http\Contract\ExceptionRendererInterface`, bound by an adapter to wrap the host layout.

### Decorator

Use it to add a cross-cutting concern over an existing contract, when the concern does not belong in
the decorated class and may apply to more than one implementation. A decorator implements the same contract as
the object it wraps and delegates everything it does not change. Skip it for a one-off case, or when
the behaviour is essential to the class rather than cross-cutting.

`Database\PrefixingSqlDialect` wraps any `SqlDialectInterface`, prefixes the logical table name in
`table()` and passes every other method through.

Where a pipeline exists, the framework adds cross-cutting behaviour as middleware instead of a
decorator. `Bus\Middleware\ProfilingMiddleware` records every dispatched message "without decorating
the bus or the handlers", prepended to the stack through `Bus\MessageBusFactory`. On HTTP,
`Http\Contract\RouteMiddlewareInterface` plays the same role per route (see
[PSR-15 Bridge & Middleware](../reference/psr15-bridge-and-middleware)).

### Adapter

Use it to isolate an external API behind a stable internal contract, to translate a host API into
the framework's terms, or to absorb version differences. Skip it for a wrapper that isolates nothing.

- `Database\Contract\ConnectionAdapterInterface` is the single seam every host database implements;
  the framework's own implementation is `Database\PdoConnectionAdapter`, and the host adapters
  implement it over the host's database API.
- `Filesystem\FlysystemFilesystem` bridges the filesystem port onto any Flysystem adapter.
- `Observability\SentryErrorReporter` forwards to the Sentry SDK behind `ErrorReporterInterface`.

The host adapters as a whole apply this pattern to the framework's ports; see
[Bridge Contracts](../reference/bridge-contracts).

### Observer and hooks

Use it when other code reacts to a fact without the emitter depending on it, and new reactions may
appear without editing the emitter: auditing, notification, side integrations. Skip it when the
reaction is an essential step of the main flow, or when it would hide a dependency that should be
explicit.

- `Kernel\Manager\HookManager`, the default `HookManagerInterface`: per-instance filter and action
  hooks with priorities. See [Hooks — Public Surface and Naming](../reference/hooks-public-surface).
- `Kernel\Contract\HostEventBridgeInterface`: synchronous broadcast of named host events to void
  listeners, implemented by the host adapters.
- `Bus\Contract\SignalDispatcherInterface`: the object-as-signal publish contract, implemented
  downstream.

### Command

Use it for work that can be deferred, retried or serialised, when the intent should be separate from
its execution, or when the same work runs both synchronously and asynchronously. Skip it for logic
that should simply be called, or for trivial operations.

- `Bus\Contract\CommandInterface` makes a command round-trip through a primitives-only payload
  (`toPayload()`, `fromPayload()`), so it can be persisted and replayed.
- `Bus\Command\AbstractCommand` is the behaviour-free base for module commands and the anchor of the
  `#[Schedule]` attribute; `#[AsCommandHandler]` marks its handler.
- `Bus\Contract\MessageBusInterface` dispatches it, inline or to a transport, and
  `Bus\Command\CommandWorker` drains the transports later.

Details: [Dispatch, Handlers & Scheduling](../reference/command-bus).

### Factories, not abstract factories

Creation goes through the container first, and through a plain factory when assembling an object
graph takes real work: `Kernel\ContainerFactory`, `Http\HttpKernelFactory`, `Bus\MessageBusFactory`
and `Logging\LoggerFactory`. The framework has no abstract factory: no family of related objects is
swapped as a unit. Reach for one only when such a family really exists; a single object needs a plain
factory, and a choice of algorithm needs a strategy.

## Combining them

The patterns compose in a few recurring ways:

- strategy and the container: a policy contract with an OSS default, replaced by binding another
  implementation;
- decorator and contract: the wrapper and the wrapped share one interface, so callers never know;
- command and hooks: a command does the work, hooks let other code react to it.

## See also

- [Architecture](./architecture): layers, the OSS boundary and the ownership map.
- [Module Layout Convention](../reference/module-layout-convention): where a new contract or class
  lives.
- [Bridge Contracts](../reference/bridge-contracts): the ports a host adapter implements.
- [Pre-PR Boundary Checklist](../how-to/pre-pr-boundary-checklist): what to check before opening a
  pull request against an OSS library.
