---
title: 'Versioning and compatibility'
---

# Versioning and compatibility

The version family of the open-source MIDDAG PHP libraries: its members, its lifecycle, what each release may carry, the supported surface and the compatibility matrix of each MAJOR. This page states every rule a consumer of the libraries relies on. Related: [Platform](./platform), [Guards](./guards), [Documentation publication](./publication).

## The family

The open-source `middag-php-*` libraries form one version family. They live in separate repositories and share the MAJOR version; MINOR and PATCH releases are per library.

| Library                      | Package                     | License     | Kind     |
| ---------------------------- | --------------------------- | ----------- | -------- |
| `middag-php-ui`              | `middag-io/ui`              | Apache-2.0  | OSS      |
| `middag-php-framework`       | `middag-io/framework`       | Apache-2.0  | OSS      |
| `middag-php-moodle`          | `middag-io/moodle`          | Apache-2.0  | OSS      |
| `middag-php-wordpress`       | `middag-io/wordpress`       | Apache-2.0  | OSS      |
| `middag-php-demo-standalone` | `middag-io/demo-standalone` | Apache-2.0  | OSS      |

Each library requires its siblings with `^2.N`, where `N` is the lowest MINOR it needs, so Composer installs a compatible set. A consumer requires each package it imports with `^2.0`, or with the MINOR whose features it uses: for example `middag-io/framework` `^2.3` and `middag-io/moodle` `^2.1`. MINOR upgrades inside that range do not break.

The internal MIDDAG libraries, such as `middag-io/core`, are not open source and are not part of this family: they version on their own line, and this page does not cover them. Where their documentation lives is in [Documentation publication](./publication).

## Lifecycle

- **`2.0.0` is the first supported release of every library in the family.** Support, as defined below, starts there.
- **Releases before `2.0.0` are pre-stable and unsupported.** They carry no compatibility promise, no deprecation cycle, no security line and no maintenance branch. A breaking change may ship in a MINOR.
- **The cut to `2.0.0` is clean.** There is no upgrade path from a pre-stable release and no `UPGRADING` file before `2.0.0`. The `UPGRADING` file starts at `2.0.0` and states that stable support applies from that release on. The `CHANGELOG` continues across the cut.
- **`2.0.0` ships when the libraries are stable enough to carry full support**: deprecation before removal where possible, SemVer and the previous-MAJOR line. It has no fixed date.
- `middag-php-demo-standalone` stays on `0.x` until the family cut and joins the family at `2.0.0`. It is an example application: only its latest release is supported.

From `2.0.0`:

| Part     | May carry                                                                                                       |
| -------- | --------------------------------------------------------------------------------------------------------------- |
| PATCH    | Fixes only, per library                                                                                         |
| MINOR    | Additive `@api` changes and new ranges, per library; never a break                                             |
| MAJOR    | Breaking `@api` changes, released as a family MAJOR and following [Deprecation](#deprecation)                   |
| Previous | The last MINOR of the previous MAJOR receives critical and high severity security fixes only, from an `N.x` branch opened at the cut, for 6 months or until the end of life of the PHP or host version that motivated the new MAJOR, whichever comes first; the pre-stable line has none |

Fixes go to the latest MINOR of the current MAJOR, as PATCH releases.

### Deprecation

A removal or incompatible change of an `@api` element ships only in a MAJOR. Where possible it is announced first in a MINOR of the current MAJOR: the element carries `@deprecated` naming its replacement, the changelog lists it, and code that still runs emits an `E_USER_DEPRECATED` notice where PHP can raise one. A change that cannot be deprecated in place, such as a new abstract method on an interface or a changed signature, ships in a MAJOR with an entry in `UPGRADING.md`.

## Library lifecycle and product lifecycle

The libraries and the products that consume them have separate lifecycles and separate support floors.

- The library family follows this page. Its support floors are the ranges in the [matrix](#compatibility-matrix) below.
- A product (`moodle-local_middag`, `wp-plugin-middag`, `wp-plugin-middag-account`) follows its own versioning scheme and its own support policy. A product release states the library range it is built on; it never extends the library support promise, and a library release never extends a product support promise.
- A product may support a narrower range than the libraries (for example, the PHP versions its host supports). It never supports a wider one.
- Which library MAJOR a product adopts, and when, is part of that product's release notes, not of this page.

## Supported surface

- Support covers the public surface only: classes, interfaces, enums, attributes and functions tagged `@api`. Anything untagged, or tagged `@internal`, is outside the promise and may change in any release.
- Each library keeps an `API-STABILITY.md` that lists its public surface and points to this page for the support rules.
- `middag-php-demo-standalone` is an example application, not a library. It has no public surface and keeps no `API-STABILITY.md`; nothing in it is meant to be imported by another package.
- In `middag-php-moodle`, `RouterBridgeSupport` (the native-router bridge) is `@api`; the routing placeholder `Http\Routing\MiddagProxy` stays `@internal`.

## Extension rule

- A new public surface in any library, including a new adapter surface (for example a diagnostics report or a host CLI command), arrives in a MINOR of that library. It is additive and changes no existing contract.
- Such a surface is designed with the product work that needs it. It is not part of the family's target design until a MINOR plans it. The WordPress boot-diagnostics request stays with the WordPress product work.

## Compatibility matrix

Each MAJOR of the family publishes one matrix. The matrix is the support floor and ceiling of every library in that MAJOR.

### `2.x`

| Dimension                | Range                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| PHP                      | 8.3, 8.4 and 8.5                                                                          |
| Symfony                  | `^7.4 \|\| ^8.1`                                                                          |
| Sibling libraries        | `^2.N` (each library requires its siblings at the lowest MINOR it needs)                 |
| Moodle (`middag-io/moodle`) | 4.5 (PHP 8.3), 5.1, 5.2 and 5.3 (PHP 8.4; PHP 8.3 expected, not installed in CI) |
| WordPress (`middag-io/wordpress`) | 7.0 and 7.1 (the latest major and the previous one), on the PHP versions each one supports |
| Database engines (`middag-io/moodle`) | PostgreSQL, MySQL and MariaDB, as supported by the Moodle version in range |

How the Symfony range resolves per PHP version:

| PHP | Symfony line Composer resolves | Proven by                                      |
| --- | ------------------------------ | ---------------------------------------------- |
| 8.3 | 7.4                            | the pinned CI jobs (`config.platform.php` `8.3.0`) |
| 8.4 | 8.x                            | the `highest` CI job                           |
| 8.5 | 8.x                            | the `highest` CI job                           |

Rules:

- Symfony 8.x requires PHP 8.4 or later, so PHP 8.3 always resolves Symfony 7.4. In every library that depends on Symfony, CI tests Symfony 7.4 (the latest release, or the locked one in the demo) on PHP 8.3, 8.4 and 8.5 with the platform pinned to 8.3.0, and the latest 8.x release on PHP 8.4 and 8.5 (`highest`). The lowest versions the constraints allow are not tested yet. `ui` has no Symfony dependency, so its tests cover only the PHP range ([Platform](./platform)).
- The host columns bind the adapters only. `middag-io/ui` and `middag-io/framework` run with no host.
- A Moodle version caps the PHP versions available on that host (Moodle 4.5 runs up to PHP 8.3). The adapter supports the intersection, never more.
- The supported host versions belong to each adapter. Adding a host version is a MINOR of that adapter. A host version leaves the supported range when its official upstream support ends, unless its host rule below says otherwise; dropping it is not a breaking change and ships in a MINOR.
- Moodle 5.0 is outside the range: its official upstream support has ended. The adapter's static analysis still runs against the Moodle 5.0 stubs while Moodle 4.5 is in range, as a transition; that run carries no support promise and no fix is owed for 5.0.
- The WordPress adapter supports the latest WordPress major and the previous one: today 7.1 and 7.0. The previous major leaves the range 6 months after the release of the next major ([Releases](https://wordpress.org/download/releases/)). WordPress officially supports only its last major release ([Supported versions](https://wordpress.org/documentation/article/supported-versions/)); the previous major is a MIDDAG grace window, not upstream support. Security fixes that WordPress backports to older branches as a courtesy do not count as support.
- A platform floor (the lowest PHP version or the lowest Symfony line) rises only in a MAJOR. Support for a new PHP version or a new Symfony LTS line is added in a MINOR, once CI runs it.
- The next MAJOR (`3.0`) raises the Symfony floor to the next Symfony LTS line once it is released, and drops the PHP versions that no longer receive security support.
- Each library's CI checks the PHP and Symfony rows above. A host version is checked where [Platform](./platform#recipe-per-library) lists a job for it.
- The Moodle adapter supports PostgreSQL, MySQL and MariaDB and is proven on all three by its Engines workflow. Its `@api` SQL helpers carry an engine statement. SQL Server and Oracle are outside the range.
