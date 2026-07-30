---
title: 'framework — PSR-15 Bridge Wiring & Middleware Catalog'
---

# PSR-15 Bridge Wiring & Middleware Catalog

Reference for the PSR-15 HTTP kernel boundary in `middag-io/framework` and how it bridges to the Symfony HttpFoundation internals underneath it. Backs [FW-001](https://github.com/middag-io/framework/blob/docs/docs/decisions/FW-001-psr15-http-kernel-boundary.md).

## Public contract

```php
namespace Middag\Framework\Http;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;

interface HttpKernelInterface extends RequestHandlerInterface
{
    public function handle(ServerRequestInterface $request): ResponseInterface;
}
```

## Internal bridge

PSR-15 is the public boundary; internally the kernel converts to Symfony HttpFoundation via `HttpFoundationFactory::createRequest()`. Routing (`symfony/routing` `UrlMatcher`), the resolver chain and controllers all stay HttpFoundation `Request -> Response` — controller signatures are unaffected by the PSR-15 boundary.

| Stage | Type | Notes |
|---|---|---|
| Kernel entry | `ServerRequestInterface` (PSR-7) | Public boundary — what any adapter/consumer compiles against. |
| Bridge in | `HttpFoundationFactory::createRequest()` | Converts the PSR-7 request to a Symfony `Request`. |
| Routing / resolvers / controllers | HttpFoundation `Request` → `Response` | Unchanged internals — keeps `JsonResponse`, `BinaryFileResponse`, `StreamedResponse`, `RedirectResponse` ergonomics for controller authors. |
| Bridge out | HttpFoundation `Response` → PSR-7 `ResponseInterface` | Final conversion before `handle()` returns. |

This keeps the touch surface for the PSR-15 migration limited to a handful of kernel-boundary files rather than every controller (~140 in the legacy Moodle plugin this framework was extracted from) — a pure-PSR-7 controller layer would have lost the HttpFoundation response-type DX above.

## Middleware pipeline

CORS, exception handling and pre-dispatch concerns run as native PSR-15 middleware rather than framework-specific lifecycle callbacks:

```php
namespace Middag\Framework\Kernel\Http;

final class MiddlewarePipeline implements RequestHandlerInterface
{
    /** @param MiddlewareInterface[] $middlewares */
    public function __construct(private array $middlewares, private RequestHandlerInterface $core) {}

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        if ($this->middlewares === []) {
            return $this->core->handle($request);
        }
        $next = array_shift($this->middlewares);

        return $next->process($request, $this);
    }
}
```

## Middleware catalog

| Class | Location | Concern |
|---|---|---|
| `CorsMiddleware` | `src/Http/Middleware/` | CORS headers. |
| `MiddlewareDispatcher` | `src/Http/Middleware/` | Runs the middleware pipeline. |
| `ShareFlashMiddleware` | `src/Http/Middleware/` | Flash-message propagation. |
| `StartSessionMiddleware` | `src/Http/Middleware/` | Session bootstrap. |
| `VerifyCsrfMiddleware` | `src/Http/Middleware/` | CSRF verification. |

Exception-to-response mapping lives in dedicated renderers instead of a middleware class:

| Renderer | Location |
|---|---|
| `DefaultExceptionRenderer` | `src/Http/DefaultExceptionRenderer.php` |
| `DebugExceptionRenderer` | `src/Http/DebugExceptionRenderer.php` |

## Dependencies

All five of the following are `require` entries in this repo's `composer.json`:

| Package | Role |
|---|---|
| `psr/http-server-handler` | `RequestHandlerInterface`. |
| `psr/http-server-middleware` | `MiddlewareInterface`. |
| `psr/http-message` | PSR-7 request/response types. |
| `symfony/psr-http-message-bridge` | `HttpFoundationFactory` and the reverse PSR-7 bridge. |
| `nyholm/psr7` | PSR-7 implementation used at the boundary. |

## History note

An earlier draft proposed implementing `Symfony\Component\HttpKernel\HttpKernel` directly — pure HttpFoundation, `handle(Request $request, ...): Response`, no PSR-15 boundary. It was rejected before shipping: a framework-bound public interface is exactly the failure mode a portable Composer package can't afford. A three-phase rollout (framework lib → plugin `local_middag` → cleanup) was once planned for the PSR-15 migration; it no longer applies now that the framework ships as its own Composer package — the phased-migration framing only matters to products still consuming an older in-plugin copy.
