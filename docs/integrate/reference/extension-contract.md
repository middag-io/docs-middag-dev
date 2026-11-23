---
title: 'Extension contract'
---

# Extension contract

The types an extension implements and the rules the Moodle plugin `local_middag` applies when it discovers, orders and boots extensions. `middag-io/core` is on its pre-stable `1.x` line: only the curated `@api` types are meant for integrators, and open enums may gain cases in a minor release, so handle unknown values. See [Integrating with MIDDAG](/integrate/explanation/overview).

## Types

| Type | Role |
|---|---|
| `Middag\Core\Extension\Contract\MiddagExtensionInterface` | Contract every extension implements. Extends the framework's `ModuleInterface`. |
| `Middag\Core\Extension\AbstractMiddagExtension` | Host-neutral base class with default metadata. |
| `Middag\Core\Adapter\Moodle\Extension\AbstractExtension` | Moodle base class. Reads metadata from class constants, Moodle settings and language strings. |
| `local_middag\base\extension\abstract_extension` | The plugin's base class, on top of the Moodle base. Extend this one in a Moodle plugin. |
| `local_middag\hook\extend_extensions` | Moodle hook that registers an extension from another plugin. |
| `Middag\Core\Shared\Enum\ExtensionGroup` | Group of an extension, with sort order and label. |
| `Middag\Core\Shared\Enum\ExtensionDistribution` | Origin tier of an extension. |
| `Middag\Core\Extension\Contract\FailedExtensionRegistryInterface` | Registry of the extensions that failed during boot. |

`MiddagExtensionInterface` adds these methods to `ModuleInterface`: `getGroup()`, `getDistribution()`, `isCore()`, `isEnabledInternally()`, `getTitle()`, `getDescription()`, `getExtensionBadges()` and `getConfigPageUrl()`. `ModuleInterface` belongs to `middag-io/framework`; see [MIDDAG Framework](/framework/).

## Constants

The loader reads the metadata of an extension from the constants of its class, never from what a hook subscriber passes. On the Moodle base:

| Constant | Default | Meaning |
|---|---|---|
| `EXTENSION_IDNUMBER` | `''` | The slug. Required: the constructor throws `InvalidArgumentException` when it is empty. `core` is reserved to the plugin. |
| `GROUP` | `'integrations'` | An `ExtensionGroup` value. |
| `PRIORITY` | `100` | Order inside the group. Lower comes first. |
| `HIDDEN` | `false` | Skip the extension's `bootstrap.php`. The extension is still listed and booted. |
| `REQUIRES` | `[]` | Slugs of the extensions this one needs. |
| `DISTRIBUTION` | `'native'` | An `ExtensionDistribution` value. The tier comes from where the loader found the class: an extension added through the hook or a Composer package is `third_party` (a declared `native` or `pro` is ignored). Declare `'third_party'`. |

## Enums

| `ExtensionGroup` case | Value | Order |
|---|---|---|
| `Core` | `core` | 0 |
| `Management` | `management` | 10 |
| `Learning` | `learning` | 20 |
| `Engagement` | `engagement` | 30 |
| `Integrations` | `integrations` | 40 |
| `Reports` | `reports` | 50 |
| `Custom` | `custom` | 60 |

`ExtensionDistribution` has the cases `Native` (`native`), `Pro` (`pro`), `Custom` (`custom`) and `ThirdParty` (`third_party`). Both enums provide `label()`, `order()` and `resolve()`. `resolve()` maps an unknown value to `Integrations` and `ThirdParty` respectively.

## Register an extension from a Moodle plugin

Subscribe to the hook in your plugin's `db/hooks.php`:

```php
<?php

defined('MOODLE_INTERNAL') || die();

$callbacks = [
    [
        'hook' => \local_middag\hook\extend_extensions::class,
        'callback' => [\local_example\hook_callbacks::class, 'extend_middag_extensions'],
    ],
];
```

Register the extension by class name with `add_extension()`:

```php
<?php

declare(strict_types=1);

namespace local_example;

use local_middag\hook\extend_extensions;

final class hook_callbacks
{
    public static function extend_middag_extensions(extend_extensions $hook): void
    {
        $hook->add_extension(\local_example\extensions\reports\reports_extension::class);
    }
}
```

The extension class:

```php
<?php

declare(strict_types=1);

namespace local_example\extensions\reports;

use local_middag\base\extension\abstract_extension;

class reports_extension extends abstract_extension
{
    public const EXTENSION_IDNUMBER = 'example_reports';
    public const GROUP = 'reports';
    public const DISTRIBUTION = 'third_party';

    public function getTitle(): string
    {
        return get_string('reports_title', 'local_example');
    }
}
```

The Moodle base reads `getTitle()`, `getDescription()` and `getConfigPageTitle()` from `local_middag` language strings (`extension_<slug>_displayname`, `extension_<slug>_description`, `settings_category_<slug>`). An extension in another plugin overrides all three to use its own strings.

Rules for a subscriber:

- The hook runs only when the extension definitions are not cached. Outside a development environment that is rare. The callback must be a pure declaration: no side effects, no use of the current user, session, URL or capabilities.
- `add_extension()` skips a class that cannot be loaded or has no `EXTENSION_IDNUMBER`.
- A subscriber cannot remove, replace or rewrite an extension of the plugin.
- Each subscriber runs on its own. One that throws loses only what it would have added.

## Discovery

The plugin builds the list of extensions in this order:

1. Its own extensions, under `classes/extensions/<slug>/<slug>_extension.php`.
2. The classes added through `extend_extensions`.
3. The Composer packages of type `middag-extension`. See [Distribute an extension as a Composer package](/integrate/how-to/distribute-as-composer-package).

On a slug conflict the plugin's extension wins, then the hook entry, then the package. The duplicate is logged and ignored. Then the loader:

1. removes the slugs listed in `forced_disable_extensions`;
2. removes every extension whose `REQUIRES` are not all present, and repeats until nothing more drops out;
3. sorts by distribution tier, then group order, then `PRIORITY`, then slug;
4. caches the result. Outside a development environment, a change to a hook subscriber or to `forced_disable_extensions` takes effect only after a Moodle cache purge. Installing, updating or removing a Composer package is picked up without one.

## `forced_disable_extensions`

A site setting in `config.php` that turns extensions off by slug, including the plugin's own:

```php
$CFG->forced_disable_extensions = 'example_reports,other_slug';
```

It takes a comma-separated string or an array of slugs. Extensions that require a disabled slug are removed with it. Purge caches after a change.

## Enable and boot

- An extension boots only when it is enabled. The Moodle base reads the `local_middag` setting `extension_<slug>_enabled`, which is off by default. `isEnabledInternally()` returning `false` keeps it off.
- Extensions boot in dependency order: the slugs in `REQUIRES` boot first. An extension whose dependency is not enabled is skipped. A circular dependency is an error.
- A `bootstrap.php` next to the extension class runs for every discovered extension that is not `HIDDEN`, whether or not it is enabled. Use it only to register services, and put runtime behaviour in `boot()`. If it returns a callable, the callable receives the service container.
- `boot()` registers the extension's controllers and hook registrars. See [Routes, capabilities, shortcodes and widgets](/integrate/how-to/routes-capabilities-shortcodes-widgets) and [Signals and hooks](/integrate/reference/signals-and-hooks).

## Isolation

| Tier | When `bootstrap.php` or `boot()` throws |
|---|---|
| `native`, `pro` | Rethrown as `Middag\Core\Exception\CoreLifecycleViolationException`. The boot fails. |
| `custom`, `third_party` | Logged and recorded in `FailedExtensionRegistryInterface`. The extension is disabled for the rest of the request. |

A PHP fatal error, such as a method signature that is incompatible with the parent class, is not caught and stops the request.

## WordPress

No WordPress product hosts the extension loader yet. There is no host contract for third-party extensions on WordPress.
