---
title: 'Logging & Observability'
---

# Logging & Observability

Reference for the logging pipeline and the observability ports in `middag-io/framework`. Both follow the port rule of [FW-015](https://github.com/middag-io/middag-php-framework/tree/main/docs/decisions): the framework defines the seam and ships a working OSS default; a host adapter or the consumer binds something richer. They are examples of that rule, not decisions of their own.

## Logging pipeline

Everything a service logs goes through PSR-3 `LoggerInterface`. The canonical producer is [`LoggerFactory`](https://github.com/middag-io/middag-php-framework/blob/main/src/Logging/LoggerFactory.php) (`@api`), which builds one cached Monolog logger per `(module, channel)` tuple:

```php
$factory = new LoggerFactory(
    basePath: '/var/log/myapp',
    actor: $actorResolver,     // ActorResolverInterface
    origin: $originResolver,   // OriginResolverInterface
    enabled: true,
    redactor: null,            // null: DefaultSecretRedactor
);
$logger = $factory->forChannel('billing', 'webhooks');   // defaults: ('core', 'system')
```

Each logger produced by `forChannel()` has, in order:

| Stage | Class (`@api`) | Behaviour |
| --- | --- | --- |
| Redaction | `RedactionProcessor` + `SecretRedactorInterface` | Replaces sensitive context values with `[REDACTED]` before anything is written. Default: `DefaultSecretRedactor` (below). |
| Actor and origin | `ActorOriginProcessor` | Stamps `extra.actor` and `extra.origin` from the two resolvers. |
| Format | `MiddagLineFormatter` | `[Y-m-d H:i:s] [origin] [actor] LEVEL: message {context-json}` — stable for external log parsers. |
| Handler | `RotatingStreamHandler` | Writes `{basePath}/{module}/{channel}/{Y-m-d-H-00-00}.log` (one file per hour). A file that reaches 5 MB spills into `{Y-m-d-H-i-s}.log`, with a numeric suffix if that is full too. A filesystem failure goes to PHP's `error_log` with the dropped line; the handler never throws. |

With `enabled: false` the factory returns a `NullLogger` for every channel.

### Default wiring

`ServiceProvider::registerLoggingDefaults()` binds, only when nothing else is bound: `NullActorResolver` (always `system`), `NullOriginResolver` (`cli`, `ip:<remote>` or `system`) and a **disabled** `LoggerFactory`. Logs go nowhere until the application or adapter rebinds `LoggerFactory` with a real base path and `enabled: true`. The Moodle adapter ships `MoodleActorResolver` and `MoodleOriginResolver`.

### Choosing a channel: `#[LogChannel]`

[`#[LogChannel(module: 'billing', channel: 'webhooks')]`](https://github.com/middag-io/middag-php-framework/blob/main/src/Logging/Attribute/LogChannel.php) on a service class makes discovery bind every `LoggerInterface` constructor argument of that class to `LoggerFactory::forChannel('billing', 'webhooks')` (the `@internal` `LogChannelBinder` does the binding). Without the attribute, plain autowiring applies. The attribute is the framework's own, not Monolog's `#[WithMonologChannel]`, so it works without the Monolog bundle.

### Secret redaction

`DefaultSecretRedactor` matches context keys case-insensitively by substring against: `password`, `passwd`, `pwd`, `secret`, `token`, `api_key`, `apikey`, `authorization`, `auth`, `credential`, `private_key`, `card_number`, `cardnumber`, `cvv`, `cvc`, `ssn`. It recurses into nested arrays and never mutates its input. Extra fragments go in its constructor (`new DefaultSecretRedactor(['iban'])`); a different strategy is any `SecretRedactorInterface` passed as the factory's fifth argument.

### Other logging pieces

- `ErrorLogFallbackLogger` (`@api`): a zero-dependency PSR-3 logger writing `[channel.level] message` to PHP's `error_log`, for the bootstrap window and hosts where no factory is wired. Not the canonical path.
- `LogLevel` (`@api`): the PSR-3 levels as an enum with a numeric `severity()` (0 = emergency … 7 = debug).
- `CleanLogsCommand` (`@api`): a payload-less command scheduled daily at 04:00 through `#[Schedule]`. The framework ships no handler for it; the host registers one that knows its log storage.

## Observability ports

| Port (`Observability/Contract/`, `@api`) | Contract | OSS implementations |
| --- | --- | --- |
| `ErrorReporterInterface` | `report(Throwable $throwable, array $context = []): void`. Must never throw. | `NullErrorReporter` (default, discards); `SentryErrorReporter` once the consumer installs the suggested `sentry/sentry` and initialises the SDK itself (without a DSN, capture is a no-op) |
| `ProfileCollectorInterface` | `record(category, label, context, durationMs)`, `events()`, `reset()` | `ProfileCollector` (in-memory for the request; adds `byCategory()`) |

In-tree recorders: `Bus/Middleware/ProfilingMiddleware` (category `bus`, timed in a `finally`, so failed dispatches appear), `HookManager` (category `hook`, opt-in through `setProfileCollector()`) and `FatalErrorHandler` (category `fatal`). Bind one collector instance and inject it everywhere to get a single request timeline.

### Fatal errors

[`FatalErrorHandler`](https://github.com/middag-io/middag-php-framework/blob/main/src/Http/FatalErrorHandler.php) (`@api`) is an opt-in shutdown guard. Once `register()` is called, a fatal error (`E_ERROR`, `E_PARSE`, `E_CORE_ERROR`, `E_COMPILE_ERROR`, `E_USER_ERROR`) becomes a content-negotiated 500 (`{"error":{"code","message"}}` for API/XHR, a minimal HTML page for browsers) carrying a short error code. The code is logged at `critical`, recorded under `fatal` and shown to the user; technical detail reaches the client only with `debug: true`. Registration is a global side effect, so the host or front controller calls it explicitly; the container never does.

Verified against `middag-php-framework/main@c9daec5` on 2026-11-04.
