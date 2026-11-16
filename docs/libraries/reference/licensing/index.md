---
title: 'middag-php-licensing'
---

# middag-php-licensing

`middag-php-licensing` (Composer package `middag-io/licensing`) is the PHP client library of MIDDAG Licensing. A host product uses it to activate an installation, check its license, receive its signed manifests and entitled bundles, and read the feature flags and limits those manifests grant.

It is an **internal library: proprietary, not free open source**. It is a member of the MIDDAG PHP library family and follows the family rules in [Versioning and compatibility](../versioning-and-compatibility) and [Platform](../platform), but the Apache-2.0 license of the OSS libraries does not apply to it. As [Documentation publication](../publication) sets for an internal library, this hub publishes only its curated public API. The [repository README](https://github.com/middag-io/middag-php-licensing#readme) points here for it.

This section:

- **[Public API](./public-api)**: every `@api` type, grouped by what the host does with it, and the contracts each one keeps.
- **[Errors](./errors)**: the `@api` exceptions and typed refusal enums, when each one is thrown and what the host does with it.

## Supported surface

The library applies the family rule "no tag means `@internal`" ([Supported surface](../versioning-and-compatibility#supported-surface)):

- A class, interface, trait or enum is public only when its class-level docblock carries `@api`.
- Any other symbol is `@internal`, even when it is `public` in PHP. It may change in any release.
- Every class, interface, trait and enum under `src/` carries exactly one of `@api` or `@internal`. The `composer check:stability-tags` gate, run in CI, fails on a type with neither or with both, so no type is left untagged.
- Only `@api` symbols follow the family versioning rules.

[API-STABILITY.md](https://github.com/middag-io/middag-php-licensing/blob/v1.16.0/API-STABILITY.md) in the repository states the rule, the kinds of change and how the `@api` surface may change on `1.x` and from `2.0.0`. The command `grep -rl '@api' src` lists the `@api` files.

At `v1.16.0`, `@api` covers 204 types in ten groups: `License`, `Delivery`, `Api` (the base client and its contract), `Api\Account`, `Api\Admin`, `Sso`, `RemoteSupport`, `AntiTamper`, `Observability` and `Telemetry`. [Public API](./public-api) documents every one of them and closes with a [type index](./public-api#type-index). The rest of the `Observability` and `Telemetry` namespaces, the scheduled tasks of `AntiTamper` and `RemoteSupport` and the helpers the `@api` types use inside are `@internal`.

## Requirements

`composer.json` requires:

- PHP `^8.3`, `ext-sodium` and `ext-json`;
- `firebase/php-jwt` `^7.0`;
- the PSR interfaces of the HTTP client (PSR-18), HTTP messages (PSR-7), HTTP factories (PSR-17), clock (PSR-20), container (PSR-11) and simple cache (PSR-16).

`ext-intl` is optional. It is needed only to derive a `site_id` from an internationalized host name: without it, `SiteId::fromWwwroot()` refuses such a host.

The library depends on no other MIDDAG library, no framework and no CMS. A guard test fails the build of the library when its source references another `Middag\` namespace or when it requires a `middag-io/*` package.

## Install

The package is published to the private Composer registry of MIDDAG, not to Packagist. A consumer with registry credentials registers the repository and requires `middag-io/licensing`; the repository README gives the steps.

## Host responsibilities

The library ships no default for anything that names a licensing instance. The host, the adapter of the product, supplies:

- a PSR-18 client, PSR-17 request and stream factories and a PSR-20 clock;
- the base URL of its licensing instance and the expected issuer of each verifier, from its own configuration;
- the stores and ports the library declares as interfaces (see [Host contracts](./public-api#host-contracts));
- its install id, a UUIDv7 it provisions once, the product identifier and the canonical site id.

Identity is the pair `(install_id, product)`. One install id may hold many products, each with its own install material, license state and manifests. The site never stores or sends a license key.

## Help

Questions and bug reports go to the issues of `middag-io/middag-php-licensing`. Security issues follow the `SECURITY.md` of the repository, never a public issue. Changes to the library follow its `CONTRIBUTING.md`.
