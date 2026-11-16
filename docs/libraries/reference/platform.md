---
title: 'Platform'
---

# Platform

The platform every library of the MIDDAG PHP family declares, when its PHP floor rises, and how CI proves it. This page states every platform rule a consumer of the libraries relies on. The PHP platform floor reference of the MIDDAG profile (`docs-middag-ops`) is the internal source behind it; a reader does not need it. Related: [Versioning and compatibility](./versioning-and-compatibility), [Guards](./guards).

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
| Family window check  | —             | —               | Enforces the family commit-type rule: from `2.0.0` a `feat:` merges only while a family MINOR window is open, and a breaking change only while a family MAJOR window is open |

The `highest` job:

- removes the platform pin before `composer update` (by unsetting `config.platform.php` or by overriding it for the run), so Composer resolves on the real PHP of the runner;
- in a library that depends on a Symfony component, **asserts that its Symfony packages resolve to 8.x**: the packages listed in its `expect-majors` ([recipe per library](#recipe-per-library)). A green run that resolved Symfony 7.4 does not pass;
- in a library with no Symfony component (`ui`), makes no Symfony assertion: its `expect-majors` is empty. The job still runs on 8.4 and 8.5 without the pin and is still required; it proves only the PHP range;
- runs the same test suite as the library check.

The library check and the `highest` job come from the shared PHP library check of `middag-io/actions` (`php-library-check`). The `highest` job is a second call of the same component, with these inputs (to be released):

| Input                 | Value in the `highest` call | Effect                                                                                                 |
| --------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------ |
| `php-versions`        | `["8.4", "8.5"]`            | Symfony 8.x needs PHP 8.4 or later, so 8.3 stays in the library check only                             |
| `dependency-versions` | `highest`                   | Runs `composer update` instead of `composer install`                                                   |
| `unset-platform-php`  | `true`                      | Unsets `config.platform.php` before the install, so the PHP of the runner constrains the resolution     |
| `expect-majors`       | `<vendor>/<package>:<major>` items | Each listed package must be installed at that major version, or the job fails. Empty means no assertion |

### Recipe per library

Every library runs the library check on `["8.3", "8.4", "8.5"]` and the `highest` job on `["8.4", "8.5"]`. The table lists what differs.

| Library                      | Call form                                                                                                                              | `expect-majors` of `highest`                                    | Own jobs, next to the shared check                                                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `middag-php-ui`              | reusable workflow                                                                                                                      | empty                                                           | none                                                                                                                                                |
| `middag-php-framework`       | reusable workflow                                                                                                                      | `symfony/dependency-injection:8`, `symfony/http-kernel:8`       | none                                                                                                                                                |
| `middag-php-moodle`          | reusable workflow                                                                                                                      | `symfony/routing:8`                                             | `stan-matrix`: PHPStan against the Moodle stubs of each Moodle version in range (4.5, 5.1, 5.2 and 5.3). The `platform` job leaves; `highest` replaces it |
| `middag-php-wordpress`       | reusable workflow                                                                                                                      | `symfony/routing:8`                                             | `wordpress-matrix`: static analysis only, PHPStan against the WordPress stubs of the latest major and the previous one (`~7.1.0` and `~7.0.0`). No test job runs per WordPress version |
| `middag-php-demo-standalone` | reusable workflow; installs from its committed `composer.lock`                                                                         | `symfony/dotenv:8`                                              | the Docker image build with a smoke test (no push), and the end-to-end tests                                                                        |
| `middag-php-core`            | composite action, in a matrix job of its own: its tests need a Redis service, which a reusable workflow cannot take from its caller | `symfony/dependency-injection:8`                                | `stan-matrix`: PHPStan against the Moodle stubs of each Moodle version in range |
| `middag-php-licensing`       | reusable workflow                                                                                                                      | `symfony/yaml:8` (its only Symfony package, in `require-dev`)   | none                                                                                                                                                |
| `middag-php-dev-tools`       | reusable workflow                                                                                                                      | `symfony/console:8`                                             | the OSS purity job ([Guards](./guards#oss-purity))                                                                                                  |

Rules:

- A library keeps a job of its own only for a check the shared component cannot run. A platform check that the `highest` job covers is not kept.
- `expect-majors` lists at least one Symfony package of each library that depends on Symfony, chosen from its own `require`, or from `require-dev` when it has no runtime Symfony dependency.
- The demo follows the library recipe: `^8.3`, pin `8.3.0`, its `composer.lock` regenerated at the pin and its Symfony constraints `^7.4 || ^8.1`. It proves both ends of the Symfony range like every library; the lock its Docker image ships resolves Symfony 7.4.

The shared check also owns caching: the Composer cache, and the Rector, PHPStan and PHP-CS-Fixer caches through its `tool-cache-paths` input (to be released). A library adds no cache step of its own; it passes the directory its tools write to (for example `.cache`), and any other cache it needs is a change to the shared check.

## Required checks on `main`

- The family window check is required on `main` of every library.
- The library check and the `highest` job are required on `main` of every library, with the branch up to date before merge.
- A library adds a required check only through the organization ruleset, so every library has the same required checks.
