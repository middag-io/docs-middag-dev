---
title: 'Moodle Adapter — Shared-Namespace Dependencies'
---

# Shared-Namespace Dependencies

Reference for the Composer dependencies of `middag-io/moodle` whose PHP namespaces Moodle core also bundles, the "shadow risk" this creates, and the checks to run before changing them.

Verified on 2026-11-16 against:

- `middag-php-moodle` `main@89cef44` (`composer.json`, `src/`, `tests/`, `bin/`), and `middag-php-framework` `main@5af00e8` (`composer.json`) for the packages the adapter gets through the framework.
- The Moodle stable branches of the supported range, in the upstream repository [`moodle/moodle`](https://github.com/moodle/moodle): `MOODLE_405_STABLE@69ef83ad2948` (4.5), `MOODLE_501_STABLE@939b25ee6be4` (5.1), `MOODLE_502_STABLE@5ce15767f3ab` (5.2) and `MOODLE_503_STABLE@cfe123f26fc7` (5.3), plus `MOODLE_500_STABLE@2d62d8b15891` (5.0, best effort). In each branch: the `$psr4namespaces` map of `core_component` (`lib/classes/component.php` on 4.5 and 5.0, `public/lib/classes/component.php` from 5.1), the bundled versions in `thirdpartylibs.xml` (`lib/` on 4.5 and 5.0, `public/lib/` from 5.1), and the root `composer.json` and `composer.lock`.

## The risk

Moodle core vendors a fixed set of third-party libraries under `lib/<name>/` (`public/lib/<name>/` from Moodle 5.1) and registers their namespaces **globally**, for every request, in `core_component::$psr4namespaces`. Moodle's class loader resolves them independently of any plugin's `vendor/autoload.php`. It also requires a short list of function files on every request (`core_component::$composerautoloadfiles`), the way Composer's `autoload.files` does.

From Moodle 5.2, Moodle can also load Composer packages of its own. Its root `composer.json` requires the libraries of the table below at the versions it vendors; 5.3 also requires `symfony/console` and `league/oauth2-server`, which it does not vendor. Moodle 4.5, 5.0 and 5.1 declare no runtime package in their root `composer.json` (only `require-dev`) and do not load a root `vendor/autoload.php` from `core_component`.

`core_component::register_autoloader()` loads the root `vendor/autoload.php` in both 5.2 and 5.3, at a different point of the sequence. `lib/setup.php` sets `$CFG->root` to the directory above `public/`.

- **Moodle 5.2:**
  1. Registers Moodle's class loader.
  2. When `$CFG->root` is set and `{$CFG->root}/vendor/autoload.php` exists, requires that file.
  3. Requires the function files of `$composerautoloadfiles`.
- **Moodle 5.3:**
  1. When `dirname(__DIR__, 3) . '/vendor/autoload.php'` exists (the directory above `public/`), requires that file. Moodle's class loader is not registered yet, and this step does not depend on `$CFG->root`.
  2. Registers Moodle's class loader.
  3. When `$CFG->root` is set and `{$CFG->root}/vendor/autoload.php` exists, requires that file; `require_once` skips it when step 1 already loaded the same file.
  4. Requires the function files of `$composerautoloadfiles`.

In 5.3, the `autoload.files` of the root `vendor/` (such as `symfony/deprecation-contracts` `function.php` and the polyfill bootstraps) therefore run before Moodle's class loader exists. In both versions they run before `$composerautoloadfiles`. For class lookups, the order of the `require` calls does not decide the winner: Composer registers its class loader with `prepend` (Composer's default `prepend-autoloader: true`, which Moodle's root `composer.json` does not change), so the root `vendor/` loader sits ahead of Moodle's class loader in both versions.

When this adapter, or a package in its dependency tree, lands in one of those namespaces, PHP loads whichever registration wins. Which one wins depends on bootstrap order (does the consumer plugin require its `vendor/autoload.php` before or after Moodle registers its own loaders?), and that varies by hosting layout: a bundled plugin, a Composer-managed site, or a project-root vendor in a container. A single package's `composer.json` cannot pin it. It is not guaranteed to be this adapter's own `vendor/` copy. The same holds for `Middag\*` classes themselves: a consumer's autoloader cannot unload a class that another autoloader already resolved earlier in the request.

## Namespaces Moodle bundles

The paths are relative to the Moodle root; from 5.1 every path starts with `public/` (for example `public/lib/php-jwt/src`). Versions come from `thirdpartylibs.xml`.

| Namespace                                             | Moodle-bundled path                                                      | 4.5    | 5.0    | 5.1    | 5.2    | 5.3    |
| ----------------------------------------------------- | ------------------------------------------------------------------------ | ------ | ------ | ------ | ------ | ------ |
| `Firebase\JWT`                                        | `lib/php-jwt/src`                                                        | 6.10.0 | 6.11.0 | 6.11.0 | 6.11.1 | 6.11.1 |
| `Psr\Log`                                             | `lib/psr/log/src`                                                        | 3.0.2  | 3.0.2  | 3.0.2  | 3.0.2  | 3.0.2  |
| `Psr\Container`                                       | `lib/psr/container/src`                                                  | 2.0.2  | 2.0.2  | 2.0.2  | 2.0.2  | 2.0.2  |
| `Psr\SimpleCache`                                     | `lib/psr/simple-cache/src`                                               | 3.0.0  | 3.0.0  | 3.0.0  | 3.0.0  | 3.0.0  |
| `Psr\Cache`                                           | `lib/psr/cache/src`                                                      | —      | —      | —      | 3.0.0  | 3.0.0  |
| `Psr\Clock`                                           | `lib/psr/clock/src`                                                      | 1.0.0  | 1.0.0  | 1.0.0  | 1.0.0  | 1.0.0  |
| `Psr\EventDispatcher`                                 | `lib/psr/event-dispatcher/src`                                           | 1.0.0  | 1.0.0  | 1.0.0  | 1.0.0  | 1.0.0  |
| `Psr\Http\Message`                                    | `lib/psr/http-factory/src`, `lib/psr/http-message/src`                   | 1.1.0, 2.0.0 | 1.1.0, 2.0.0 | 1.1.0, 2.0.0 | 1.1.0, 2.0.0 | 1.1.0, 2.0.0 |
| `Psr\Http\Client`                                     | `lib/psr/http-client/src`                                                | 1.0.3  | 1.0.3  | 1.0.3  | 1.0.3  | 1.0.3  |
| `Psr\Http\Server`                                     | `lib/psr/http-server-handler/src`, `lib/psr/http-server-middleware/src`  | 1.0.2  | 1.0.2  | 1.0.2  | 1.0.2  | 1.0.2  |
| `Monolog`                                             | `lib/monolog/src/Monolog`                                                | —      | —      | —      | 3.9.0  | 3.9.0  |
| `GuzzleHttp`, `GuzzleHttp\Psr7`, `GuzzleHttp\Promise` | `lib/guzzlehttp/*`                                                       | 7.8.1  | 7.9.2  | 7.9.2  | 7.10.0 | 7.10.0 |
| `PHPMailer\PHPMailer`                                 | `lib/phpmailer/src`                                                      | 6.9.1  | 6.9.3  | 6.9.3  | 6.9.3  | 6.9.3  |

The `Psr\Http\Message` cells give `psr/http-factory`, then `psr/http-message`. The Guzzle column gives the `guzzlehttp/guzzle` version. The list is not exhaustive; it covers the namespaces relevant to this adapter's dependency tree. No `Symfony\*` namespace is in the `core_component` map of any branch above.

### Global function: `trigger_deprecation()`

Every Moodle version in range also vendors `symfony/deprecation-contracts` (`lib/symfony/deprecation-contracts`; 3.5.0 on 4.5, 3.5.1 on 5.0 and 5.1, 3.6.0 on 5.2 and 5.3) and requires its `function.php` on every request through `$composerautoloadfiles`. The file defines the global function `trigger_deprecation()` only when no copy defines it yet (`function_exists()` guard). This adapter's tree always contains the same package: `middag-io/framework` requires it directly (`^3.5`), and `symfony/dependency-injection` and `symfony/routing`, which the adapter requires at `^7.4 || ^8.1`, require it in every 7.x and 8.x release. The other Symfony packages of the tree differ by release line:

- Require it on the 7.4 line, not on 8.0: `symfony/cache`, `symfony/http-kernel`, `symfony/messenger`, `symfony/property-info`, `symfony/serializer`, `symfony/string`, `symfony/type-info`, `symfony/validator`, `symfony/var-dumper` and `symfony/var-exporter`. The adapter requires `symfony/http-client` and `symfony/http-foundation` at `^7.4 || ^8.1`; both require it on the 7.4 line.
- Never require it on 7.x or 8.x: `symfony/clock`, `symfony/error-handler`, `symfony/property-access`, `symfony/psr-http-message-bridge` and `symfony/uid`. `symfony/event-dispatcher` requires it only from 8.1.
- Among the contracts packages, only `symfony/service-contracts` requires it, from 3.5.

The first copy loaded defines the function for the whole request. Both copies are on the 3.x line.

### Composer packages declared by Moodle 5.2 and 5.3

The root `composer.lock` of 5.2 and 5.3 shares the packages below with this adapter's dependency tree. The tree is the closure of the `require` sections of `middag-php-moodle` `main@89cef44` and `middag-php-framework` `main@5af00e8`, resolved transitively from Packagist over every stable release inside the accepted ranges and installable on PHP 8.2 to 8.5. A version marked _dev_ is locked in `packages-dev`: it reaches the root `vendor/` only when Composer installs development packages (the default of `composer install`, skipped with `--no-dev`).

| Package                            | 5.2            | 5.3            | In this adapter's tree through                                                                     |
| ---------------------------------- | -------------- | -------------- | -------------------------------------------------------------------------------------------------- |
| `monolog/monolog`                  | 3.9.0          | 3.9.0          | `middag-io/framework` (direct)                                                                     |
| `psr/cache`                        | 3.0.0          | 3.0.0          | `symfony/cache`, `symfony/cache-contracts`                                                         |
| `psr/clock`                        | 1.0.0          | 1.0.0          | `middag-io/framework` (direct), `symfony/clock`                                                    |
| `psr/container`                    | 2.0.2          | 2.0.2          | direct; `symfony/dependency-injection`, `symfony/service-contracts`, `symfony/type-info`           |
| `psr/event-dispatcher`             | 1.0.0          | 1.0.0          | `symfony/event-dispatcher-contracts`                                                               |
| `psr/http-client`                  | 1.0.3          | 1.0.3          | `middag-io/framework` (direct)                                                                     |
| `psr/http-factory`                 | 1.1.0          | 1.1.0          | `middag-io/framework` (direct), `nyholm/psr7`                                                      |
| `psr/http-message`                 | 2.0            | 2.0            | `middag-io/framework` (direct), `nyholm/psr7`, `symfony/psr-http-message-bridge`, the `psr/http-*` |
| `psr/http-server-handler`          | 1.0.2          | 1.0.2          | `middag-io/framework` (direct), `psr/http-server-middleware`                                       |
| `psr/http-server-middleware`       | 1.0.2          | 1.0.2          | `middag-io/framework` (direct)                                                                     |
| `psr/log`                          | 3.0.2          | 3.0.2          | direct; `monolog/monolog` and several Symfony components                                           |
| `psr/simple-cache`                 | 3.0.0          | 3.0.0          | direct                                                                                             |
| `paragonie/random_compat`          | —              | v9.99.100      | `symfony/polyfill-uuid` v1.15.0 to v1.19.0 only                                                    |
| `symfony/deprecation-contracts`    | v3.6.0         | v3.6.0         | `middag-io/framework` (direct) and some Symfony components ([below](#global-function-trigger-deprecation)) |
| `symfony/service-contracts`        | v3.6.1 _dev_   | v3.7.3         | `symfony/cache`, `symfony/dependency-injection`, `symfony/http-client`                             |
| `symfony/string`                   | v7.4.4 _dev_   | v7.4.15        | `symfony/property-info` (required by `middag-io/framework`)                                        |
| `symfony/polyfill-ctype`           | v1.33.0        | v1.37.0        | `symfony/http-kernel`, `symfony/serializer`, `symfony/string`, `symfony/validator`                 |
| `symfony/polyfill-intl-grapheme`   | v1.33.0 _dev_  | v1.41.0        | `symfony/string`                                                                                   |
| `symfony/polyfill-intl-normalizer` | v1.33.0 _dev_  | v1.42.0        | `symfony/string`                                                                                   |
| `symfony/polyfill-mbstring`        | v1.33.0        | v1.38.2        | `symfony/http-foundation`, `symfony/string`, `symfony/validator`, `symfony/var-dumper`             |
| `symfony/dependency-injection`     | v7.4.5 _dev_   | v7.4.17 _dev_  | direct                                                                                             |
| `symfony/http-client`              | v7.4.5 _dev_   | v7.4.18 _dev_  | direct                                                                                             |
| `symfony/event-dispatcher`         | v7.4.4 _dev_   | v7.4.17 _dev_  | `symfony/http-kernel`                                                                              |
| `symfony/event-dispatcher-contracts` | v3.6.0 _dev_ | v3.7.1 _dev_   | direct; `symfony/event-dispatcher`                                                                 |
| `symfony/http-client-contracts`    | v3.6.0 _dev_   | v3.7.3 _dev_   | `symfony/http-client`                                                                              |
| `symfony/translation-contracts`    | v3.6.1 _dev_   | v3.7.1 _dev_   | `middag-io/framework` (direct), `symfony/validator`                                                |
| `symfony/var-exporter`             | v7.4.0 _dev_   | v7.4.18 _dev_  | `symfony/cache`, `symfony/dependency-injection`                                                    |
| `symfony/polyfill-php83`           | v1.33.0 _dev_  | v1.41.0 _dev_  | `symfony/clock`, `symfony/http-client`, `symfony/http-foundation`, `symfony/validator`             |

"direct" means a requirement of `middag-io/moodle` itself. No other package of either `composer.lock` is in the tree.

`monolog/monolog`, the `psr/*` packages and `symfony/deprecation-contracts` are also vendored under `public/lib/` at the same versions ([above](#namespaces-moodle-bundles)). The other packages are neither vendored nor in the `core_component` map: they reach the request only through a root `vendor/` installed by Composer, which `register_autoloader()` loads when its `autoload.php` exists ([order above](#the-risk)).

`symfony/string` is a component, not a contract or a polyfill. `middag-io/framework` accepts `symfony/property-info` `^7.0 || ^8.0`, and every release of both majors requires `symfony/string`: 7.0 to 7.3 accept `^6.4|^7.0`, 7.4 accepts `^6.4|^7.0|^8.0`, and 8.x accepts `^7.4|^8.0`. `symfony/string` 8.x requires PHP 8.4. The adapter's tree can therefore hold `symfony/string` 6.4, 7.x or 8.x, while a Moodle 5.3 root `vendor/` holds v7.4.15 (5.2 with development packages: v7.4.4). Both copies then define classes in `Symfony\Component\String`, and which one loads depends on bootstrap order. Treat a Moodle site with a root `vendor/` that holds `symfony/string` as a possible major-mismatch case for this namespace. The same applies to `symfony/event-dispatcher` and `symfony/var-exporter`, which the tree can resolve outside the 7.4 line that Moodle locks in `packages-dev`.

`paragonie/random_compat` polyfills `random_bytes()` and `random_int()`, which are native in every PHP version the adapter supports. It enters the tree only when `symfony/polyfill-uuid` resolves to one of the oldest releases that `symfony/uid` accepts.

The polyfills declare classes in `Symfony\Polyfill\*` and define global functions (`ctype_*`, `mb_*`, `grapheme_*`, `json_validate()`) behind `function_exists()` guards, which also skip the definitions when the PHP extension or PHP version already provides them. As with `trigger_deprecation()`, the first copy loaded defines each function for the whole request; all copies are on the 1.x line.

## This adapter's shared-namespace packages

| Package                                                                                                                         | How the adapter gets it                                                    | Shared namespace          |
| ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------- |
| `psr/container ^2.0`                                                                                                            | Direct requirement                                                         | `Psr\Container`           |
| `psr/log ^3.0`                                                                                                                  | Direct requirement                                                         | `Psr\Log`                 |
| `psr/simple-cache ^3.0`                                                                                                         | Direct requirement                                                         | `Psr\SimpleCache`         |
| `psr/event-dispatcher`                                                                                                          | Through `symfony/event-dispatcher-contracts`                               | `Psr\EventDispatcher`     |
| `psr/clock`, `psr/http-message`, `psr/http-factory`, `psr/http-client`, `psr/http-server-handler`, `psr/http-server-middleware` | Through `middag-io/framework` (and `nyholm/psr7`, `symfony/http-client`)  | `Psr\Clock`, `Psr\Http\*` |
| `psr/cache`                                                                                                                     | Through `middag-io/framework` (`symfony/cache`)                            | `Psr\Cache` (5.2 and 5.3) |
| `monolog/monolog ^3.0`                                                                                                          | Through `middag-io/framework`                                              | `Monolog` (5.2 and 5.3)   |

`nyholm/psr7` and `symfony/http-client` themselves do not collide: Moodle bundles Guzzle's PSR-7 implementation (`GuzzleHttp\Psr7`), a different vendor namespace from `Nyholm\Psr7`. The shared PSR namespaces hold interfaces only, and Moodle bundles the same majors the adapter's tree requires. `Monolog` is a full implementation: Moodle 5.2 and 5.3 bundle 3.9.0, inside the `^3.0` range the framework requires, so the two copies share a major but may differ in minor or patch.

## `Firebase\JWT`

The adapter does not require `firebase/php-jwt`: the requirement was dropped in `middag-php-moodle` commit `eb30618`, and nothing in `src/`, `tests/` or `bin/` on `main@89cef44` references `Firebase\JWT`.

The namespace stays in the table because every Moodle version in range bundles it, at 6.x (6.10.0 on 4.5; 6.11.0 or 6.11.1 from 5.0). `firebase/php-jwt` 7.0 changed the `JWT` / `Key` API. Any package installed next to the adapter that requires `firebase/php-jwt ^7.0` shares the namespace with a 6.x copy that Moodle registers globally; which copy loads is a matter of bootstrap order.

## Rules

- The adapter declares its dependencies normally: no namespace rewriting (scoping), no delegating to Moodle's bundled copy.
- Before raising a shared-namespace package to a new major, or raising the adapter's minimum Moodle version, check the new major against what the target Moodle versions bundle for that namespace, in `core_component` and, from Moodle 5.2, in the root `composer.lock`.
- An unused shared-namespace dependency is removed rather than kept "just in case": it is a standing collision risk with no benefit.
- The autoloader race itself is a property of how the consumer bootstraps. The adapter documents the risk surface; it cannot resolve the race from its own code.

## Enforcement state

| Clause                                                                     | State                                                                                       |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| This page matches `composer.json` and Moodle's `core_component` map        | **planned** — no CI check diffs the adapter's namespaces against a Moodle checkout          |
| Major bumps of shared-namespace packages are checked against Moodle's copy | **planned** — review                                                                        |
| `firebase/php-jwt` removed while unused                                    | **coded** — dropped from `composer.json` in `eb30618`                                       |

---

Decision record: MDL-020 in [`middag-php-moodle/docs/decisions`](https://github.com/middag-io/middag-php-moodle/tree/main/docs/decisions).
