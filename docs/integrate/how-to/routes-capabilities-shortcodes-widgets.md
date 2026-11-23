---
title: 'Routes, capabilities, shortcodes and widgets'
---

# Routes, capabilities, shortcodes and widgets

How a Moodle extension built on `local_middag` declares HTTP routes, Moodle capabilities, `[middag]` shortcodes and dashboard widgets, and what the plugin does with each declaration today. `middag-io/core` is on its pre-stable `1.x` line; only the curated `@api` types are meant for integrators, and an open enum may gain values, so handle values you do not know. See [Integrating with MIDDAG](/integrate/explanation/overview).

This guide assumes an extension class that extends `local_middag\base\extension\abstract_extension`. See [Extension contract](/integrate/reference/extension-contract).

## Declare HTTP routes

The plugin discovers routes when your extension boots. It boots only when the extension is enabled or is core.

1. Put each controller in a file whose name ends in `_controller.php`, anywhere under the directory of your extension class. The class namespace must follow the directory, below the extension's namespace.
2. Extend `local_middag\base\http\abstract_controller` for pages, or `local_middag\base\http\abstract_api_controller` for JSON endpoints.
3. Add Symfony's `#[Route]` attribute to each public action. Give it a `path` and a `name`; the loader skips a route without either. Without `methods`, the route accepts GET and POST.
4. Declare who may call it with the framework's `#[Auth]` attribute, on the class or on the method. The method attribute takes precedence.

```php
<?php

declare(strict_types=1);

namespace local_acme\extensions\reports\controller;

use local_middag\base\http\abstract_api_controller;
use Middag\Framework\Http\Attribute\Auth;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

#[Auth(capabilities: ['local/acme:view'])]
final class report_api_controller extends abstract_api_controller
{
    #[Route(path: '/acme/reports/{id}', name: 'acme_reports_show', methods: ['GET'])]
    public function show(int $id = 0): Response
    {
        return $this->jsonResponse(['id' => $id]);
    }
}
```

For a controller in another `local_*` plugin, generated URLs point at that plugin's own entry point: `/local/<plugin>/ajax.php` for API controllers and `/local/<plugin>/index.php` for the rest. That plugin provides those entry points; see [Routing bridge maturity](/framework/reference/adapters/moodle/routing-bridge-maturity). On `abstract_api_controller`, a path under `/api/` is part of the external REST surface: when the site's REST API setting is off, it answers 403 before authentication runs. The `#[Auth]` model is described in [Attribute routing and auth model](/framework/reference/attribute-routing-and-auth-model).

### The core route types

| Type | Role |
|---|---|
| `Middag\Core\Http\Routing\Route` | Static, Laravel-style registration facade (`Route::get()`, `Route::post()`, `Route::group()`, `Route::surface()`). Needs a host seam bound with `Route::install()`. |
| `Middag\Core\Http\Routing\Enum\RouteSurface` | Where a route is served: `Page`, `Admin` or `Rest`. PUT, PATCH and DELETE exist only on `Rest`. |
| `Middag\Core\Http\Routing\Exception\UnsupportedRouteFeatureException` | Thrown at registration when the host cannot honour a verb, surface or feature. Once a seam is installed, `domain()`, `namespace()` and `scopeBindings()` always throw it. Without a seam, every facade call throws `CoreLifecycleViolationException`. |
| `Middag\Core\Http\Routing\ExtensionRouteConvention` | Value object that composes `publicPrefix()`, `apiPath()` and `adminPath()` from an extension slug. Defaults: `/middag`, `/api`, `/admin`. |

`local_middag` does not bind a seam for the `Route` facade, so in Moodle a call such as `Route::get()` throws `CoreLifecycleViolationException`. Use attribute routes. The Moodle route loader also does not apply `ExtensionRouteConvention`; it uses the `path` of each `#[Route]` as written.

## Declare capabilities

Moodle installs capabilities only from a plugin's `db/access.php`. An extension that ships in its own Moodle plugin declares its capabilities in that plugin's hand-written `db/access.php`, as for any Moodle plugin, and checks them on routes with `#[Auth]`, as shown above. The name in `#[Auth]` is the name that `db/access.php` declares, such as `local/acme:view` in the route sample.

The extension class can also describe its capabilities in `getCapabilities()`. Each item is a `Middag\Moodle\Definition\CapabilityDefinition` from the open-source [`middag-io/moodle`](https://github.com/middag-io/middag-php-moodle) package.

```php
use Middag\Moodle\Definition\CapabilityDefinition;
use Middag\Moodle\Domain\Context\Enum\ContextLevel;
use Middag\Moodle\Security\Enum\CapabilityRisk;
use Middag\Moodle\Security\Enum\CapabilityType;

public function getCapabilities(): array
{
    return [
        new CapabilityDefinition(
            name: 'view',
            archetypes: ['manager', 'editingteacher'],
            type: CapabilityType::Read,
            context: ContextLevel::Course,
            risk: CapabilityRisk::Personal,
        ),
    ];
}
```

For the extensions of `local_middag` only, the generated full name is the plugin's name, then the extension slug and the short name: `view` in the `reports` extension of `local_middag` becomes `local/middag:reports_view`. In the core extension there is no slug part. Nothing reads `getCapabilities()` while a request runs. The `db/access.php` of `local_middag` is generated from the declarations of its own extensions; it does not include extensions from other plugins.

Two core types describe capabilities without a host:

| Type | Role |
|---|---|
| `Middag\Core\Security\Attribute\Capability` | Repeatable attribute on a class or method: `name`, optional `context` and `label`. |
| `Middag\Core\Security\AbstractCapabilityDefinition` | Base for a host-neutral definition. Implement `key()`; override `context()` (a `CapabilityContext`, default `System`), `host()` or `metadata()`. It implements the framework's `CapabilityDefinitionInterface`, which `#[Auth]` accepts. |

`#[Capability]` is a discovery marker only. Core tags the class `middag.capability`, but `local_middag` does not read that tag. It does not register or enforce the capability.

## Declare shortcodes

`Middag\Core\Output\Shortcode\Contract\ShortcodeManagerInterface` replaces each `[middag type="<tag>" key="value"]` in a text with the output of the handler registered for that tag. Register a handler with `register(string $tag, callable $callback)`; tags are case-insensitive. `has()` tells whether a tag is registered.

The manager is a shared container service. Resolve it from the container by `ShortcodeManagerInterface`; every caller gets the same instance. Register your handlers before text is filtered, for example when your extension boots. In this sample, `$manager` is that instance.

```php
$manager->register('acme_greeting', static fn (array $attrs): string
    => '<p>Hello, ' . s($attrs['name'] ?? 'guest') . '</p>');
```

The handler receives the shortcode attributes as an array of strings and returns HTML. The Moodle binding passes the output through `clean_text()`. A handler marked with the framework's `Middag\Framework\Shared\Attribute\TrustedOutput` attribute skips that step, and its author is responsible for the output. The attribute is read from an invokable object, a `[class, method]` callable or a named function; a closure is always sanitized. An unknown tag renders as an empty string; in developer debug mode it renders a warning.

`Middag\Core\Output\Shortcode\Attribute\Shortcode` (`tag`, optional `label`) is a discovery marker only. Core tags the class `middag.shortcode`, but `local_middag` does not read that tag, so the attribute alone does not register a handler.

## Declare dashboard widgets and blocks

| Type | Members |
|---|---|
| `Middag\Core\Admin\Contract\DashboardWidgetInterface` | `getSlug()`, `getTitle()`, `getExtension()`, `getPriority()` (lower renders first) and `render()`. |
| `local_middag\base\output\abstract_dashboard_widget` | Empty abstract base in the plugin that implements `DashboardWidgetInterface`. |
| `Middag\Core\Output\Block\Contract\BlockInterface` | `setTitle()`, `getTitle()`, `processContent()`, `getContent()`, `setAttribute()` and `render()`. |

No registry in core or `local_middag` collects implementations of these two interfaces, so implementing one does not show it anywhere.
