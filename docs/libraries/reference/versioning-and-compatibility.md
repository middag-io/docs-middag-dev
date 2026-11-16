---
title: 'Versioning and compatibility'
---

# Versioning and compatibility

Status: proposed. The version family of the MIDDAG PHP libraries: its members, its lifecycle, what each release may carry, the supported surface and the compatibility matrix of each MAJOR. This page states every rule a consumer of the libraries relies on. ADR-032 of the MIDDAG profile (`docs-middag-ops`) is the internal record behind it; a reader does not need it. Related: [Platform](./platform), [Guards](./guards), [Documentation publication](./publication).

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
- **Releases before `2.0.0` are pre-stable and unsupported.** They carry no compatibility promise, no deprecation cycle, no security line and no maintenance branch. A breaking change may ship in a MINOR.
- **The cut to `2.0.0` is clean.** There is no upgrade path from a pre-stable release and no `UPGRADING` file before `2.0.0`. The `UPGRADING` file starts at `2.0.0` and states that stable support applies from that release on. The `CHANGELOG` continues across the cut.
- **`2.0.0` ships when the libraries are stable enough to carry full support**: deprecation before removal, SemVer and the previous-MAJOR line. It has no fixed date.
- `middag-php-demo-standalone` stays on `0.x` until the family cut and joins the family at `2.0.0`.

From `2.0.0`:

| Part     | May carry                                                                                                       |
| -------- | --------------------------------------------------------------------------------------------------------------- |
| PATCH    | Fixes only, per library                                                                                         |
| MINOR    | Features and new ranges, released as a family MINOR in every library; never a break                            |
| MAJOR    | Breaks, released as a family MAJOR; a removal is first deprecated in a MINOR, with a runtime notice             |
| Previous | The last MINOR of the previous MAJOR receives security fixes only, for 6 months after the next MAJOR ships; the pre-stable line has none |

## Library lifecycle and product lifecycle

The libraries and the products that consume them have separate lifecycles and separate support floors.

- The library family follows this page. Its support floors are the ranges in the [matrix](#compatibility-matrix) below.
- A product (`moodle-local_middag`, `wp-plugin-middag`, `wp-plugin-middag-account`) follows its own versioning scheme and its own support policy in the MIDDAG profile. A product release states the library range it is built on; it never extends the library support promise, and a library release never extends a product support promise.
- A product may support a narrower range than the libraries (for example, the PHP versions its host supports). It never supports a wider one.
- `wp-plugin-middag` is a lower-priority consumer: a `moodle-local_middag` release, `10.0.0` included, does not wait for it.

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
| Moodle (`middag-io/moodle`) | 4.5 (PHP 8.3), 5.1, 5.2 and 5.3 (PHP 8.3 and 8.4); 5.0 as best effort, with no support promise |
| WordPress (`middag-io/wordpress`) | The versions with official upstream support, on the PHP versions each one supports; the concrete floor is a decision required at acceptance (below) |
| Database engines (`middag-io/moodle`) | PostgreSQL and MySQL, as supported by the Moodle version in range |

How the Symfony range resolves per PHP version:

| PHP | Symfony line Composer resolves | Proven by                                      |
| --- | ------------------------------ | ---------------------------------------------- |
| 8.3 | 7.4                            | the pinned CI jobs (`config.platform.php` `8.3.0`) |
| 8.4 | 8.x                            | the `highest` CI job                           |
| 8.5 | 8.x                            | the `highest` CI job                           |

Rules:

- Symfony 8.x requires PHP 8.4 or later, so PHP 8.3 always resolves Symfony 7.4. In every library that depends on Symfony, both ends of the Symfony range are tested; `ui` has no Symfony dependency, so its tests cover only the PHP range ([Platform](./platform)).
- The host columns bind the adapters only. `middag-io/ui` and `middag-io/framework` run with no host.
- A Moodle version caps the PHP versions available on that host (Moodle 4.5 runs up to PHP 8.3). The adapter supports the intersection, never more.
- A host version enters the range in a family MINOR. A host version leaves the range when its official upstream support ends; the next family MINOR records the removal.
- A host version marked best effort is listed in the matrix because it is expected to run, but no support promise covers it and no fix is owed for it. Moodle 5.0 is best effort in `2.x`: its official upstream support has ended.
- `moodle-local_middag` declares `$plugin->supported = [405, 503]`, which covers Moodle 4.5 to 5.3. Its range keeps Moodle 5.0 with a warning, as best effort, the same status the adapter gives it; the product promises support only for the versions the adapter supports.
- The WordPress range follows the same rule as the Moodle range: a WordPress version leaves it when official upstream support ends. WordPress officially supports only its last major release ([Supported versions](https://wordpress.org/documentation/article/supported-versions/)). Security fixes that WordPress backports to older branches as a courtesy do not count as support.
- A PHP or Symfony line leaves the range only in a family MAJOR.
- The matrix is checked in each library's CI from `2.0.0`.

::: warning Decision required at acceptance: the WordPress floor

The rule above is decided; the concrete floor it gives today is not.

| Option | Effect |
| --- | --- |
| A. The latest major only: WordPress 7.1 | The range is exactly the release WordPress supports officially. |
| B. The latest and the previous major: WordPress 7.1 and 7.0, with a grace window | The previous major stays in range for a grace window after the next major ships, so a site has time to upgrade. |

:::

::: warning Decision required at acceptance: database engines of the Moodle adapter

| Option                                                                 | Effect                                                                                                  |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **A. PostgreSQL and MySQL, proven on both in the consumer pipeline (recommended)** | The `@api` SQL helpers of the Moodle adapter carry an engine statement; the proof runs on both engines. |
| B. MySQL only; PostgreSQL compatible but unsupported                   | Narrower promise; contradicts the engine the products run on by default.                               |
| C. No engine statement                                                 | The `@api` SQL helpers ship with no stated engine.                                                      |

MariaDB and SQL Server are outside the range under every option until a real consumer needs them.

:::
