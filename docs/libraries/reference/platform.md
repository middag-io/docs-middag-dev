---
title: 'Platform'
---

# Platform

Status: proposed. The platform every library of the MIDDAG PHP family declares, when its PHP floor rises, and how CI proves it. This page states every platform rule a consumer of the libraries relies on. The PHP platform floor reference of the MIDDAG profile (`docs-middag-ops`) is the internal source behind it; a reader does not need it. Related: [Versioning and compatibility](./versioning-and-compatibility), [Guards](./guards).

## Declared platform

Every library declares the same values. The Symfony row applies only to a library that depends on a Symfony component; `ui` depends on none.

| Item                             | Value                                              | Where                                          |
| -------------------------------- | -------------------------------------------------- | ---------------------------------------------- |
| PHP requirement                  | `^8.3`                                             | `composer.json` `require.php`                  |
| Platform pin                     | `8.3.0`                                            | `composer.json` `config.platform.php`          |
| Symfony packages                 | `^7.4 \|\| ^8.1`                                   | every Symfony component (`symfony/*` on the 7.x/8.x release line) in `require` and `require-dev`, in a library that has one |
| Sibling libraries                | the family MAJOR (`^2.0` on `2.x`)                 | `require` / `require-dev`                      |
| Rector target                    | `LevelSetList::UP_TO_PHP_83`                       | `rector.php`                                   |
| PHPStan PHP version              | `80300`                                            | `phpVersion` in the PHPStan config             |
| CI PHP versions                  | 8.3, 8.4 and 8.5                                   | the library CI workflow                        |

Rules:

- The pin equals the floor (`<floor>.0`). Composer resolves the lowest PHP of the range locally and in the pinned CI jobs, so a dependency that needs a newer PHP fails at install time, not in production.
- No Symfony component is held to one major line. A constraint such as `^7.0` alone, or `^8.0` alone, is a platform defect.
- The Symfony contracts (`symfony/*-contracts`) and polyfills (`symfony/polyfill-*`) are versioned on their own line, not on the 7.x/8.x line of the components. They keep their own ranges (for example `symfony/event-dispatcher-contracts` `^3.0`) and are outside the `^7.4 || ^8.1` rule.
- The Rector and PHPStan targets equal the floor. A target above the floor would rewrite code into syntax the floor cannot parse.

## Raising the floor

- The floor is never lower than the lowest PHP version with official support (active or security) on php.net, the PHP minimum of the Symfony range or the PHP minimum of any dependency. On `2.x` it is PHP 8.3.
- The floor rises only when the floor PHP version loses security support on php.net, and never by more than one minor at a time.
- A newly required PHP extension counts as a floor change, because the host must install it.
- The floor rises only in a family MAJOR, in every library at once; no library goes alone. The PHP requirement, the platform pin, the Rector and PHPStan targets and the CI PHP versions change together in that release.

## CI

Each library's CI runs these jobs on every pull request and on `main`.

| Job                  | PHP           | Pin             | Purpose                                                                                     |
| -------------------- | ------------- | --------------- | ------------------------------------------------------------------------------------------- |
| Library check        | 8.3, 8.4, 8.5 | kept (`8.3.0`)  | Lint, static analysis, code style, Rector dry run, audit and tests                          |
| `highest`            | 8.4, 8.5      | removed         | Installs the highest versions the range allows and runs the tests                           |
| Family window check  | —             | —               | Enforces the family commit-type rule of ADR-032                                            |

The `highest` job:

- removes the platform pin before `composer update` (by unsetting `config.platform.php` or by overriding it for the run), so Composer resolves on the real PHP of the runner;
- in a library that depends on a Symfony component, **asserts that a Symfony package resolves to 8.x** (for example `symfony/dependency-injection`, or the library's main Symfony dependency). A green run that resolved Symfony 7.4 does not pass;
- in a library with no Symfony component (`ui`), makes no Symfony assertion. The job still runs on 8.4 and 8.5 without the pin and is still required; it proves only the PHP range;
- runs the same test suite as the library check.

The library check and the `highest` job come from the shared PHP library check of `middag-io/actions`. The input that lets the reusable workflow drop the pin, and the switch that turns the Symfony assertion off for a library with no Symfony component, are part of that component, so every library gets the `highest` job through the same released version.

The shared check also owns caching: the Composer cache, and the Rector, PHPStan and PHP-CS-Fixer caches (to be added). A library adds no cache step of its own; a cache it needs is a change to the shared check.

::: warning Decision required at acceptance: where CI caches live

| Option | Effect |
| --- | --- |
| **A. The shared check owns every cache: Composer, Rector, PHPStan and PHP-CS-Fixer (recommended)** | One change in `middag-io/actions` speeds up every library at once; the eight workflows stay identical. |
| B. Each library adds its own tool-cache steps | Faster to land per library; the workflows drift apart. |
| C. Composer cache only | No change to the shared check; static analysis and code style run cold on every push. |

:::

## Required checks on `main`

- The family window check is required on `main` of every library.
- The library check and the `highest` job are required on `main` of every library, with the branch up to date before merge.
- A library adds a required check only through the organization ruleset, so the eight repositories stay identical.
