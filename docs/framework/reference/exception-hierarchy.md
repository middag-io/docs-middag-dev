---
title: 'framework — Exception Hierarchy: Status Codes, Layer Matrix & Anti-Patterns'
source:
  - repo: middag-io/middag-php-framework
    commit: 611cfb077b90054d49a6a8a9f5c795a705ecc8b4
    paths:
      - src/Exception/MiddagException.php
      - src/Exception/MiddagDomainException.php
      - src/Exception/MiddagValidationException.php
      - src/Exception/MiddagNotFoundException.php
      - src/Exception/MiddagLifecycleViolationException.php
      - src/Http/HttpKernel.php
      - src/Persistence/Model.php
      - docs/decisions/FW-010-typed-exception-hierarchy.md
  - repo: middag-io/middag-php-framework
    commit: 15d3f2e29e4f34d4f91c9e5f470dae613192059c
    paths:
      - src/Exception/MiddagValidationException.php
  - repo: middag-io/middag-php-moodle
    commit: 22d9c2ced29e0e4d6ad53695faa33f4ed334e967
    paths:
      - src/Exception/
---

# Exception Hierarchy: Status Codes, Layer Matrix & Anti-Patterns

Reference for the typed exception hierarchy in `middag-io/framework` — the status-code table, per-layer throw restrictions and anti-patterns to avoid. Backs [FW-010](https://github.com/middag-io/middag-php-framework/blob/main/docs/decisions/FW-010-typed-exception-hierarchy.md).

## Class hierarchy and status codes

| Class | Extends | HTTP status |
|---|---|---|
| `MiddagException` (abstract) | `\RuntimeException` | 500 (default) |
| `MiddagDomainException` | `MiddagException` | 400 |
| `MiddagValidationException` | `MiddagDomainException` | 422 |
| `MiddagNotFoundException` | `MiddagDomainException` | 404 |
| `MiddagInfrastructureException` | `MiddagException` | 500 |
| `MiddagPersistenceException` | `MiddagInfrastructureException` | 500 |
| `MiddagAuthenticationException` | `MiddagException` | 401 |
| `MiddagAuthorizationException` | `MiddagException` | 403 |
| `MiddagLifecycleViolationException` | `MiddagException` | 500 |

All nine classes live in `Exception/`, imported directly by `throw`/`catch` — no facade. `MiddagDomainException` and `MiddagInfrastructureException` are the two branch nodes: `MiddagValidationException`/`MiddagNotFoundException` hang off the domain branch, `MiddagPersistenceException` off the infrastructure branch — a shallow, two-level tree under the single `MiddagException` root. Any class without its own override inherits the root's 500.

## How the kernel maps a throwable

`HttpKernel` catches every throwable from routing and the action, unwraps Symfony Messenger's wrapper exceptions (so a command handler's own exception surfaces), and maps it:

| Throwable | Response |
|---|---|
| `MiddagValidationException` | 422 with the field error map, or a flash-and-redirect for browser visits — see [Form Lifecycle & Validation](./form-lifecycle-and-validation) |
| any other `MiddagException` | its own `getStatusCode()` |
| Symfony `ResourceNotFoundException` | 404 |
| Symfony `MethodNotAllowedException` | 405 |
| anything else | 500 |

Rendering goes through `ExceptionRendererInterface`: one passed to the kernel, else one bound in the container (adapters use this to theme error pages), else `DefaultExceptionRenderer`, which shows the developer page (`DebugExceptionRenderer`) only when the kernel runs with debug on.

## Layer usage matrix

Which layer may throw which type. This is a code-review convention, not a static-analysis rule: nothing in the framework or its CI enforces it today.

| Layer | Allowed to throw |
|---|---|
| Domain | `MiddagDomainException`, `MiddagValidationException`, `MiddagNotFoundException` |
| Infrastructure (persistence, external I/O) | `MiddagInfrastructureException`, `MiddagPersistenceException` |
| Host boundary (adapters) | `MiddagInfrastructureException`, wrapping the host failure |
| Kernel / HTTP | `MiddagLifecycleViolationException`, `MiddagAuthenticationException`, `MiddagAuthorizationException` |
| Extensions | `MiddagDomainException`, `MiddagValidationException`, `MiddagNotFoundException`, `MiddagAuthorizationException` — never infrastructure types directly; they delegate to the service that coordinates that concern |

`MiddagAuthenticationException` is reserved exclusively for the HTTP layer (the API controller boundary) — domain/service code must never throw it directly. Any native exception (a database driver exception, for example) is wrapped into the matching framework exception before it crosses a layer boundary.

**Host adapter exceptions.** The Moodle adapter's own exceptions descend from the framework family: in `middag-php-moodle`, `MoodleAdapterException`, `MoodleConfigurationException`, `MoodleTransportException`, `MoodleVersionException` and `EmailNotSentException` all extend `MiddagInfrastructureException` (`src/Exception/`). The kernel maps them to a 500 through `getStatusCode()`.

### What an extension may throw

An extension is code that a host application adds on top of the framework: its services, data providers and controllers. It sits on the domain side of the matrix, plus authorization:

| Exception | Status | When an extension throws it |
|---|---|---|
| `MiddagDomainException` | 400 | A business rule or invariant fails |
| `MiddagValidationException` | 422 | Input fails validation; pass the field map as `errors:` (see [Validation errors](#validation-errors)) |
| `MiddagNotFoundException` | 404 | A lookup by id or criteria finds no record |
| `MiddagAuthorizationException` | 403 | The caller lacks the permission for the action |

`MiddagNotFoundException` extends `MiddagDomainException`, so it belongs to the domain branch that the extension row already allows. The framework uses it the same way: `Model::findOrFail()` throws it when no record matches the key. An extension's service or data provider throws it when a record it was asked for does not exist, and the kernel answers 404.

An extension does not throw these types:

- `MiddagInfrastructureException` or `MiddagPersistenceException`: it delegates to the service that coordinates that concern, which wraps the host failure.
- `MiddagAuthenticationException`: only the HTTP layer throws it.
- `MiddagLifecycleViolationException`: the class is `@internal` and only the kernel throws it, when code runs a register-phase operation outside its phase. It signals a developer error, so an extension does not catch it either.

## Validation errors

`MiddagValidationException` carries a map of field errors. Its constructor, in `src/Exception/MiddagValidationException.php`:

```php
public function __construct(
    string $message = 'Validation failed',
    private readonly array $errors = [],
    ?Throwable $previous = null,
)
```

- `errors` is the second parameter. Pass it by position or by name (`errors:`). It defaults to `[]`.
- The map type is `array<string, list<string|TranslatableMessage>|string|TranslatableMessage>`: each field maps to one message or a list of messages. A message is a plain string or a `TranslatableMessage`.
- The constructor passes code `0` to the parent, so the exception code is always `0`.
- `errors(): array` returns the map unchanged.
- `getStatusCode()` returns `422`.

```php
use Middag\Framework\Exception\MiddagValidationException;

throw new MiddagValidationException(
    message: 'Invalid connector',
    errors: [
        'name' => 'The name is required.',
        'connector_type' => ['Unknown connector type.'],
    ],
);
```

```php
try {
    $service->save($input);
} catch (MiddagValidationException $e) {
    $fieldErrors = $e->errors(); // the map passed as errors:
    $status = $e->getStatusCode(); // 422
}
```

`errors()` is the only way to read the map. The kernel reads it to build the 422 body or the flashed form errors: see [One error shape](./form-lifecycle-and-validation#one-error-shape).

## Wrapping a native exception at a boundary crossing

```php
try {
    $record = $DB->get_record_or_die('middag_items', ['id' => $id]);
} catch (\dml_exception $e) {
    throw new MiddagPersistenceException("Failed to load item {$id}", previous: $e);
}
```

Always preserve `previous` — losing the original exception when wrapping destroys the debugging trail.

## Security rule

Any 500-class exception (infrastructure or persistence) must never expose technical detail to the end user — the response carries a generic message ("Internal error"); the actual detail goes to the log only.

## Anti-patterns

- `throw new \Exception('...')` — a bare native exception bypasses the whole hierarchy; the kernel has no status to map it to.
- An extension throwing `MiddagInfrastructureException` directly instead of delegating to the coordinating service.
- Catching bare `\Exception` instead of `MiddagException` — this silently swallows genuinely unexpected PHP exceptions that should have been allowed to propagate.
- Exposing a stack trace in an API response.
- Wrapping a native exception without preserving `previous`.
- A `MiddagValidationException` thrown with no `errors` array attached — the form resolver has nothing to map back onto the offending field.
