---
title: 'wordpress adapter — REST Controllers and Routes'
---

# Add REST controllers and routes

**Goal:** expose REST routes from your plugin under its own namespace, protect them with login and capabilities, call them from the browser with a nonce, and accept other credentials through your own authenticator.

**Prerequisites:**

- A plugin with a kernel and a container, as built in [Getting started with the WordPress adapter](../../tutorials/wordpress/getting-started).
- A `WpComponentContext` and a `RequestAuthenticatorInterface` binding in the container.
- The constants `ACME_NOTES_FILE`, `ACME_NOTES_DIR` and `ACME_NOTES_VERSION`, defined in the main plugin file as in [Boot diagnostics](./diagnostics#_1-declare-the-probe-in-the-main-plugin-file).

The adapter has two ways to declare routes. Both produce routes under `{component}/v1`, so they can coexist while you move controllers from one to the other.

| Style | Controller | Registrar | Who wires it |
| --- | --- | --- | --- |
| Imperative | extends `AbstractWpRestController`, calls `route()` in `registerRoutes()` | `RestRouteRegistrar` | the kernel, on `rest_api_init` |
| Declarative | any class with the framework `#[Route]`, `#[Auth]` and `#[Middleware]` attributes | `RestRouteAttributeRegistrar` with `WpRestKernel` | your `onBoot()` |

The imperative style is shown in the [tutorial](../../tutorials/wordpress/getting-started#_4-write-the-rest-controller). This guide covers the declarative style, capabilities, nonces and authentication.

## 1. Write an attribute-routed controller

The controller below needs no base class. The class-level `#[Auth]` applies to every action that has no `#[Auth]` of its own:

```php
<?php

declare(strict_types=1);

namespace Acme\Notes\Http;

use Middag\Framework\Http\Attribute\Auth;
use Middag\Framework\Http\Attribute\Middleware;
use Middag\WordPress\Http\Response\RestResponse;
use Symfony\Component\Routing\Attribute\Route;
use WP_REST_Request;
use WP_REST_Response;

#[Auth(capabilities: ['acme_manage_notes'])]
final class NoteController
{
    /**
     * GET /wp-json/acme-notes/v1/status: public.
     *
     * @return array{ok: bool}
     */
    #[Route('/status', methods: ['GET'])]
    #[Auth(login: false)]
    public function status(): array
    {
        return ['ok' => true];
    }

    /** GET /wp-json/acme-notes/v1/notes/{id}: needs acme_manage_notes (class-level #[Auth]). */
    #[Route('/notes/{id}', requirements: ['id' => '\d+'], methods: ['GET'])]
    public function show(string $id): WP_REST_Response
    {
        $noteId = (int) $id;
        if ($noteId > 1000) {
            return RestResponse::notFound('Note not found.');
        }

        return RestResponse::success(['id' => $noteId]);
    }

    /** POST /wp-json/acme-notes/v1/notes: JSON body only. */
    #[Route('/notes', methods: ['POST'])]
    #[Middleware(RequireJsonMiddleware::class)]
    public function create(WP_REST_Request $request): WP_REST_Response
    {
        $title = sanitize_text_field((string) $request->get_param('title'));
        if ($title === '') {
            return RestResponse::validationError(['title' => 'The title field is required.']);
        }

        return RestResponse::created(['title' => $title]);
    }

    /** GET /wp-json/acme-notes/v1/posts/{post}/notes: logged in, then edit_post on that post. */
    #[Route('/posts/{post}/notes', requirements: ['post' => '\d+'], methods: ['GET'])]
    #[Auth]
    public function forPost(string $post): WP_REST_Response
    {
        $postId = (int) $post;
        if (!current_user_can('edit_post', $postId)) {
            return RestResponse::forbidden();
        }

        return RestResponse::success(['post' => $postId, 'notes' => []]);
    }
}
```

The REST kernel passes each action the request or the named request params, so the `{id}` placeholder arrives as a **string**. It wraps any return value that is not a `WP_REST_Response` in `RestResponse::success()`, and turns an exception into a `500` inside the REST envelope. A route without `methods` answers `GET` only. The full dispatch sequence, and how paths are translated, is in [Routing Surfaces](../../reference/adapters/wordpress/routing-surfaces#declarative-restrouteattributeregistrar-wprestkernel).

## 2. Add route middleware

A REST route middleware implements `RestRouteMiddlewareInterface`. It can answer by itself, and then the controller never runs:

```php
<?php

declare(strict_types=1);

namespace Acme\Notes\Http;

use Middag\WordPress\Http\Contract\RestRouteMiddlewareInterface;
use Middag\WordPress\Http\Response\RestResponse;
use WP_REST_Request;
use WP_REST_Response;

final class RequireJsonMiddleware implements RestRouteMiddlewareInterface
{
    public function process(WP_REST_Request $request, callable $next): WP_REST_Response
    {
        if (!$request->is_json_content_type()) {
            return RestResponse::error('UNSUPPORTED_MEDIA_TYPE', 'Send a JSON body.', 415);
        }

        return $next($request);
    }
}
```

Class-level `#[Middleware]` entries run first (outermost), then the method-level ones, each in declaration order. The kernel takes each middleware from the container, or builds it with `new` when the container does not have it.

## 3. Register the controller

Bind the REST kernel, the registrar and the controller in `buildContainer()`:

```php
use Acme\Notes\Http\NoteController;
use Middag\Framework\Kernel\Contract\HostComponentContextInterface;
use Middag\WordPress\Http\Auth\WpSessionAuthenticator;
use Middag\WordPress\Http\Contract\RequestAuthenticatorInterface;
use Middag\WordPress\Http\Routing\RestRouteAttributeRegistrar;
use Middag\WordPress\Http\WpRestKernel;
use Symfony\Component\DependencyInjection\Reference;

$builder->register(RequestAuthenticatorInterface::class, WpSessionAuthenticator::class)->setPublic(true);
$builder->register(NoteController::class)->setAutowired(true)->setPublic(true);
$builder->register(WpRestKernel::class)
    ->setArguments([new Reference('service_container'), new Reference(RequestAuthenticatorInterface::class)])
    ->setPublic(true);
$builder->register(RestRouteAttributeRegistrar::class)
    ->setArguments([
        new Reference(WpRestKernel::class),
        new Reference(HostComponentContextInterface::class),
        new Reference('service_container'),
    ])
    ->addMethodCall('addController', [NoteController::class])
    ->setPublic(true);
```

The kernel hooks only the imperative `RestRouteRegistrar` by itself. Hook the attribute registrar in your kernel's `onBoot()`:

```php
protected function onBoot(ContainerInterface $container): void
{
    $rest = $container->get(RestRouteAttributeRegistrar::class);
    add_action('rest_api_init', [$rest, 'register']);
}
```

The routes now live under `acme-notes/v1`, the component name of your `WpComponentContext`. To use another version segment, set the registrar's `$apiVersion` constructor argument by name, for example `->setArgument('$apiVersion', 'v2')` on its service definition.

## 4. Protect routes with capabilities

`WpRestKernel::authorize()` is the `permission_callback` of every attribute route. The effective `#[Auth]` is the method's, else the class's, else `new Auth()`, so an action with no `#[Auth]` anywhere **requires login**. A request without a user gets `401`, and a user without one of the listed capabilities gets `403`. The full order of the checks is in [Routing Surfaces](../../reference/adapters/wordpress/routing-surfaces#declarative-restrouteattributeregistrar-wprestkernel).

A method-level `#[Auth]` replaces the class-level one; it does not add to it. In the controller above, `forPost()` has a bare `#[Auth]`, so it requires login only, and the action checks `edit_post` itself.

WordPress capabilities are checked as capabilities, never as roles: an administrator without `acme_manage_notes` gets `403`. Grant your plugin's capabilities to the roles that need them, administrators included, when the plugin is activated. `CapabilityRegistrar` adds them, and removes them with `unregister()`:

```php
use Middag\WordPress\Security\CapabilityRegistrar;

$capabilities = new CapabilityRegistrar([
    'administrator' => ['acme_manage_notes'],
    'editor' => ['acme_manage_notes'],
]);

$capabilities->register();   // on activation; returns ['administrator:acme_manage_notes' => true, ...]
$capabilities->unregister(); // on uninstall
```

Role capabilities are stored in the database, so grant them once on activation, not on every request. Run them through `PluginLifecycle`, as shown in [Cron](./cron#_3-unschedule-on-deactivation).

The role lists also accept the cases of the `WpCapability` and `WooCommerceCapability` enums, for example `WpCapability::ManageOptions`.

### Check a capability on one object

`#[Auth]` takes a fixed `instanceId`, which WordPress passes as the object id of a meta capability. A route parameter is not known when the attribute is read, so check a capability on the object named in the URL inside the action, as `forPost()` does with `current_user_can('edit_post', $postId)`. When you use your own authenticator, check the user it resolved with `user_can($user, 'edit_post', $postId)` instead.

## 5. Call a protected route from the browser

`WpSessionAuthenticator` reads the WordPress session. WordPress itself requires a REST nonce for cookie authentication: a request that carries the login cookie but no nonce is treated as anonymous, and your route answers `401`.

Send the nonce of the `wp_rest` action in the `X-WP-Nonce` header (or in the `_wpnonce` parameter):

```php
add_action('admin_enqueue_scripts', static function (): void {
    wp_enqueue_script('acme-notes-admin', plugins_url('assets/admin.js', ACME_NOTES_FILE), [], ACME_NOTES_VERSION, true);
    wp_localize_script('acme-notes-admin', 'acmeNotes', [
        'root' => esc_url_raw(rest_url('acme-notes/v1/')),
        'nonce' => wp_create_nonce('wp_rest'),
    ]);
});
```

```js
const response = await fetch(`${acmeNotes.root}notes/5`, {
  headers: { 'X-WP-Nonce': acmeNotes.nonce },
})
```

A script that uses the `wp-api-fetch` package gets this header without extra code.

::: info The Nonce attribute is for the admin surface
The adapter's `Security\Attribute\Nonce` attribute is read by the admin HTTP kernel (`WpHttpKernel`), which serves wp-admin pages. The REST kernel does not read it. On REST, the `wp_rest` nonce above is the only nonce check. See [Routing Surfaces](../../reference/adapters/wordpress/routing-surfaces#admin).
:::

## 6. Accept other credentials

To accept an API token, implement `RequestAuthenticatorInterface` and bind it in place of `WpSessionAuthenticator`. The adapter ships no token code. This authenticator accepts one service token and falls back to the session:

```php
<?php

declare(strict_types=1);

namespace Acme\Notes\Http;

use Middag\WordPress\Http\Auth\WpSessionAuthenticator;
use Middag\WordPress\Http\Contract\RequestAuthenticatorInterface;
use WP_Error;
use WP_REST_Request;
use WP_User;

/** Accepts "Authorization: Bearer <token>" for one service user, then falls back to the session. */
final class TokenAuthenticator implements RequestAuthenticatorInterface
{
    public function __construct(
        private readonly RequestAuthenticatorInterface $session = new WpSessionAuthenticator(),
    ) {}

    public function resolveUser(WP_REST_Request $request): WP_Error|WP_User|null
    {
        $header = (string) $request->get_header('authorization');
        if (!str_starts_with($header, 'Bearer ')) {
            return $this->session->resolveUser($request);
        }

        $expected = (string) get_option('acme_notes_api_token_hash', '');
        if ($expected === '' || !hash_equals($expected, hash('sha256', substr($header, 7)))) {
            return new WP_Error('invalid_token', 'The token is not valid.', ['status' => 401]);
        }

        $user = get_user_by('login', 'acme-service');

        return $user instanceof WP_User ? $user : null;
    }

    public function isAdmin(WP_REST_Request $request): bool
    {
        $user = $this->resolveUser($request);

        return $user instanceof WP_User && in_array('administrator', $user->roles, true);
    }
}
```

Return `null` for an anonymous request and a `WP_Error` when a credential was presented and rejected. Capabilities are checked against the user you return, so the token user needs the capabilities its routes list. The contract is described in [Authentication seam](../../reference/adapters/wordpress/routing-surfaces#authentication-seam).

## Response helpers

`RestResponse` builds the adapter's envelope (`success`, `data`, `meta`, `message`, `errors`):

| Helper | Status |
| --- | --- |
| `success($data, $status = 200, $message = null)` | 200 |
| `created($data, $message = null)` | 201 |
| `noContent()` | 204 |
| `paginated($data, $total, $perPage, $currentPage)` | 200, with `meta.page`, `meta.per_page`, `meta.total`, `meta.pages` |
| `validationError($fields, $message = 'Validation failed.')` | 422, with `errors.fields` |
| `unauthorized()`, `forbidden()`, `notFound()`, `conflict($message)` | 401, 403, 404, 409 |
| `rateLimit($message, $retryAfter = 60)` | 429, with a `Retry-After` header |
| `error($code, $message, $status = 400, $errors = null)`, `internalError()` | any, 500 |

A denial from the permission callback (`401`, `403`) is a WordPress `WP_Error` with `code`, `message` and `data.status`, not this envelope.

## What can go wrong

- **`Adding definition to a compiled container is not allowed.`** The attribute registrar found a controller that is not in the container and tried to register it. Register every attribute-routed controller as a public service, as in step 3.
- **The attribute routes answer `404` (`rest_no_route`).** The attribute registrar is not hooked. The kernel hooks only `RestRouteRegistrar`; add the `rest_api_init` action in `onBoot()`.
- **An administrator gets `403`.** The administrator role lacks the capability. Grant it with `CapabilityRegistrar` on activation.
- **A logged-in user gets `401` from JavaScript.** The request has no `wp_rest` nonce, so WordPress dropped the cookie user. Send `X-WP-Nonce`.
- **A route answers `500` with `INTERNAL_ERROR`.** The action or a middleware threw. The REST kernel does not log it; catch and log inside the action when you need the cause.
- **`REST route middleware "…" must implement …`.** A class named in `#[Middleware]` does not implement `RestRouteMiddlewareInterface`. The kernel throws this `RuntimeException` before the middleware chain runs, outside the envelope, because it is a wiring bug: fix the class.

## Reference

- [Routing Surfaces](../../reference/adapters/wordpress/routing-surfaces#rest): both REST registrars, the full authorization order and the authentication seam.
- [Controller Bases](../../reference/adapters/wordpress/controller-bases#rest-base): `AbstractWpRestController` members.
- [Routing & Auth Attributes](../../reference/attribute-routing-and-auth-model): the framework's `#[Route]`, `#[Auth]` and `#[Middleware]`.
