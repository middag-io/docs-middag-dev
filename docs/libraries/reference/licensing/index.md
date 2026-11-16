---
title: 'middag-php-licensing'
---

# middag-php-licensing

`middag-php-licensing` (Composer package `middag-io/licensing`) is the PHP client library of MIDDAG Licensing. A host product uses it to activate an installation, check its license, receive its signed manifests and entitled bundles, and read the feature flags and limits those manifests grant.

It is an **internal library: proprietary, not free open source**. It is a member of the MIDDAG PHP library family and follows the family rules in [Versioning and compatibility](../versioning-and-compatibility) and [Platform](../platform), but the Apache-2.0 license of the OSS libraries does not apply to it. As [Documentation publication](../publication) sets for an internal library, this hub publishes only its curated public API. The full documentation stays in the [repository](https://github.com/middag-io/middag-php-licensing#readme) and in the client-author reference it links to.

This section:

- **[Public API](./public-api)**: the `@api` types a host codes against, grouped by what the host does with them, and the contracts each one keeps.
- **[Errors](./errors)**: the `@api` exceptions, when each one is thrown and what the host does with it.

## Supported surface

The library applies the family rule "no tag means `@internal`" ([Supported surface](../versioning-and-compatibility#supported-surface)):

- A class, interface, trait or enum is public only when its docblock carries `@api`.
- A symbol without the tag is `@internal`, even when it is `public` in PHP. It may change in any release.
- Only `@api` symbols follow the family versioning rules.

The pages of this section cover the `@api` types of `License`, `Delivery`, `Api\Account`, `Sso` and `RemoteSupport`, and the one `AntiTamper` exception the activation flow throws. Two more groups carry `@api` and are documented only in the repository:

- `Api\Admin`: the operator clients of the licensing instance, for MIDDAG operations rather than for a host product. Two of its value objects, `ServiceTokenCredentials` and `IdempotencyKey`, are covered here because the account client takes them.
- `AntiTamper`: the anti-tamper attestation and integrity services.

The repository section [Public API surface](https://github.com/middag-io/middag-php-licensing#public-api-surface) states the rule and the command that lists the `@api` files.

## Requirements

`composer.json` requires:

- PHP `^8.3`, `ext-sodium` and `ext-json`;
- `firebase/php-jwt` `^7.0`;
- the PSR interfaces of the HTTP client (PSR-18), HTTP messages (PSR-7), HTTP factories (PSR-17), clock (PSR-20), container (PSR-11) and simple cache (PSR-16).

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

Questions and bug reports go to the issues of `middag-io/middag-php-licensing`.
