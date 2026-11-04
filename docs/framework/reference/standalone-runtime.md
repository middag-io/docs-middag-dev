---
title: 'Standalone Runtime'
---

# Standalone Runtime

Reference for running `middag-io/framework` on a plain PHP host, with no Moodle and no WordPress. Backs [FW-015](https://github.com/middag-io/middag-php-framework/tree/main/docs/decisions): hosts are adapters of the framework's ports, and every port has an OSS default, so "no host" is a supported configuration rather than a test fixture.

## What "standalone" means

Standalone is the framework with only its own implementations bound. Each port in [Bridge Contracts](./bridge-contracts) has an OSS implementation: `EnvConfigResolver` for configuration, `PdoConnectionAdapter` for the database, `NullMaintenanceGate`, `FallbackTranslator`, `NullMailer`, `LocalFilesystem`, `NativePasswordHasher`, and `NullUserContextResolver` (or `SessionUserContextResolver` once the framework's own `AuthenticatorInterface` session is wired). `ServiceProvider` registers some defaults automatically when they are not already bound: the message bus with an in-memory `async` transport, the command worker, the schedule reader and runner, the entity-type registry, the form pipeline and a disabled `LoggerFactory`. The consumer's bootstrap binds the rest. It writes a minimal `BootstrapInterface` whose `platform()` returns `'standalone'` and passes it to `ContainerFactory::build()`, exactly as an adapter would.

The framework has no `src/Adapter/` directory and no source file that names a host namespace. `tests/Architecture/NoHostAdapterDirectoryTest.php` asserts both, alongside the `composer check:portability` gate.

## `StandaloneKernel` — the minimal worker runtime

[`StandaloneKernel`](https://github.com/middag-io/middag-php-framework/blob/main/src/Runtime/StandaloneKernel.php) (`@api`) is the smallest runtime a product needs to run commands on a plain host: one database connection, one message bus and a worker that drains it. It does not involve the DI container or HTTP.

```php
use Middag\Framework\Bus\Transport\DoctrineTransportFactory;
use Middag\Framework\Runtime\ServiceMap;
use Middag\Framework\Runtime\StandaloneKernel;

$kernel = new StandaloneKernel(
    pdo: $pdo,                                   // the one open connection this process uses
    services: new ServiceMap([
        SendInvoiceHandler::class => fn ($c) => new SendInvoiceHandler($c->get(Mailer::class)),
    ]),
    transports: ['async' => $doctrineTransport], // empty: every message is handled inline
    routes: [SendInvoice::class => ['async']],   // a command absent here runs inline
);

$kernel->bus()->dispatch(new SendInvoice($id));  // web request: queued
$kernel->worker('async')->drain();               // worker or cron tick: one pass
```

| Member | Returns | Notes |
| --- | --- | --- |
| `__construct(PDO $pdo, ContainerInterface $services = new ServiceMap(), array $transports = [], array $routes = [], LoggerInterface $logger = new NullLogger(), iterable $middleware = [])` | — | `$transports` maps a name to a `TransportInterface`; `$routes` maps a command FQCN to transport names; `$middleware` is prepended to the send/handle stack. |
| `pdo()` | `PDO` | The connection that was passed in. |
| `connection()` | `ConnectionAdapterInterface` | A `PdoConnectionAdapter` over the same PDO, for `SchemaBuilder` and repositories. |
| `services()` | `ContainerInterface` | Resolves handlers by class name. |
| `transports()` | `TransportLocator` | The name → transport map. |
| `bus()` | `MessageBusInterface` | Built once on first use and reused, so a message dispatched by a handler is routed by the same rules. |
| `worker(string $transportName, array $also = [], ?WorkerLimits $limits = null, ?RetryPolicyInterface $retryPolicy = null, ?AttemptStoreInterface $attemptStore = null, ?WorkerHeartbeatInterface $heartbeat = null)` | `CommandWorker` | Drains `$transportName` plus `$also` in one pass through this kernel's bus. |

Design rules the class follows:

- **The caller brings the PDO.** Opening a connection would mean choosing a DSN, a credential source and a pooling policy, which are host decisions. With the Doctrine transport, build the DBAL connection first and pass `$dbal->getNativeConnection()`, so the queue table and the domain tables share one database and one transaction scope.
- **Sync is the default.** With no transports, every message is handled inline. A queue nobody drains is worse than a slow request, and a plain host may have no worker process at all.
- **No product knowledge.** Lane names, an outbox, repositories and strategy resolvers are not here; downstream packages layer them on top of this kernel instead of assembling a second bus.

[`ServiceMap`](https://github.com/middag-io/middag-php-framework/blob/main/src/Runtime/ServiceMap.php) (`@api`) is the smallest PSR-11 container a standalone process can start with: an id → instance map, where a `Closure(ContainerInterface)` value is built on first `get()` and memoised. `with($id, $service)` returns a new map. Pass Symfony's container (or any PSR-11) instead when you need autowiring, tagging or compilation.

## Durable async

For cross-process queues, `DoctrineTransportFactory` wraps Symfony's Doctrine Messenger bridge; it needs the suggested packages `doctrine/dbal` and `symfony/doctrine-messenger`. It is meant for standalone hosts only; see [Command bus](./command-bus) for why it is the wrong choice under Moodle or WordPress. `symfony/lock` (single-run locking around the worker and the schedule runner) and `symfony/console` (CLI commands for the worker) are suggested too: locking is a host concern by design.

Verified against `middag-php-framework/main@c9daec5` on 2026-11-04.
