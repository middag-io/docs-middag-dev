---
title: 'Moodle Adapter — Shared-Namespace Dependencies'
---

# Shared-Namespace Dependencies

Reference for the Composer dependencies of `middag-io/moodle` whose PHP namespaces Moodle core also bundles globally, the "shadow risk" this creates, and the checks to run before changing them. Verified on 2026-11-04 against `middag-php-moodle` `main@6aae04d` (`composer.json`, `src/`) and a Moodle 5.0.9 checkout (Build 20260810, `lib/classes/component.php`).

## The risk

Moodle core does not load its own `lib/` third-party code through Composer. It vendors a fixed set of libraries under `lib/<name>/` and registers their namespaces **globally**, for every request, in `core_component::$psr4namespaces`. Moodle's autoloader resolves them independently of, and usually before, any plugin's `vendor/autoload.php`.

When this adapter requires a package that lands in one of those namespaces, PHP loads whichever registration wins the race. Which one wins depends on bootstrap order (does the consumer plugin require its `vendor/autoload.php` before or after Moodle's `lib/setup.php` registers the core map?), and that varies by hosting layout: a bundled plugin, a Composer-managed site, or a project-root vendor in a container. A single package's `composer.json` cannot pin it. It is not guaranteed to be this adapter's own `vendor/` copy. The same holds for `Middag\*` classes themselves: a consumer's autoloader cannot unload a class that another autoloader already resolved earlier in the request.

## Namespaces Moodle bundles (5.0.9)

| Namespace                                             | Moodle-bundled path                                    | Bundled version          |
| ----------------------------------------------------- | ------------------------------------------------------ | ------------------------ |
| `Firebase\JWT`                                        | `lib/php-jwt/src`                                      | 6.11.0                   |
| `Psr\Log`                                             | `lib/psr/log/src`                                      | PSR interfaces only      |
| `Psr\Container`                                       | `lib/psr/container/src`                                | PSR interfaces only      |
| `Psr\SimpleCache`                                     | `lib/psr/simple-cache/src`                             | PSR interfaces only      |
| `Psr\Clock`                                           | `lib/psr/clock/src`                                    | PSR interfaces only      |
| `Psr\EventDispatcher`                                 | `lib/psr/event-dispatcher/src`                         | PSR interfaces only      |
| `Psr\Http\Message`                                    | `lib/psr/http-factory/src`, `lib/psr/http-message/src` | PSR interfaces only      |
| `Psr\Http\Client`                                     | `lib/psr/http-client/src`                              | PSR interfaces only      |
| `Psr\Http\Server`                                     | `lib/psr/http-server-handler/src`, `lib/psr/http-server-middleware/src` | PSR interfaces only |
| `GuzzleHttp`, `GuzzleHttp\Psr7`, `GuzzleHttp\Promise` | `lib/guzzlehttp/*`                                     | Bundled Guzzle stack     |
| `PHPMailer\PHPMailer`                                 | `lib/phpmailer/src`                                    | Bundled PHPMailer        |

The list is not exhaustive; it covers the namespaces relevant to this adapter's dependency tree.

## This adapter's shared-namespace packages

| Package                                                     | How the adapter gets it                                                                   | Shared namespace      |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------- |
| `firebase/php-jwt ^7.0`                                     | Direct requirement                                                                        | `Firebase\JWT`        |
| `psr/container ^2.0`                                        | Direct requirement                                                                        | `Psr\Container`       |
| `psr/log ^3.0`                                              | Direct requirement                                                                        | `Psr\Log`             |
| `psr/simple-cache ^3.0`                                     | Direct requirement                                                                        | `Psr\SimpleCache`     |
| `psr/event-dispatcher`                                      | Through `symfony/event-dispatcher-contracts`                                              | `Psr\EventDispatcher` |
| `psr/clock`, `psr/http-message`, `psr/http-factory`, `psr/http-client`, `psr/http-server-handler`, `psr/http-server-middleware` | Through `middag-io/framework` (and `nyholm/psr7`, `symfony/http-client`) | `Psr\Clock`, `Psr\Http\*` |

`nyholm/psr7` and `symfony/http-client` themselves do not collide: Moodle bundles Guzzle's PSR-7 implementation (`GuzzleHttp\Psr7`), a different vendor namespace from `Nyholm\Psr7`. Only the shared PSR **interface** namespaces overlap.

## The known case: `firebase/php-jwt`

Moodle 5.0.9 bundles `Firebase\JWT` 6.11.0; this adapter requires `^7.0`, and v6 to v7 changed the `JWT` / `Key` API. Nothing in `src/` uses `Firebase\JWT\*`, so the dependency is declared but dead, and the collision is dormant rather than triggered. The moment any layer calls `use Firebase\JWT\JWT;`, which copy loads is a matter of bootstrap order.

## Rules

- The adapter declares its dependencies normally: no namespace rewriting (scoping), no delegating to Moodle's bundled copy.
- Before raising a shared-namespace package to a new major, or raising the adapter's minimum Moodle version, check the new major against what the target Moodle versions bundle for that namespace.
- An unused shared-namespace dependency is removed rather than kept "just in case": it is a standing collision risk with no benefit. `firebase/php-jwt` is the pending case; the removal is its own `composer.json` change.
- The autoloader race itself is a property of how the consumer bootstraps. The adapter documents the risk surface; it cannot resolve the race from its own code.

## Enforcement state

| Clause                                                                        | State                                                                                      |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| This table matches `composer.json` and Moodle's `core_component` map          | **planned** — no CI check diffs the adapter's namespaces against a Moodle checkout          |
| Major bumps of shared-namespace packages are checked against Moodle's copy    | **planned** — review                                                                       |
| `firebase/php-jwt` removed while unused                                       | **planned** — still required on `main@6aae04d`                                             |

---

Decision record: MDL-020 in [`middag-php-moodle/docs/decisions`](https://github.com/middag-io/middag-php-moodle/tree/main/docs/decisions).
