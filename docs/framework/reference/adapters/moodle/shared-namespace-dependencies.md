---
title: 'Moodle Adapter — Shared-Namespace Dependencies'
---

# Shared-Namespace Dependencies

Reference for the Composer dependencies of `middag-io/moodle` whose PHP namespaces Moodle core also bundles, the "shadow risk" this creates, and the checks to run before changing them.

Verified on 2026-11-16 against:

- `middag-php-moodle` `main@89cef44` (`composer.json`, `src/`, `tests/`, `bin/`), and `middag-php-framework` `main@5af00e8` (`composer.json`) for the packages the adapter gets through the framework.
- The Moodle stable branches of the supported range, in the upstream repository [`moodle/moodle`](https://github.com/moodle/moodle): `MOODLE_405_STABLE@69ef83ad2948` (4.5), `MOODLE_501_STABLE@939b25ee6be4` (5.1), `MOODLE_502_STABLE@5ce15767f3ab` (5.2) and `MOODLE_503_STABLE@cfe123f26fc7` (5.3), plus `MOODLE_500_STABLE@2d62d8b15891` (5.0, best effort). In each branch: the `$psr4namespaces` map of `core_component` (`lib/classes/component.php` on 4.5 and 5.0, `public/lib/classes/component.php` from 5.1), the bundled versions in `thirdpartylibs.xml` (`lib/` on 4.5 and 5.0, `public/lib/` from 5.1), and the root `composer.json` and `composer.lock`.

## The risk

Moodle core vendors a fixed set of third-party libraries under `lib/<name>/` (`public/lib/<name>/` from Moodle 5.1) and registers their namespaces **globally**, for every request, in `core_component::$psr4namespaces`. Moodle's class loader resolves them independently of any plugin's `vendor/autoload.php`.

From Moodle 5.2, Moodle can also load Composer packages of its own. Its root `composer.json` requires the same libraries it vendors, pinned to the vendored versions, plus a few more. `core_component::register_autoloader()` requires `{$CFG->root}/vendor/autoload.php` when that file exists. Moodle 4.5, 5.0 and 5.1 declare no runtime package in their root `composer.json` (only `require-dev`) and do not load a root `vendor/autoload.php` from `core_component`.

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
| `Psr\Http\Message`                                    | `lib/psr/http-factory/src`, `lib/psr/http-message/src`                   | 1.1.0, 2.0.0 | same | same | same | same |
| `Psr\Http\Client`                                     | `lib/psr/http-client/src`                                                | 1.0.3  | 1.0.3  | 1.0.3  | 1.0.3  | 1.0.3  |
| `Psr\Http\Server`                                     | `lib/psr/http-server-handler/src`, `lib/psr/http-server-middleware/src`  | 1.0.2  | 1.0.2  | 1.0.2  | 1.0.2  | 1.0.2  |
| `Monolog`                                             | `lib/monolog/src/Monolog`                                                | —      | —      | —      | 3.9.0  | 3.9.0  |
| `GuzzleHttp`, `GuzzleHttp\Psr7`, `GuzzleHttp\Promise` | `lib/guzzlehttp/*`                                                       | 7.8.1  | 7.9.2  | 7.9.2  | 7.10.0 | 7.10.0 |
| `PHPMailer\PHPMailer`                                 | `lib/phpmailer/src`                                                      | 6.9.1  | 6.9.3  | 6.9.3  | 6.9.3  | 6.9.3  |

The Guzzle column gives the `guzzlehttp/guzzle` version. The list is not exhaustive; it covers the namespaces relevant to this adapter's dependency tree. No `Symfony\*` namespace is in the `core_component` map of any branch above.

### Composer packages declared by Moodle 5.2 and 5.3

The root `composer.lock` of 5.2 and 5.3 locks the libraries above at the same versions (`firebase/php-jwt` v6.11.1, `monolog/monolog` 3.9.0, `psr/*` as in the table). It also locks Symfony packages that this adapter's dependency tree contains:

| Package                         | 5.2     | 5.3     | In this adapter's tree through                                   |
| ------------------------------- | ------- | ------- | ---------------------------------------------------------------- |
| `symfony/deprecation-contracts` | v3.6.0  | v3.6.0  | `middag-io/framework` (direct) and every Symfony component       |
| `symfony/service-contracts`     | —       | v3.7.3  | `symfony/dependency-injection`, `symfony/http-client`            |
| `symfony/polyfill-mbstring`     | v1.33.0 | v1.38.2 | `symfony/http-foundation`                                        |

These packages are not in the `core_component` map. They are on the request only when the site has a root `vendor/` installed by Composer, through the `vendor/autoload.php` that `register_autoloader()` requires.

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
