---
title: 'wordpress adapter — Routing Surfaces'
---

# Routing Surfaces

Reference for how `middag-io/wordpress` routes requests into a consumer plugin. Backs [WP-001](https://github.com/middag-io/middag-php-wordpress/tree/main/docs/decisions) (WordPress HTTP integration). The controller classes behind these surfaces are in [Controller Bases](./controller-bases).

Verified against `middag-php-wordpress/main@bc1bc59` on 2026-11-04.

## The three surfaces

Every surface is namespaced by the component name from the injected `HostComponentContextInterface` (`WpComponentContext`), never by a brand literal, so two plugins in one request never share a REST root, a menu slug or a query var. `tests/Architecture/RoutingBrandLiteralTest.php` fails the build if a routing source contains the literal `middag`.

| Surface | Class | WordPress mechanism | Namespacing | Dispatch |
|---|---|---|---|---|
| **REST** | `Http/Routing/RestRouteRegistrar` (imperative) or `Http/Routing/RestRouteAttributeRegistrar` (attributes) | `register_rest_route` | `{component}/{version}`, default version `v1` | `permission_callback` + `callback` per route |
| **Admin** | `Admin/AdminRouteRegistrar` | `add_menu_page` / `add_submenu_page` | menu slug `{component}`, submenu `{component}-{suffix}` | framework HTTP kernel (`WpHttpKernel`) |
| **Public** | `Http/Routing/PublicRouteRegistrar` | `add_rewrite_rule` + `query_vars` + `template_redirect` | query var `{component}_route` | the route's own handler |

A consumer wires each surface in its own composition root. The consumer kernel (see [Configuration & Identity](./configuration#the-consumer-kernel)) calls `RestRouteRegistrar::register()` on `rest_api_init` when the container binds it; the admin and public registrars are wired by the consumer.

## REST

WordPress models REST as registration: one `register_rest_route()` call per route with a boolean `permission_callback` and a `callback`, dispatched over `WP_REST_Request` and answered with `WP_REST_Response` or `WP_Error`. The adapter keeps that model. Two registrars produce the same namespace, so both can coexist while controllers migrate one by one.

### Imperative: `RestRouteRegistrar`

- `addController($class)` collects classes; `register()` resolves each and, when it implements `Http/Contract/RestControllerInterface`, calls `registerRoutes($namespace)` with `{component}/{version}`.
- The controller registers its own routes, usually through `AbstractWpRestController::route()` (see [Controller Bases](./controller-bases#rest-base)).

### Declarative: `RestRouteAttributeRegistrar` + `WpRestKernel`

- Controllers declare routes with the framework `#[Route]` attribute (Symfony route shape). The registrar loads them through the framework `RouteLoaderInterface` and registers one WordPress route per Symfony route. A route without methods defaults to `GET`.
- `Http/Routing/RestPathTranslator` (`@internal`) rewrites Symfony placeholders into WordPress named groups: `/organizations/{id}` with `['id' => '\d+']` becomes `/organizations/(?P<id>\d+)`; a placeholder without a requirement becomes `[^/]+`.
- Every route's `permission_callback` is `WpRestKernel::authorize()` and its `callback` is `WpRestKernel::handle()`.

`WpRestKernel::authorize()`:

1. `OPTIONS` (CORS preflight) passes.
2. The effective `#[Auth]` is the method-level attribute, else the class-level one, else `new Auth()` — so an action with no attribute **requires login** (secure default).
3. `login: false` passes.
4. Otherwise the injected `RequestAuthenticatorInterface` resolves the user. A `WP_Error` is returned as is; no user gives `401 unauthorized`.
5. If the `#[Auth]` lists any capability, the request must come from an administrator (`RequestAuthenticatorInterface::isAdmin()`), otherwise `403 forbidden`. The individual capability strings are not checked one by one on this surface.

`WpRestKernel::handle()`:

1. Resolves the `#[Middleware]` chain: class-level entries first (outermost), then method-level, each in declaration order. Each entry comes from the container, or is built with a zero-argument `new` when not registered, and must implement `Http/Contract/RestRouteMiddlewareInterface` (`process(WP_REST_Request, callable $next): WP_REST_Response`). A wrong type throws at dispatch: it is a wiring bug, not a request error.
2. Runs the chain around the action. A middleware may short-circuit by returning its own response, so a rejected request never resolves the controller or its arguments.
3. Resolves the controller (container first, else `new`), then the action arguments: a parameter typed `WP_REST_Request` gets the request; any other parameter gets `$request->get_param($name)`, or its declared default when the param is absent.
4. A returned `WP_REST_Response` is passed through; any other value is wrapped by `RestResponse::success()`.
5. Any throwable from the chain or the action becomes `RestResponse::internalError()` (500), so a failure never breaks the REST envelope.

The REST surface shares the framework's declarative attributes (`#[Route]`, `#[Auth]`, `#[Middleware]`) with the admin surface. It does not share the framework's HttpFoundation/PSR-15 pipeline: REST middleware speaks `WP_REST_Request`/`WP_REST_Response` so that a denial stays inside the REST envelope.

### Authentication seam

- `Http/Contract/RequestAuthenticatorInterface` has two methods: `resolveUser(WP_REST_Request): WP_User|WP_Error|null` (`WP_Error` when a presented credential was rejected, `null` when the request is anonymous) and `isAdmin(WP_REST_Request): bool`.
- `Http/Auth/WpSessionAuthenticator` is the default: the current WordPress session (cookie auth) only; `isAdmin()` checks the `administrator` role.
- A consumer that accepts bearer tokens composes an authenticator that tries the token and falls back to the session one, then injects it into `WpRestKernel` and its REST controllers. The adapter carries no token logic (guard: `tests/Architecture/NoBundledTokenAuthTest.php`).

## Admin

`Admin/AdminRouteRegistrar` turns a wp-admin menu tree into one dispatch pipeline.

- `register(MenuPage $main, list<SubMenuPage> $subPages)` adds the menu page and its submenus. Every page's callback is `renderApp()`. Each page records its route base and capability; a submenu without a capability inherits the main page's. `pageHookSuffixes()` returns the hook suffixes for the consumer's asset-enqueue guard.
- `renderApp()` reads `page`, `route` and the request method, then checks the page's capability through `UserSupport::currentUserCan()` (fail-closed, defaulting to `manage_options` for an unknown page) before dispatching. The check runs here because `renderApp()` is also reachable through `admin_init` and `admin-ajax.php`, where the WordPress menu gate never runs.
- `handleInertiaRequest()` (wire on `admin_init`) handles an Inertia XHR for one of this registrar's pages early and terminates before WordPress emits the admin HTML shell.
- `dispatch($page, $route, $method)` is pure (no superglobals). The path is `/{route}` when `route` is set, else the page's route base. If the adapter router has no match for the path and method, the injected fallback callable runs with `(page, path)`: the adapter forces neither Inertia nor a default page. Otherwise it builds a PSR-7 request for the synthetic path and runs it through the injected `HttpKernelInterface`, emitting the response through the injected `ResponseEmitterInterface`.

Routing for the admin surface:

- `Http/Routing/WpRouter` (`RouterInterface`) holds a Symfony `RouteCollection`. `scanAnnotations()` loads controller `#[Route]` attributes through the framework `RouteLoaderInterface`; `register()` adds an imperative route.
- `registerDefaultRoutes()` adds a `route_not_found` route (`/404`) and the global requirements `any` (`.*`), `id` (`[0-9]+`) and `uuid` (`[0-9a-fA-F\-]{36}`).
- `generateUrl()` returns Symfony paths (for example `/collaborators/42`), not `admin.php` URLs; an unknown route name falls back to `route_not_found`. The request context keeps an empty base URL because admin dispatch matches the synthetic path carried by `route`, not the physical `/wp-admin/...` URI.

`Http/WpHttpKernel` extends the framework `HttpKernel` (route matching, middleware pipeline, `#[Auth]` and `#[Middleware]`) and overrides `applyPlatformAuth()` to apply `#[Nonce]`:

- `Security/Attribute/Nonce(action, param = '_wpnonce', require = true)` on a method, or else on the class.
- The nonce value is read from the named request field, then the `X-WP-Nonce` header.
- A required nonce that is missing or fails `wp_verify_nonce()` throws `MiddagAuthorizationException` (403). This is the counterpart of the Moodle adapter's `#[Sesskey]`.

## Public

`Http/Routing/PublicRouteRegistrar` maps pretty URLs to handlers through the rewrite system.

- The query var is `{component}_route`, built from `sanitize_key(componentName())` with `-` turned into `_`.
- `addRoute($name, $regex, $handler)`: `$regex` is a WordPress rewrite regex; `$handler` runs on `template_redirect` and owns its output and exit.
- `register()` (call on `init`) adds the query var on the `query_vars` filter, adds one rewrite rule per route (`index.php?{component}_route={name}`, position `top`) and hooks `dispatch()` on `template_redirect`. When no route matched, `dispatch()` does nothing and WordPress renders the normal template.
- `flushRules()` persists the rule set. It is expensive: call it from the plugin's activation and deactivation (`Runtime/PluginLifecycle`), never on a normal request.

```php
// composition root
$lifecycle->onActivate(function () use ($public): void {
    $public->register();   // add the rules for this request
    $public->flushRules(); // then persist them
});
$lifecycle->onDeactivate(fn () => $public->flushRules());
```

## Not targeted

Widgets (`register_widget` / `WP_Widget`) and `admin-ajax.php` action handlers have no surface in the adapter.
