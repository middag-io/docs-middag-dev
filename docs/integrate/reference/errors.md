---
title: 'Errors'
---

# Errors

The exceptions that `middag-io/core` raises across its `@api` surface, when each one is thrown, and which ones an extension should catch. `middag-io/core` is on its pre-stable `1.x` line; only the curated `@api` types are meant for integrators, and an open enum may gain values, so handle values you do not know. See [Integrating with MIDDAG](/integrate/explanation/overview).

## Core exceptions

The five types share no MIDDAG-specific base class; all of them are `RuntimeException`. Catch each one by name.

| Exception | Parent | Thrown when |
|---|---|---|
| `Middag\Core\Exception\CoreValidationException` | `Middag\Framework\Exception\MiddagValidationException` | A domain value fails validation at a service boundary, for example in the item, workflow and policy services. |
| `Middag\Core\Exception\CoreOperationException` | `RuntimeException` | An import, export or clone cannot complete: the request is not supported, the transfer document is unusable, or the run aborts. |
| `Middag\Core\Exception\CorePersistenceException` | `RuntimeException` | A repository fails. Host adapters wrap the platform error (for example Moodle's `dml_exception`) in this type. |
| `Middag\Core\Exception\CoreLifecycleViolationException` | `RuntimeException` | A runtime invariant breaks: a native or pro extension fails to boot, a signal chain exceeds its hop limit, or a route is registered before a routing seam is installed. |
| `Middag\Core\Exception\CoreAuthenticationException` | `RuntimeException` | Single sign-on token verification fails, for example a bad signature or an expired token. |

`CoreValidationException` carries `errors()`, a map of field to messages, and `getStatusCode()` returns `422`. The framework HTTP kernel turns it into a validation response, so a controller can let it propagate. See [Exception hierarchy](/framework/reference/exception-hierarchy).

An import, export or clone run catches every error, calls the `failed()` hooks and rethrows it as `CoreOperationException`. A repository fault during the run therefore reaches the caller as `CoreOperationException`, with the original `CorePersistenceException` as `getPrevious()`. See [Jobs and operations](/integrate/reference/jobs-and-operations).

An extension that is not native or pro and fails to boot does not raise `CoreLifecycleViolationException`. Core logs the failure and records the extension as failed. See [Extension contract](/integrate/reference/extension-contract).

## Other @api exceptions

| Exception | Parent | Thrown when |
|---|---|---|
| `Middag\Core\Exception\ItemTypeSlugCollisionException` | `LogicException` | Two item types share a slug. See [Items and metadata](/integrate/reference/items-and-metadata). |
| `Middag\Core\Tenant\MissingTenantContextException` | `LogicException` | A tenant context is required but absent. See [Tenant](/integrate/reference/tenant). |
| `Middag\Core\Http\Routing\Exception\UnsupportedRouteFeatureException` | `LogicException` | A route uses a verb, surface or feature the host cannot honour. Raised at registration, not during dispatch. See [Routes, capabilities, shortcodes and widgets](/integrate/how-to/routes-capabilities-shortcodes-widgets). |
| `Middag\Core\Integration\WebService\Exception\WebServiceException` | `Middag\Framework\Exception\MiddagException` | Abstract base of the external web service exceptions. Maps to HTTP 500. |
| `Middag\Core\Integration\WebService\Exception\ParameterValidationException` | `WebServiceException` | Parameters do not match the declared schema. Maps to HTTP 422. |
| `Middag\Core\Integration\WebService\Exception\WebServiceAuthorizationException` | `WebServiceException` | The caller is signed in but lacks the required capability. Maps to HTTP 403. |

`Middag\Core\Licensing\Exception\LicensingException` and its subclass `FeatureNotLicensedException` are also `@api`; an extension rarely needs to catch them.

## What to catch

- Catch `CoreValidationException` where you can show field errors to the user. Otherwise let it reach the HTTP kernel.
- Catch `CoreOperationException` around `execute()`, `import()`, `export()` and `duplicate()` when you start an operation yourself. Inspect `getPrevious()` to find a wrapped `CorePersistenceException`.
- Catch `CorePersistenceException` around direct repository calls, only where you can recover or report. For calls through core repositories, the adapter has already wrapped the host's database exceptions, so catch this type instead of those.
- Do not catch `CoreLifecycleViolationException` or the `LogicException` types to keep running. They mean wrong setup or wrong code; fix the cause.
