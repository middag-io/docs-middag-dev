---
title: 'framework — Exception Hierarchy: Status Codes, Layer Matrix & Anti-Patterns'
---

# Exception Hierarchy: Status Codes, Layer Matrix & Anti-Patterns

Reference for the typed exception hierarchy in `middag-io/framework` — the status-code table, per-layer throw restrictions and anti-patterns to avoid. Backs [FW-010](https://github.com/middag-io/framework/blob/docs/docs/decisions/FW-010-typed-exception-hierarchy.md).

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

## Layer usage matrix

| Layer | Allowed to throw |
|---|---|
| `framework/domain/` | `MiddagDomainException`, `MiddagValidationException` |
| `framework/infrastructure/` | `MiddagInfrastructureException`, `MiddagPersistenceException` |
| `framework/moodle/` (host boundary) | `MiddagInfrastructureException` (wraps host failures) |
| `framework/kernel/` | `MiddagLifecycleViolationException`, `MiddagAuthenticationException`, `MiddagAuthorizationException` |
| `classes/extensions/` | `MiddagDomainException`, `MiddagValidationException`, `MiddagAuthorizationException` — never infrastructure directly |

`MiddagAuthenticationException` is reserved exclusively for the HTTP layer (the API controller boundary) — domain/service code must never throw it directly.

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

## History note

The hierarchy was reconstructed from the `moodle-local_middag` legacy vault (`ADR-706`/`ref-706`), where classes used snake_case names under a `middag_` prefix (e.g. `middag_persistence_exception`). The framework's current PascalCase classes are a verbatim rename — the shape, the status-code map and the layer restrictions carried over unchanged.

| Legacy class (ADR-706) | Current class |
|---|---|
| `middag_exception` (abstract, `@api`) | `MiddagException` |
| `middag_domain_exception` (`@api`) | `MiddagDomainException` |
| `middag_validation_exception` (`@api`) | `MiddagValidationException` |
| `middag_not_found_exception` (`@api`) | `MiddagNotFoundException` |
| `middag_infrastructure_exception` (`@api`) | `MiddagInfrastructureException` |
| `middag_persistence_exception` (`@api`) | `MiddagPersistenceException` |
| `middag_authentication_exception` (`@api`) | `MiddagAuthenticationException` |
| `middag_authorization_exception` (`@api`) | `MiddagAuthorizationException` |
| `middag_lifecycle_violation_exception` (`@internal`) | `MiddagLifecycleViolationException` |
