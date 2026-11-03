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

## Dependencies and scope

The framework's `composer.json` requires `psr/http-server-handler`, `psr/http-server-middleware`, `psr/http-message`, `symfony/psr-http-message-bridge`, and `nyholm/psr7`. Routing and controller authorization build on this boundary and have their own decision, [FW-002](https://github.com/middag-io/middag-php-framework/blob/main/docs/decisions/FW-002-attribute-routing-controller-auth-model.md).

Verified against `middag-php-framework/main@faad209aee9b5308fc7bfc563079a6250ee5b89c` on 2026-11-03. Recheck the code and the installed version when implementing an adapter.
