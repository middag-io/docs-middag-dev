---
title: 'MIDDAG PHP Libraries'
---

# MIDDAG PHP Libraries

The policy of the MIDDAG PHP libraries. There are two kinds of library:

- **OSS (Apache-2.0):** `middag-php-ui`, `middag-php-framework`, `middag-php-moodle`, `middag-php-wordpress` and `middag-php-demo-standalone`. They form the version family and share the MAJOR version. Their full documentation is the [MIDDAG Framework](/framework/) section of this hub, where each one has an entry page ([The libraries](/framework/#the-libraries)).
- **Internal (proprietary, not free):** `middag-php-core` and other internal libraries. They are not part of the version family and version on their own line. Their documentation lives in their own repositories. Of `middag-php-core`, this hub publishes only the API that products and third-party extensions need.

[Versioning and compatibility](./reference/versioning-and-compatibility) and [Platform](./reference/platform) apply to the OSS family; [Documentation publication](./reference/publication) applies to both kinds. No page places the internal libraries under the Apache-2.0 license. The boundary between the two kinds is in [Architecture](/framework/explanation/architecture#oss-and-internal-libraries).

- **[Versioning and compatibility](./reference/versioning-and-compatibility)**: the family, its lifecycle, the supported surface and the compatibility matrix of each MAJOR.
- **[Platform](./reference/platform)**: the PHP and Symfony values every library declares, the floor rule and the CI recipe of each library.
- **[Documentation publication](./reference/publication)**: where the documentation of each library and product lives.
- **[Guards](./reference/guards)**: the automated checks that keep the OSS libraries free of proprietary code and of host code.
