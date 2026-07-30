---
title: 'framework — Attribute Routing & Auth Model Reference'
---

# Attribute Routing & Auth Model

Reference for `middag-io/framework`'s `#[Route]`/`#[Auth]` attribute model: controller shapes, the parameter resolver chain, the auth pipeline, and CSRF. Backs [FW-002](https://github.com/middag-io/middag-php-framework/blob/docs/docs/decisions/FW-002-attribute-routing-controller-auth-model.md).

## Attribute usage

```php
#[Route(path: '/items', name: 'items_index', methods: ['GET'])]
#[Auth(login: true, capabilities: ['local/middag:manage'])]
public function index(): Response { ... }

#[Route(path: '/ping', name: 'ping', methods: ['GET'])]
#[Auth(login: false)]
public function ping(): JsonResponse { ... }
```

`#[Route]` is Symfony's `Attribute\Route` (`Symfony\Component\Routing\Attribute\Route`), never `Annotation\Route`. `#[Auth]` (`Middag\Framework\Http\Attribute\Auth`) is read by reflection on the method first, then the class if the method carries none — **method wins over class, no attribute means open (public route)**.

## Controller shapes

| Mode | Base class | Notes |
|---|---|---|
| Server-rendered page | `Http/Controller/AbstractController.php`, composed with a host-adapter template renderer | The host template engine (Mustache, Blade, ...) is adapter-side composition, not a separate framework base class — the framework itself is host-neutral |
| JSON API | `Http/Controller/AbstractApiController.php` | Forces every response to JSON (`isJson()` hardwired `true`); wraps payloads in a `{success, data, ...}` envelope, errors in `{success: false, message, error_code, debug?}` |
| Inertia SPA | `Http/Controller/AbstractController.php` + `InertiaAdapter::render()` | See [FW-006](https://github.com/middag-io/middag-php-framework/blob/docs/docs/decisions/FW-006-inertia-spa-bridge.md) |

## Parameter resolver chain

Fixed order, first resolver that can resolve a given parameter wins. Built per-request in `HttpKernel::buildParameterResolver()`, so request-bound resolvers share the same `Request` instance the kernel used (route params already populated in `$request->attributes`):

| Order | Resolver | File |
|---|---|---|
| 1 | Request object | `Http/Resolver/RequestResolver.php` |
| 2 | Form request | `Http/Resolver/FormRequestResolver.php` |
| 3 | Form bridge (`AbstractForm`) | `Http/Resolver/FormResolver.php` |
| 4 | Validated DTO (`#[ValidatedDto]`) | `Http/Resolver/ValidatedDtoResolver.php` |
| 5 | Container-resolved service | `Http/Resolver/ContainerResolver.php` |
| 6 | Inertia-aware parameter | `Http/Resolver/InertiaResolver.php` |
| 7 | Route parameter | `Http/Resolver/RouteParameterResolver.php` |

`MethodParameterResolver` (`Http/Resolver/MethodParameterResolver.php`) is the dispatcher that walks this ordered list per controller-method parameter — it is not itself a chain member. `FormResolver` bridges `AbstractForm` (see the FW-003 ADR); `ValidatedDtoResolver` backs the `#[ValidatedDto]` path (see `architecture.md` §9.3).

## Plugin-aware URL generation

Symfony's `RequestContext` doesn't natively support multiple base URLs per route. `RouteLoader` (`Http/Routing/RouteLoader.php`) scans `#[Route]` attributes into a plain `RouteCollection`; it is explicitly designed for extension — "platform-specific route loaders extend this with adapter-specific base URL resolution." Resolving a multi-base-URL scheme for a specific host (e.g. producing a Moodle-native URL) is host-adapter territory, not a framework contract.

## Auth pipeline — order and gate behavior

Fixed stage order per request, run before the action executes:

1. Route match.
2. Auth flags applied from `#[Auth]` (`setRequireLogin()`, and — only when `capabilities`/`requirements` are non-empty — `setRequireCapabilities()` / `setRequireCapabilityRequirements()`).
3. `applyPlatformAuth()` — a no-op hook in the framework; adapters (Moodle, WordPress) override it to read their own platform-specific attributes (e.g. `#[Sesskey]`, `#[Nonce]`) and apply additional flags.
4. `preHandle()`.
5. Middleware.
6. The action.

**The login gate is OSS-enforced, conditionally.** When `#[Auth(login: true)]` applies and an `AuthenticatorInterface` implementation is bound in the container, an unauthenticated request is denied:

| Request kind | Failure response |
|---|---|
| Inertia (`X-Inertia` header present) | `409` + `X-Inertia-Location` header — the client does a full browser visit to the login path |
| JSON/XHR API | throws `MiddagAuthenticationException` → `401` |
| Plain browser visit | `303` redirect to `AuthenticatorInterface::loginPath()` |

When no `AuthenticatorInterface` is bound, the gate is inert (returns `null`/allows the request) — this is how host-delegated auth (Moodle, WordPress, which wire `setRequireLogin()` to their own platform checks instead) stays unaffected by the OSS gate.

**The capability gate is adapter-enforced, not OSS-enforced.** `AbstractController::setRequireCapabilities()` is a no-op by default. The framework kernel never throws `MiddagAuthorizationException` itself — a host adapter's controller subclass overrides `setRequireCapabilities()` (string surface) and/or implements `CapabilityRequirementAwareInterface::setRequireCapabilityRequirements()` (rich surface) to perform the actual capability check and decide the failure response (typically `403` via `MiddagAuthorizationException` for an API controller, or a host-specific redirect/error page for a page controller).

## CSRF

`Http/Middleware/VerifyCsrfMiddleware.php` is a host-neutral PSR-15 middleware, independent of the exception hierarchy above: for unsafe methods (`POST`/`PUT`/`PATCH`/`DELETE`) it validates a token from the `X-CSRF-Token`/`X-XSRF-TOKEN` header or a `_token` body field, and returns a plain `419` response directly ("CSRF Token Mismatch") on failure — it does not throw `MiddagAuthorizationException`. Safe methods (`GET`, etc.) pass straight through. It also shares the current token as the Inertia `csrf_token` prop and sets a JS-readable `XSRF-TOKEN` cookie (`SameSite=Lax`) so the client can echo the token back automatically.

## `#[Auth]` capability requirements

`Http/Attribute/Auth.php` keeps `capabilities: list<string>` as first-class, plus a `requirements: list<CapabilityRequirement>` field:

- `CapabilityReference` (`Http/Auth/CapabilityReference.php`) — a host-neutral `{key, host}` pair identifying a capability.
- `CapabilityRequirement` (`Http/Auth/CapabilityRequirement.php`) — wraps a bare string, a `CapabilityReference`, a `CapabilityDefinitionInterface` instance, or a `CapabilityDefinitionInterface` class-string, plus free-form `options` (e.g. a Moodle `contextlevel`).
- `CapabilityDefinitionInterface` (`Http/Contract/CapabilityDefinitionInterface.php`) — implemented by a host/domain object that needs to describe a capability beyond a bare string key.

`Auth::__construct()` normalizes every `capabilities`/`requirements` entry passed in through `CapabilityRequirement::listFrom()`, then re-derives the flat `capabilities: list<string>` string surface from the resulting requirement list — so the string surface and the rich surface never drift apart. A controller opts into the rich surface by implementing `CapabilityRequirementAwareInterface`; the kernel calls it in addition to (not instead of) the string-surface `setRequireCapabilities()`, so adapters that only implement the string surface keep working unchanged.

## Auth session primitive

`AuthenticatorInterface` (`Http/Contract/AuthenticatorInterface.php`) is the standalone OSS authentication primitive — it owns *session state* (who is logged in), not credential verification: the application verifies credentials against its own user store, then calls `login(int $userId, array $attributes = [])`; `check()`/`id()`/`user()`/`logout()`/`loginPath()` round out the contract. Binding an implementation to this interface in the container is what makes `#[Auth(login: true)]` enforce (see the login gate above); leaving it unbound leaves host-delegated auth (Moodle, WordPress) unaffected.

## Anti-patterns

- Calling a host's native capability check directly instead of going through `#[Auth]` + the controller's capability hook.
- Performing auth checks in a controller constructor instead of `#[Auth]` or inside the action body.
- Requiring a CSRF/session-token check on a `GET` route — that check exists to protect mutations, and `VerifyCsrfMiddleware` only inspects unsafe methods.
- Checking a capability inside a template/view instead of passing a pre-computed boolean prop.
- Swallowing `MiddagAuthorizationException` silently instead of letting it propagate to the kernel's exception mapping.

## Boot-time cost

Attribute scanning happens once at boot and is cached — cost is bounded to boot time, not per-request time; the shared `RouteCollection` grows linearly with the number of registered controllers (acceptable given the cache).
