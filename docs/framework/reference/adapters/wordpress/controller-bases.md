---
title: 'wordpress adapter — Controller Bases'
---

# Controller Bases

Reference for the two controller bases in `middag-io/wordpress`. Backs [WP-001](https://github.com/middag-io/middag-php-wordpress/tree/main/docs/decisions) (WordPress HTTP integration) and builds on [FW-014](https://github.com/middag-io/middag-php-framework/blob/main/docs/decisions/FW-014-segregated-controller-role-interfaces.md) (segregated controller role interfaces). The surfaces that dispatch to these controllers are in [Routing Surfaces](./routing-surfaces).

Verified against `middag-php-wordpress/main@bc1bc59`, `middag-php-framework/main` and `middag-php-moodle/main` on 2026-11-04.

## Bases across the ecosystem

| Layer | Page-controller base | REST/API base | REST ↔ page |
|---|---|---|---|
| Framework | `Http/Controller/AbstractController implements ControllerInterface` | `AbstractApiController extends AbstractController` | REST extends page |
| Moodle adapter | `Http/Controller/AbstractController implements MoodleControllerInterface` (which extends `ControllerInterface` and `CapabilityRequirementAwareInterface`) | `AbstractApiController extends AbstractController` | REST extends page |
| WordPress adapter | `Http/Controller/AbstractWpController extends` the framework `AbstractController` | `Http/Controller/AbstractWpRestController implements RestControllerInterface` | separate |

The framework `ControllerInterface` is the union of three role interfaces (`ContainerAwareInterface`, `RequestHandlingInterface`, `AuthorizationAwareInterface`) and carries no host types, so a host base can implement it without leaking WordPress or Moodle into the framework.

## Page base

`AbstractWpController` (`@api`, abstract) is the base for Inertia pages served through the admin surface. It inherits the full `ControllerInterface` surface and the framework helpers (`redirect()`, `redirectToRoute()`, `redirectBack()`, `flash()`, `response()`, `getService()`) and adds:

| Member | Behaviour |
|---|---|
| `render(string $component, array $props = [])` (protected) | Delegates to the `InertiaAdapter` resolved from the container. Throws `RuntimeException` when none is bound. |
| `setRequireLogin()` | `is_user_logged_in()`, else `auth_redirect()` (sends the visitor to the login screen and halts). |
| `setRequireCapabilities(array $capabilities, string $context = 'system', int $instanceId = 0)` | `current_user_can()` for every capability; the first one missing halts with `wp_die(..., ['response' => 403])`. |

WordPress has no Moodle-style context and instance model, so the capability gate maps the shared signature this way:

- `$instanceId > 0` is passed as the meta-capability object id, `current_user_can($cap, $instanceId)`, which WordPress resolves through `map_meta_cap` (for example `current_user_can('edit_post', 123)`).
- `$instanceId === 0` is a global check, `current_user_can($cap)`.
- `$context` has no WordPress equivalent. It is accepted for cross-adapter signature parity and ignored.

The base carries no Moodle-only concerns: no sesskey, no context objects, no page layout, heading or navbar. A page controller calls `$this->render('Component', $props)` instead of calling `InertiaAdapter` by hand.

## REST base

`AbstractWpRestController` (`@api`, abstract) implements `RestControllerInterface` (`registerRoutes(string $namespace): void`) and is built with an injected `RequestAuthenticatorInterface` (constructor injection; no container awareness).

| Member | Behaviour |
|---|---|
| `permissionCheck(WP_REST_Request)` | Default `permission_callback`. `OPTIONS` passes; a `WP_Error` from the authenticator is returned; no user gives `401`. |
| `adminPermissionCheck(WP_REST_Request)` | As above, then `403` unless `isAdmin()`. |
| `publicPermissionCheck(WP_REST_Request)` | Always `true`. |
| `route($namespace, $path, $method, $callback, $permission = null)` (protected) | `register_rest_route()` with `permissionCheck` as the default permission callback. |
| `getUser()`, `getBody()` (protected) | The authenticated `WP_User` or `null`; the JSON body as an array. |
| `sanitizedText()`, `sanitizedKey()`, `sanitizedEmail()`, `sanitizedTextarea()`, `sanitizedHtml()` (protected) | Read one request param through `SanitizeSupport` (`sanitize_text_field`, `sanitize_key`, `sanitize_email`, `sanitize_textarea_field`, `wp_kses_post`), with a default for a missing or non-string value. |
| `validateRequired(array $data, array $fields)` (protected) | `null` when every field is present and non-blank, else `RestResponse::validationError()`. |

Controllers routed by attributes through `RestRouteAttributeRegistrar` do not need this base: `WpRestKernel` supplies the permission callback and resolves the action arguments (see [Routing Surfaces](./routing-surfaces#declarative-restrouteattributeregistrar-wprestkernel)).

## Why the bases do not share a parent

- The WordPress REST lifecycle is registration: `register_rest_route()` with a `permission_callback` per route, dispatched over `WP_REST_Request`. There is no single `handle()` / `setRequest(Request)` cycle, and a permission failure must be a `WP_Error`, not a halt.
- A shared parent would give REST controllers lifecycle methods they never use and a page-shaped `setRequireCapabilities()` whose `wp_die()` is wrong for REST.

The framework role interfaces make a later, non-breaking retrofit possible: a REST base could compose a single role (for example `ContainerAwareInterface`) without faking the page lifecycle. It is deferred because REST controllers receive their dependencies through the constructor and no consumer needs `setContainer()`.
