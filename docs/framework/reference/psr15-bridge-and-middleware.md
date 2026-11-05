---
title: 'PSR-15 HTTP boundary and middleware'
---

# PSR-15 HTTP boundary and middleware

The framework exposes [`HttpKernelInterface`](https://github.com/middag-io/middag-php-framework/blob/main/src/Http/Contract/HttpKernelInterface.php) as its HTTP request handler. It extends PSR-15 `RequestHandlerInterface`: callers pass a PSR-7 `ServerRequestInterface` and receive a PSR-7 `ResponseInterface`. The interface is marked `@api`; the concrete [`HttpKernel`](https://github.com/middag-io/middag-php-framework/blob/main/src/Http/HttpKernel.php) is marked `@internal`. [FW-001](https://github.com/middag-io/middag-php-framework/blob/main/docs/decisions/FW-001-psr15-http-kernel-boundary.md) records the architectural choice.

## Request path

1. `HttpKernel::handle()` converts the PSR-7 request to a Symfony HttpFoundation `Request` with `HttpFoundationFactory`.
2. Routing, controller resolution, and controller execution work with HttpFoundation requests and responses inside the kernel.
3. `PsrHttpFactory` converts the resulting HttpFoundation `Response` back to PSR-7. The caller owns response emission.

This bridge keeps the public handler contract independent of Symfony request and response types while preserving those types inside controllers. A controller's internal signature is not the public kernel signature.

## Middleware

[`MiddlewareDispatcher`](https://github.com/middag-io/middag-php-framework/blob/main/src/Http/Middleware/MiddlewareDispatcher.php) is an `@api` PSR-15 handler that composes `MiddlewareInterface` instances around an inner handler, typically the kernel. Each call constructs delegates from its configured queue, so handling one request does not consume the middleware configuration for the next request.

| Concern | Current implementation |
| --- | --- |
| CORS | `src/Http/Middleware/CorsMiddleware.php` |
| Session start | `src/Http/Middleware/StartSessionMiddleware.php` |
| Flash sharing | `src/Http/Middleware/ShareFlashMiddleware.php` |
| CSRF verification | `src/Http/Middleware/VerifyCsrfMiddleware.php` |
| Exception rendering | `src/Http/DefaultExceptionRenderer.php` and `src/Http/DebugExceptionRenderer.php` |

The table locates implementations; it does not imply that every host enables every middleware or that the exception renderers are middleware. Consult the host adapter's composition and the kernel configuration for the active stack.

## Route middleware

Inside the kernel, a route can also carry its own middleware chain. Controllers declare it with the repeatable [`#[Middleware]`](https://github.com/middag-io/middag-php-framework/blob/main/src/Http/Attribute/Middleware.php) attribute on the class (outermost) or the action (innermost); a route registrar can declare it in the route defaults. [`RouteMiddlewareStack`](https://github.com/middag-io/middag-php-framework/blob/main/src/Http/Routing/RouteMiddlewareStack.php) merges both sources, and each entry implements [`RouteMiddlewareInterface`](https://github.com/middag-io/middag-php-framework/blob/main/src/Http/Contract/RouteMiddlewareInterface.php). All three are `@api`. Route middleware works on the HttpFoundation request and response, not on PSR-7, and does not run through `MiddlewareDispatcher`.

Per-route CORS follows the same split. The [`#[Cors]`](https://github.com/middag-io/middag-php-framework/blob/main/src/Http/Attribute/Cors.php) attribute (`@api`) on a controller class or action sets the `Access-Control-Allow-*` headers on the actual-request response; the kernel applies it through the `@internal` `CorsHeaderApplier`. The OPTIONS preflight keeps the kernel's global default. `CorsMiddleware` in the table above is the PSR-15 layer in front of the kernel.

## Framework-owned types at the public surface

Symfony, PSR and Monolog stay inside the framework. Where a consumer would otherwise import a Symfony or Monolog type, the framework publishes its own type under `Middag\Framework\` and reuses the vendor machinery behind it:

| Framework type (`@api`) | Vendor type it stands in for | Why the framework owns the name |
| --- | --- | --- |
| [`HttpKernelInterface`](https://github.com/middag-io/middag-php-framework/blob/main/src/Http/Contract/HttpKernelInterface.php) | PSR-15 `RequestHandlerInterface` (extended) | The HTTP entry point is a PSR contract, not Symfony `HttpKernel`. |
| [`#[Lazy]`](https://github.com/middag-io/middag-php-framework/blob/main/src/Kernel/Attribute/Lazy.php) | Symfony DI `#[Lazy]` | A domain class marks itself lazy without importing `symfony/dependency-injection`; `ContainerFactory` still wires Symfony's `LazyServiceInstantiator`. |
| [`MiddagDoctrineTransport`](https://github.com/middag-io/middag-php-framework/blob/main/src/Bus/Transport/MiddagDoctrineTransport.php) | Symfony Messenger `DoctrineTransport` | A `final` subclass with an empty body. PHP interface satisfaction is nominal, so the subclass is what makes Symfony's transport satisfy the MIDDAG `TransportInterface` while keeping the bridge's setup, count, list and keepalive capabilities. |
| [`TransportInterface`](https://github.com/middag-io/middag-php-framework/blob/main/src/Bus/Contract/TransportInterface.php), [`MessageBusInterface`](https://github.com/middag-io/middag-php-framework/blob/main/src/Bus/Contract/MessageBusInterface.php) | Symfony Messenger transport and bus interfaces | Empty extending interfaces: no added method, a MIDDAG-scoped name to depend on. |
| [`#[LogChannel]`](https://github.com/middag-io/middag-php-framework/blob/main/src/Logging/Attribute/LogChannel.php) | Monolog bundle `#[WithMonologChannel]` | A `(module, channel)` tuple that works without the Monolog bundle. See [Logging & observability](./logging-and-observability). |

Some vendor types still cross into consumer code by design: controllers work with HttpFoundation `Request`/`Response` inside the kernel (see above), `#[Route]` is Symfony's routing attribute, and form and request rules accept Symfony Validator `Constraint` objects.

## History

The boundary was first drafted as Symfony `HttpKernel` directly, with `handle(Request): Response` on HttpFoundation types (legacy vault ADR-208, 2026-04-08). It was replaced before shipping by the PSR-15 boundary (legacy ADR-209, 2026-05-20). Moving to PSR-15 changed the top-level `handle()` signature from returning `void` to returning `ResponseInterface`; callers written against the earlier shape need to emit the returned response themselves.

## Dependencies and scope

The framework's `composer.json` requires `psr/http-server-handler`, `psr/http-server-middleware`, `psr/http-message`, `symfony/psr-http-message-bridge`, and `nyholm/psr7`. Routing and controller authorization build on this boundary and have their own decision, [FW-002](https://github.com/middag-io/middag-php-framework/blob/main/docs/decisions/FW-002-attribute-routing-controller-auth-model.md).

Verified against `middag-php-framework/main@c9daec5fa289116487aa842f4de1dfa0fa8e2f2a` on 2026-11-04. Recheck the code and the installed version when implementing an adapter.
