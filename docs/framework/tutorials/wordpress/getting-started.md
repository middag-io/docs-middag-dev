---
title: 'wordpress adapter — Getting Started'
---

# Getting started with the WordPress adapter

In this tutorial you build a small WordPress plugin, **Acme Hello**, on top of `middag-io/wordpress`. At the end the plugin has its own composition root (a kernel and a container), reads configuration through the adapter's config resolver, and answers two REST routes:

- `GET /wp-json/acme-hello/v1/hello`, open to everyone.
- `GET /wp-json/acme-hello/v1/me`, which needs a logged-in user.

The adapter is a library, not a plugin. Your plugin is the composition root: it builds the container, binds the services and boots the kernel. [Reference — WordPress Adapter](../../reference/adapters/wordpress/) describes what the adapter is; this page only walks you through a first working plugin.

## What you need

| Item     | Version                                                                                 |
| -------- | --------------------------------------------------------------------------------------- |
| PHP      | `^8.3` (8.3, 8.4 and 8.5), with the `json` extension                                    |
| WordPress | 7.0 or 7.1                                                                             |
| Composer | 2.x                                                                                     |
| Symfony  | `^7.4 \|\| ^8.1`, resolved by Composer (PHP 8.3 resolves 7.4; PHP 8.4 and 8.5 can resolve 8.x) |

The full requirements table, including the `middag-io/framework` range of each release line, is in [Requirements and install](../../reference/adapters/wordpress/#requirements-and-install).

You also need a WordPress site you can install plugins on, and a user with the `administrator` role.

## 1. Create the plugin and install the adapter

Create the plugin folder `wp-content/plugins/acme-hello/` and, inside it, a `composer.json` that maps your namespace to `src/`:

```json
{
  "name": "acme/hello",
  "type": "wordpress-plugin",
  "require": {
    "php": "^8.3"
  },
  "autoload": {
    "psr-4": {
      "Acme\\Hello\\": "src/"
    }
  }
}
```

Install the adapter:

```bash
cd wp-content/plugins/acme-hello
composer require middag-io/wordpress
```

Composer adds `middag-io/wordpress` to `require` and also installs `middag-io/framework` and `middag-io/ui`, which the adapter depends on.

## 2. Write the main plugin file

The main plugin file loads the Composer autoloader, declares the plugin's version and directory, and boots the kernel on `plugins_loaded`. Create `acme-hello.php`:

```php
<?php
/**
 * Plugin Name: Acme Hello
 * Description: A first plugin built on the MIDDAG WordPress adapter.
 * Version:     0.1.0
 * Requires PHP: 8.3
 */

declare(strict_types=1);

defined('ABSPATH') || exit;

require_once __DIR__ . '/vendor/autoload.php';

define('ACME_HELLO_VERSION', '0.1.0');
define('ACME_HELLO_DIR', plugin_dir_path(__FILE__));

add_action('plugins_loaded', [Acme\Hello\AcmeHelloKernel::class, 'init']);
```

## 3. Write the kernel: the composition root

Your kernel extends the adapter's abstract `Middag\WordPress\Runtime\Kernel`. It provides two things:

- `kernel()` stores the singleton on **your** class, so two plugins built on the adapter never share a kernel.
- `buildContainer()` builds the plugin's container.

Create `src/AcmeHelloKernel.php`:

```php
<?php

declare(strict_types=1);

namespace Acme\Hello;

use Acme\Hello\Http\HelloController;
use Middag\Framework\Kernel\Contract\ConfigResolverInterface;
use Middag\Framework\Kernel\Contract\HostComponentContextInterface;
use Middag\WordPress\Config\WpConfigResolver;
use Middag\WordPress\Http\Auth\WpSessionAuthenticator;
use Middag\WordPress\Http\Contract\RequestAuthenticatorInterface;
use Middag\WordPress\Http\Routing\RestRouteRegistrar;
use Middag\WordPress\Runtime\Kernel;
use Middag\WordPress\Runtime\WpComponentContext;
use Psr\Container\ContainerInterface;
use Symfony\Component\DependencyInjection\ContainerBuilder;
use Symfony\Component\DependencyInjection\Reference;

final class AcmeHelloKernel extends Kernel
{
    private static ?self $kernel = null;

    protected static function kernel(): static
    {
        return self::$kernel ??= new static();
    }

    protected function buildContainer(): ContainerInterface
    {
        $builder = new ContainerBuilder();

        // Who this plugin is: REST namespace, menu slugs, cron keys.
        $builder->register(HostComponentContextInterface::class, WpComponentContext::class)
            ->setArguments(['acme-hello', ACME_HELLO_VERSION, ACME_HELLO_DIR])
            ->setPublic(true);

        // Configuration: ACME_HELLO_* environment variables, then acme_hello_* options.
        $builder->register(ConfigResolverInterface::class, WpConfigResolver::class)
            ->setArguments(['ACME_HELLO_', 'acme_hello_'])
            ->setPublic(true);

        // Who is calling: the WordPress session (cookie authentication).
        $builder->register(RequestAuthenticatorInterface::class, WpSessionAuthenticator::class)
            ->setPublic(true);

        $builder->register(HelloController::class)
            ->setAutowired(true)
            ->setPublic(true);

        // The kernel calls register() on rest_api_init because this service exists.
        $builder->register(RestRouteRegistrar::class)
            ->setArguments([
                new Reference('service_container'),
                new Reference(HostComponentContextInterface::class),
            ])
            ->addMethodCall('addController', [HelloController::class])
            ->setPublic(true);

        $builder->compile();

        return $builder;
    }
}
```

What each binding does:

- **`WpComponentContext`** is the plugin's identity. The REST registrar builds the namespace `acme-hello/v1` from its component name. The context goes into your container, never into a process-wide slot ([Configuration & Identity](../../reference/adapters/wordpress/configuration#component-identity)).
- **`WpConfigResolver`** reads a key from the environment variable `ACME_HELLO_{KEY}`, then from the option `acme_hello_{key}`, then falls back to the default you pass. Always pass your own prefixes: the defaults are the neutral `MIDDAGLIB_` and `middaglib_` ([Neutral defaults](../../reference/adapters/wordpress/configuration#neutral-defaults)).
- **`WpSessionAuthenticator`** resolves the user from the WordPress session. The REST controller base asks it who is calling.
- **`RestRouteRegistrar`** collects REST controllers. On boot the kernel hooks `register()` on `rest_api_init` when the container has this service, and `register()` asks each controller to add its routes under `acme-hello/v1`.

Every service is public because the kernel and the registrars look services up with `has()` and `get()`. A compiled Symfony container hides private services from both.

## 4. Write the REST controller

The controller extends `AbstractWpRestController`. It registers its own routes in `registerRoutes()` through the protected `route()` helper, which calls `register_rest_route()` for you. Create `src/Http/HelloController.php`:

```php
<?php

declare(strict_types=1);

namespace Acme\Hello\Http;

use Middag\Framework\Kernel\Contract\ConfigResolverInterface;
use Middag\WordPress\Http\Contract\RequestAuthenticatorInterface;
use Middag\WordPress\Http\Controller\AbstractWpRestController;
use Middag\WordPress\Http\Response\RestResponse;
use WP_REST_Request;
use WP_REST_Response;

final class HelloController extends AbstractWpRestController
{
    public function __construct(
        RequestAuthenticatorInterface $authenticator,
        private readonly ConfigResolverInterface $config,
    ) {
        parent::__construct($authenticator);
    }

    public function registerRoutes(string $namespace): void
    {
        // Anyone may call GET /wp-json/acme-hello/v1/hello.
        $this->route($namespace, '/hello', 'GET', [$this, 'hello'], [$this, 'publicPermissionCheck']);

        // GET /wp-json/acme-hello/v1/me needs a logged-in user (the default permission check).
        $this->route($namespace, '/me', 'GET', [$this, 'me']);
    }

    public function hello(WP_REST_Request $request): WP_REST_Response
    {
        return RestResponse::success([
            'greeting' => $this->config->get('greeting', default: 'Hello from Acme'),
        ]);
    }

    public function me(WP_REST_Request $request): WP_REST_Response
    {
        $user = $this->getUser($request);

        return RestResponse::success([
            'id' => $user?->ID,
            'login' => $user?->user_login,
        ]);
    }
}
```

- When you leave out the last argument of `route()`, the route uses `permissionCheck()`, which answers `401` when no user is logged in.
- `publicPermissionCheck()` always allows the request.
- `RestResponse::success()` wraps the data in the adapter's REST envelope: `success`, `data`, `meta`, `message` and `errors`.

Your plugin now looks like this:

```text
acme-hello/
├── acme-hello.php
├── composer.json
├── src/
│   ├── AcmeHelloKernel.php
│   └── Http/
│       └── HelloController.php
└── vendor/
```

## 5. Activate the plugin and call it

Activate **Acme Hello** in **Plugins**, or with WP-CLI:

```bash
wp plugin activate acme-hello
```

Call the public route. Replace `https://example.test` with your site's URL:

```bash
curl -s https://example.test/wp-json/acme-hello/v1/hello
```

```json
{ "success": true, "data": { "greeting": "Hello from Acme" }, "meta": null, "message": null, "errors": null }
```

Change the greeting through the config resolver. The option `acme_hello_greeting` is the key `greeting` under your option prefix:

```bash
wp option update acme_hello_greeting 'Hi there'
curl -s https://example.test/wp-json/acme-hello/v1/hello
```

The response now carries `"greeting": "Hi there"`. An environment variable `ACME_HELLO_GREETING` takes priority over the option.

Call the protected route without logging in:

```bash
curl -s https://example.test/wp-json/acme-hello/v1/me
```

```json
{ "code": "unauthorized", "message": "User not authenticated.", "data": { "status": 401 } }
```

A logged-in administrator who calls `/me` from the browser, with the REST nonce (see [REST controllers and routes](../../how-to/wordpress/rest-controllers#_5-call-a-protected-route-from-the-browser)), gets `{"id": 1, "login": "admin"}` in `data`.

## What can go wrong

- **`Class "Acme\Hello\AcmeHelloKernel" not found`.** The autoloader does not know your namespace. Check the `autoload` block in `composer.json` and run `composer dump-autoload`.
- **The route answers `404` with `rest_no_route`.** The kernel did not boot, or `RestRouteRegistrar` is not in the container. Check that `acme-hello.php` hooks `init` on `plugins_loaded` and that the service is registered under the `RestRouteRegistrar` class name.
- **The routes are missing although the kernel booted.** A service the kernel looks up is private. The kernel checks `has()` before it hooks a registrar, so a private `RestRouteRegistrar` is skipped without an error. Mark the service public with `setPublic(true)`.
- **Permalinks are plain.** `/wp-json/` needs pretty permalinks. Without them, call `https://example.test/?rest_route=/acme-hello/v1/hello`.

## Next steps

- [REST controllers and routes](../../how-to/wordpress/rest-controllers): attribute routes, capabilities, nonces and your own authenticator.
- [Persistence](../../how-to/wordpress/persistence) and [Repositories](../../how-to/wordpress/repositories): custom tables, posts, users and metadata.
- [Hooks](../../how-to/wordpress/hooks), [Cron](../../how-to/wordpress/cron), [Mail](../../how-to/wordpress/mail), [Settings and definitions](../../how-to/wordpress/settings) and [Boot diagnostics](../../how-to/wordpress/diagnostics).
- [Configuration & Identity](../../reference/adapters/wordpress/configuration): the kernel's boot timeline and the full list of neutral defaults.
