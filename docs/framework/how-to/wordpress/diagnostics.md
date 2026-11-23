---
title: 'wordpress adapter — Boot Diagnostics'
---

# Check that your plugin booted with `wp <root> doctor`

**Goal:** give your plugin a WP-CLI command that proves it loaded and booted, with checks of your own, so a deploy pipeline or a health check can fail on a broken boot instead of on a page that still answers `200`.

**Prerequisites:**

- A plugin with a kernel ([Getting started](../../tutorials/wordpress/getting-started)).
- [WP-CLI](https://wp-cli.org/) on the server or in the pipeline.

The pieces, all in `Middag\WordPress\Diagnostics`:

| Class | Role |
| --- | --- |
| `DiagnosticsRegistry` | collects probes on a WordPress filter that you name |
| `PackageProbe` | describes one package: name, version, kernel class, extra checks |
| `CallbackCheck`, `Contract\DiagnosticCheckInterface` | a check of your own, with a `CheckScope` of `Boot` or `Render` |
| `CheckResult`, `Enum\CheckStatus` | a check's outcome: `Pass`, `Warn` or `Fail` |
| `DoctorCommand`, `DoctorCommandRegistrar` | the WP-CLI command and its registration |
| `BootReport`, `PackageReport` | the report the command prints |

## 1. Declare the probe in the main plugin file

Declare the probe and the command in the main plugin file, **before** the kernel boots. If the boot then fails, the report shows a failed check instead of a missing package:

```php
use Acme\Notes\AcmeNotesKernel;
use Middag\WordPress\Diagnostics\CallbackCheck;
use Middag\WordPress\Diagnostics\DiagnosticsRegistry;
use Middag\WordPress\Diagnostics\DoctorCommand;
use Middag\WordPress\Diagnostics\DoctorCommandRegistrar;
use Middag\WordPress\Diagnostics\Enum\CheckScope;
use Middag\WordPress\Diagnostics\PackageProbe;

defined('ABSPATH') || exit;

$autoloader = __DIR__ . '/vendor/autoload.php';
require_once $autoloader;

define('ACME_NOTES_VERSION', '0.1.0');
define('ACME_NOTES_FILE', __FILE__);
define('ACME_NOTES_DIR', plugin_dir_path(__FILE__));

// Diagnostics first: they must exist even when the kernel fails to boot.
$diagnostics = new DiagnosticsRegistry('acme_diagnostics');
$diagnostics->register(new PackageProbe(
    name: 'acme-notes',
    version: ACME_NOTES_VERSION,
    kernelClass: AcmeNotesKernel::class,
    checks: [
        new CallbackCheck('notes table', CheckScope::Boot, static function (): bool|string {
            global $wpdb;
            $table = $wpdb->prefix . 'acme_notes';

            return $wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $table)) === $table
                ? true
                : $table . ' is missing';
        }),
    ],
    autoloaderPath: $autoloader,
));
(new DoctorCommandRegistrar(new DoctorCommand($diagnostics, ['acme-notes']), 'acme'))->register();

add_action('plugins_loaded', [AcmeNotesKernel::class, 'init']);
```

- **The filter name** (`acme_diagnostics`) is where probes meet. Every plugin of your product that uses the same filter name appears in one report, although each boots its own kernel. Do not keep the neutral default `middaglib_diagnostics`.
- **The command root** (`acme`) gives the command `wp acme doctor`. It must be lowercase letters, digits and dashes.
- **`register()`** does nothing outside WP-CLI, so this code is safe on web requests.
- **A `CallbackCheck`** passes when the closure returns `true`, fails with the returned string as the message, or returns a `CheckResult` for a warning.

For each package, the report checks the kernel class, the autoloader, the boot and the version, then runs your checks. The full list is in [Boot diagnostics](../../reference/adapters/wordpress/#boot-diagnostics).

## 2. Run the command

```bash
wp acme doctor
```

```text
acme-notes 0.1.0: PASS
  [pass] autoload (boot): Acme\Notes\AcmeNotesKernel resolved from /var/www/html/wp-content/plugins/acme-notes/src/AcmeNotesKernel.php via autoloader /var/www/html/wp-content/plugins/acme-notes/vendor/autoload.php
  [pass] kernel (boot): Acme\Notes\AcmeNotesKernel booted
  [pass] version (boot): 0.1.0
  [pass] notes table (boot): ok
Scope: boot only. No render check is registered, so a green report does not prove that pages render.
Status: PASS (1 package(s))
```

| Option | Effect |
| --- | --- |
| `--expect=a,b` | also fail when one of these packages never registered |
| `--strict` | fail on warnings too |
| `--format=json` | print one JSON document (`status`, `covers`, `issues`, `packages`) |

The command exits `0` when the report passes, `1` when it fails, and `2` on an invalid `--format`.

## 3. Gate a pipeline on it

Pass the full list of packages the site must run with `--expect`. The list given to `DoctorCommand` in the plugin applies only when that plugin loaded, so it cannot report the plugin's own absence:

```bash
wp acme doctor --expect=acme-notes,acme-shop --strict
```

When `acme-shop` is not active, the report fails. After the lines of `acme-notes`, the output ends with:

```text
Issues:
  [fail] expected package "acme-shop" is not registered (did it load?)
Scope: boot only. No render check is registered, so a green report does not prove that pages render.
Status: FAIL (1 package(s))
```

## 4. Add a render check

The built-in checks prove boot, not that your pages render. A check with `CheckScope::Render` covers what boot cannot see, for example that the frontend build is deployed:

```php
<?php

declare(strict_types=1);

namespace Acme\Notes\Diagnostics;

use Middag\WordPress\Diagnostics\CheckResult;
use Middag\WordPress\Diagnostics\Contract\DiagnosticCheckInterface;
use Middag\WordPress\Diagnostics\Enum\CheckScope;

final class AdminShellCheck implements DiagnosticCheckInterface
{
    public function name(): string
    {
        return 'admin shell';
    }

    public function scope(): CheckScope
    {
        return CheckScope::Render;
    }

    public function run(): CheckResult
    {
        $bundle = ACME_NOTES_DIR . 'assets/build/app.js';
        if (!is_readable($bundle)) {
            return CheckResult::fail($this->name(), 'assets/build/app.js is missing; run the frontend build', $this->scope());
        }

        return CheckResult::pass($this->name(), 'app bundle present', $this->scope());
    }
}
```

Add `new AdminShellCheck()` to the probe's `checks`. Once a render check runs, the report says `Scope: boot and the registered render checks.` and the JSON `covers` lists `boot` and `render`.

## What can go wrong

- **`Error: 'acme' is not a registered wp command.`** The registration did not run, usually because it sits in code that runs only after a successful boot. Keep it in the main plugin file.
- **`no package registered for diagnostics`.** No probe reached the filter. Check that the command and the probes use the same filter name.
- **`[fail] kernel (boot): ... is not booted`.** The kernel's `init()` never ran. Check the `plugins_loaded` action in the main plugin file. A boot that throws stops the WP-CLI run with that exception instead.
- **`[warn] autoload (boot): no entry class declared; autoloader not verified`.** The probe has neither a kernel class nor an entry class. Pass one of them.
- **`package "acme-notes" registered 2 times`.** Two copies of the plugin, or the probe declared twice, register the same name.
- **A green report and a blank admin page.** Without a render check, the report covers boot only. Add one.

## Reference

- [Boot diagnostics](../../reference/adapters/wordpress/#boot-diagnostics): the registry, the probe, the report and the WP-CLI command.
- [Neutral defaults](../../reference/adapters/wordpress/configuration#neutral-defaults): the default filter name and command root.
