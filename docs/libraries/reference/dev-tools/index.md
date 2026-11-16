---
title: 'middag-php-dev-tools'
---

# middag-php-dev-tools

`middag-php-dev-tools` (Composer package `middag-io/dev-tools`) is the build-time tooling of the MIDDAG PHP library family. It ships one console application, `vendor/bin/middag-dev-tools`, with the gates that keep the libraries inside their boundaries, the generators that write host files from library metadata, and PHPStan rules for the internal libraries and the products.

It is an **internal library: proprietary, not free open source**. It is a member of the MIDDAG PHP library family and follows the family rules in [Versioning and compatibility](../versioning-and-compatibility) and [Platform](../platform), but the Apache-2.0 license of the OSS libraries does not apply to it. As [Documentation publication](../publication) sets for an internal library, this hub publishes only its curated public surface. The full documentation stays in the [repository](https://github.com/middag-io/middag-php-dev-tools#readme).

This section:

- **[Public surface](./public-api)**: the gates, the generators and their configuration, and the PHPStan rules a consumer uses.

## Who uses it

- **The library family**, through the gates. The OSS purity gate runs in the CI of `dev-tools` and checks the five public OSS libraries from outside ([Guards](../guards#oss-purity)).
- **The internal libraries and the products**, as a development dependency: they run its gates and generators and include its PHPStan rules.

No OSS library requires `dev-tools`, not even under `require-dev`. Each OSS library keeps its own `tests/Architecture/` suite for its host rules ([Guards](../guards#what-is-guarded)).

`dev-tools` is never a runtime dependency. Production code never loads it, and a consumer requires it only under `require-dev`.

## Supported surface

The library applies the family rule "no tag means `@internal`" ([Supported surface](../versioning-and-compatibility#supported-surface)):

- A class, interface, trait or enum is public only when its docblock carries `@api`.
- A symbol without the tag is `@internal`, even when it is `public` in PHP. It may change in any release.
- Only `@api` symbols follow the family versioning rules.
- The support rule treats an untagged symbol as `@internal`. `check:api-tags` additionally requires an explicit `@api` or `@internal` tag in the libraries that run it ([Public surface](./public-api#gates-for-the-library-family)).
- The console commands, their options and exit codes, and the configuration keys they read are part of the public surface as [Public surface](./public-api) describes them.

The repository keeps an `API-STABILITY.md` that states the rule "no tag means `@internal`" and lists the `@api` types.

## Requirements

`composer.json` requires:

- PHP `^8.3` and `ext-tokenizer`;
- `middag-io/framework`, read only as metadata (attributes and contracts). `dev-tools` never boots the framework;
- Symfony Console and the Symfony Finder, HttpClient, Process and Yaml components, in the family Symfony range `^7.4 || ^8.1` ([Platform](../platform#declared-platform));
- `opis/json-schema` and `zircote/swagger-php`.

The Moodle commands, such as `generate:statics --adapter=moodle`, also need `middag-io/moodle` in the consuming project. It is suggested, not required.

## Install

The package is published to the private Composer registry of MIDDAG, not to Packagist. A consumer with registry credentials registers the repository and requires `middag-io/dev-tools` under `require-dev`; the repository README gives the steps.

## Help

Questions and bug reports go to the issues of `middag-io/middag-php-dev-tools`. Report a vulnerability privately, as the MIDDAG [security policy](https://github.com/middag-io/.github/blob/main/SECURITY.md) describes, never in a public issue.
