---
title: 'Versioning and compatibility'
---

# Versioning and compatibility

Status: proposed. This page is the home of the compatibility matrix of the MIDDAG PHP library family. The version family itself is defined by ADR-032 (version family for the MIDDAG PHP libraries) of the MIDDAG profile in `docs-middag-ops`; this page applies it and does not restate it. Related: [Platform](./platform), [Guards](./guards), [Documentation publication](./publication).

## The family

The eight `middag-php-*` libraries form one version family. They live in separate repositories and share MAJOR.MINOR; PATCH is free per library and carries fixes only.

| Library                      | Package                     | License     | Kind     |
| ---------------------------- | --------------------------- | ----------- | -------- |
| `middag-php-ui`              | `middag-io/ui`              | Apache-2.0  | OSS      |
| `middag-php-framework`       | `middag-io/framework`       | Apache-2.0  | OSS      |
| `middag-php-moodle`          | `middag-io/moodle`          | Apache-2.0  | OSS      |
| `middag-php-wordpress`       | `middag-io/wordpress`       | Apache-2.0  | OSS      |
| `middag-php-demo-standalone` | `middag-io/demo-standalone` | Apache-2.0  | OSS      |
| `middag-php-core`            | `middag-io/core`            | proprietary | internal |
| `middag-php-licensing`       | `middag-io/licensing`       | proprietary | internal |
| `middag-php-dev-tools`       | `middag-io/dev-tools`       | proprietary | internal |

The internal libraries are not free open source. Their kind decides where their documentation lives ([Documentation publication](./publication)); it does not change their version or their support.

## Lifecycle

- **`2.0.0` is the first supported release of every library in the family.** Support, as defined below, starts there.
- **Releases before `2.0.0` are pre-stable and unsupported.** They carry no compatibility promise, no deprecation cycle, no security line and no maintenance branch. A breaking change ships in a MINOR, typed `feat:` or `refactor:` without `!`.
- **The cut to `2.0.0` is clean.** There is no upgrade path from a pre-stable release and no `UPGRADING` file before `2.0.0`. The `UPGRADING` file starts at `2.0.0` and states that stable support applies from that release on. The `CHANGELOG` continues across the cut.
- **`2.0.0` ships when the libraries are stable enough to carry full support**: deprecation before removal, SemVer and the previous-MAJOR line. It has no fixed date.
- `middag-php-demo-standalone` stays on `0.x` until the family cut and joins the family at `2.0.0`.

From `2.0.0`:

| Part     | May carry                                                                                                       |
| -------- | --------------------------------------------------------------------------------------------------------------- |
| PATCH    | Fixes only, per library                                                                                         |
| MINOR    | Features and new ranges, released as a family MINOR in every library; never a break                            |
| MAJOR    | Breaks, released as a family MAJOR; a removal is first deprecated in a MINOR, with a runtime notice             |
| Previous | The last MINOR of the previous MAJOR receives security fixes for the window ADR-032 sets; the pre-stable line has none |

## Library lifecycle and product lifecycle

The libraries and the products that consume them have separate lifecycles and separate support floors.

- The library family follows this page and ADR-032. Its support floors are the ranges in the [matrix](#compatibility-matrix) below.
- A product (`moodle-local_middag`, `wp-plugin-middag`, `wp-plugin-middag-account`) follows its own versioning scheme and its own support policy in the MIDDAG profile. A product release states the library range it is built on; it never extends the library support promise, and a library release never extends a product support promise.
- A product may support a narrower range than the libraries (for example, the PHP versions its host supports). It never supports a wider one.

## Supported surface

- Support covers the public surface only: classes, interfaces, enums, attributes and functions tagged `@api`. Anything untagged, or tagged `@internal`, is outside the promise and may change in any release.
- For `middag-php-licensing`, `middag-php-dev-tools` and `middag-php-demo-standalone`, the rule "no tag means `@internal`" applies; the public surface is what each library documents as public.
- Each library keeps an `API-STABILITY.md` that lists its public surface and points to this page for the support rules.
- The Moodle native-router bridge of `middag-php-moodle` (`RouterBridgeSupport` and the routing placeholder it serves) is internal and not part of the supported surface. Promoting it is an additive change for a family MINOR.

::: warning Decision required at acceptance: the Moodle native-router bridge

| Option                                                                          | Effect                                                                   |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **A. Keep it internal, outside the supported surface (recommended)**            | No consumer calls it; promotion later is additive. The rule above stays. |
| B. Remove the bridge and its placeholder before `2.0.0`                         | No placeholder code in the stable line; a small removal in the adapter.  |
| C. Finish it and prove it on a Moodle 5.1+ host before `2.0.0`                  | Larger scope; adds a supported surface with its own tests.               |

:::

## Extension rule

- A new public surface in any library, including a new adapter surface (for example a diagnostics report or a host CLI command), arrives in a family MINOR. It is additive and changes no existing contract.
- Such a surface is designed with the product work that needs it. It is not part of the family's target design until a MINOR plans it.

::: warning Decision required at acceptance: new adapter surfaces outside the target design

| Option                                                                               | Effect                                                                       |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| **A. Additive surfaces arrive in a family MINOR, owned by the product that needs them (recommended)** | The target design stays the existing contracts; the WordPress boot-diagnostics request stays with the WordPress product work. |
| B. Design the WordPress boot-diagnostics surface here and build it with the platform work | Adds a design section (boot versus render scope) to this design.            |

:::

## Compatibility matrix

Each family MAJOR publishes one matrix. The matrix is the support floor and ceiling of every library in that MAJOR.

### `2.x`

| Dimension                | Range                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| PHP                      | 8.3, 8.4 and 8.5                                                                          |
| Symfony                  | `^7.4 \|\| ^8.1`                                                                          |
| Sibling libraries        | `^2.0` (each library requires its siblings on the family MAJOR)                          |
| Moodle (`middag-io/moodle`) | 4.5 to 5.3, each on the PHP versions that Moodle version supports                     |
| WordPress (`middag-io/wordpress`) | 6.5 and later, on the PHP versions that WordPress version supports              |
| Database engines         | PostgreSQL and MySQL, as supported by the host version in range                           |

How the Symfony range resolves per PHP version:

| PHP | Symfony line Composer resolves | Proven by                                      |
| --- | ------------------------------ | ---------------------------------------------- |
| 8.3 | 7.4                            | the pinned CI jobs (`config.platform.php` `8.3.0`) |
| 8.4 | 8.x                            | the `highest` CI job                           |
| 8.5 | 8.x                            | the `highest` CI job                           |

Rules:

- Symfony 8.x requires PHP 8.4 or later, so PHP 8.3 always resolves Symfony 7.4. Both ends of the Symfony range are tested ([Platform](./platform)).
- The host columns bind the adapters only. `middag-io/ui` and `middag-io/framework` run with no host.
- A Moodle version caps the PHP versions available on that host (Moodle 4.5 runs up to PHP 8.3). The adapter supports the intersection, never more.
- A host version enters or leaves the range in a family MINOR. A PHP or Symfony line leaves the range only in a family MAJOR.
- The matrix is checked in each library's CI from `2.0.0`.

::: warning Decision required at acceptance: the WordPress floor

| Option                                                       | Effect                                                                                          |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| **A. WordPress 6.5 and later (recommended)**                 | Matches the floor both WordPress products declare in their plugin headers.                     |
| B. No WordPress floor in the matrix; each product states its own | The adapter carries no host statement, unlike the Moodle adapter.                          |

:::

::: warning Decision required at acceptance: database engines

| Option                                                                 | Effect                                                                                                  |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **A. PostgreSQL and MySQL, proven on both in the consumer pipeline (recommended)** | The `@api` SQL helpers of the Moodle adapter carry an engine statement; the proof runs on both engines. |
| B. MySQL only; PostgreSQL compatible but unsupported                   | Narrower promise; contradicts the engine the products run on by default.                               |
| C. No engine statement                                                 | The `@api` SQL helpers ship with no stated engine.                                                      |

MariaDB and SQL Server are outside the range under every option until a real consumer needs them.

:::
