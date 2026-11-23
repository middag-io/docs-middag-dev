---
title: 'Distribute an extension as a Composer package'
---

# Distribute an extension as a Composer package

Ship a MIDDAG extension as a Composer package, with no Moodle plugin of its own. This works on Moodle only: no WordPress product loads package extensions. `middag-io/core` is on its pre-stable `1.x` line: only the curated `@api` types are meant for integrators, and open enums may gain cases in a minor release, so handle unknown values. See [Integrating with MIDDAG](/integrate/explanation/overview).

To ship an extension inside a Moodle plugin instead, use the `extend_extensions` hook described in [Extension contract](/integrate/reference/extension-contract).

## 1. Write the extension class

Extend the Moodle base class from `middag-io/core`. The class must be concrete.

```php
<?php

declare(strict_types=1);

namespace Acme\MiddagReports;

use Middag\Core\Adapter\Moodle\Extension\AbstractExtension;

class ReportsExtension extends AbstractExtension
{
    public const EXTENSION_IDNUMBER = 'acme_reports';
    public const GROUP = 'reports';
    public const DISTRIBUTION = 'third_party';

    public function getTitle(): string
    {
        return 'Acme reports';
    }
}
```

Override `getDescription()` and `getConfigPageTitle()` too: the base reads them from `local_middag` language strings. A class that only implements `MiddagExtensionInterface` is discovered but not loaded on Moodle. The constants and their rules are in [Extension contract](/integrate/reference/extension-contract). The slug `core` is reserved.

An optional `bootstrap.php` next to the class file runs for every discovered extension that is not `HIDDEN`, whether or not it is enabled. Use it only to register services, and put runtime behaviour in `boot()`. If it returns a callable, the callable receives the service container.

## 2. Declare the package

In the package's `composer.json`:

```json
{
    "name": "acme/middag-reports",
    "type": "middag-extension",
    "autoload": {
        "psr-4": {
            "Acme\\MiddagReports\\": "src/"
        }
    },
    "extra": {
        "middag": {
            "extension": "Acme\\MiddagReports\\ReportsExtension"
        }
    }
}
```

Also require `middag-io/core` with a constraint that pins the minor you tested, since a `1.x` minor may change the `@api` surface.

From your `composer.json` the loader reads these keys and nothing else:

| Key | Rule |
|---|---|
| `name` | A valid Composer package name. |
| `type` | Exactly `middag-extension`. Packages of any other type are ignored. |
| `extra.middag.extension` | One fully qualified class name with at least three segments (`Vendor\Package\Class`). |
| `autoload.psr-4` | The class must sit under one of these prefixes. The empty fallback prefix does not count. |

Any other key under `extra`, such as a path, is ignored.

## 3. Stay out of the reserved namespaces

The class must not sit in, or below, any of these namespaces: `Middag\Core`, `Middag\Moodle`, `Middag\Framework`, `Middag\Ui`, `Middag\Licensing`, `Middag\WordPress`, `Middag\DevTools` and `local_middag`. The check ignores case.

## 4. Install the package

1. Find the Composer project whose vendor tree provides `middag-io/core` to the site. The loader reads only the vendor tree whose autoloader serves the running core. A package in any other vendor tree is not seen. If the site has no Composer project that provides `middag-io/core`, for example a plugin installed from its zip, package extensions are not available; use the `extend_extensions` hook instead.
2. In that project, run:

   ```sh
   composer require acme/middag-reports
   ```

3. Enable the extension. Extensions are off by default:

   ```sh
   php admin/cli/cfg.php --component=local_middag --name=extension_acme_reports_enabled --set=1
   ```

   Run it from the directory that holds Moodle's `admin/` folder.

You do not need to purge caches. The extension list is cached per state of the vendor tree's installed packages, so an install, update or removal is picked up on the next request.

## What gets a package skipped

Besides the rules in steps 2 and 3, the loader skips the package, and logs its name and the reason, when:

- the install path does not exist, lies outside the vendor directory, or is claimed by another package;
- the class file is outside the install path, or another autoloader resolves the class to a different file;
- the class does not implement `MiddagExtensionInterface` or is abstract;
- `EXTENSION_IDNUMBER` is empty;
- the slug is `core` or is already taken by an extension of the plugin or one added through the hook.

A package that fails to load drops only itself. A PHP fatal error, such as a method signature that is incompatible with the parent class, is not caught and stops the request.

A package extension is external: it is never `native` or `pro`, so a failure in its `bootstrap.php` or `boot()` is isolated. See the isolation rules in [Extension contract](/integrate/reference/extension-contract).
