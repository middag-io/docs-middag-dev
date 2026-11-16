---
title: 'MIDDAG PHP Libraries'
---

# MIDDAG PHP Libraries

The policy of the MIDDAG PHP library family: the eight `middag-php-*` libraries that share one version family. The family has two kinds of library:

- **OSS (Apache-2.0):** `middag-php-ui`, `middag-php-framework`, `middag-php-moodle`, `middag-php-wordpress` and `middag-php-demo-standalone`. Their full documentation is the [MIDDAG Framework](/framework/) section of this hub, where each one has an entry page ([The libraries](/framework/#the-libraries)).
- **Internal (proprietary, not free):** `middag-php-core`, `middag-php-licensing` and `middag-php-dev-tools`. Their full documentation lives in their own repositories; this hub publishes only their public API.

The pages of this section apply to both kinds. They do not place the internal libraries under the Apache-2.0 license. The boundary between the two kinds is in [Architecture](/framework/explanation/architecture#oss-and-internal-libraries).

- **[Versioning and compatibility](./reference/versioning-and-compatibility)**: the family, its lifecycle, the supported surface and the compatibility matrix of each MAJOR.
- **[Platform](./reference/platform)**: the PHP and Symfony values every library declares, the floor rule and the CI recipe of each library.
- **[Documentation publication](./reference/publication)**: where the documentation of each library and product lives.
- **[Guards](./reference/guards)**: the automated checks that keep the OSS libraries free of proprietary code and of host code.

Public API of the internal libraries:

- **[middag-php-licensing](./reference/licensing/)**: the PHP client library of MIDDAG Licensing.
