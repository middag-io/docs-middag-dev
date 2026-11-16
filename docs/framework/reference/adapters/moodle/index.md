---
title: 'Reference — Moodle Adapter'
---

# Reference — Moodle Adapter

Implementation reference for `middag-io/moodle` ([middag-php-moodle](https://github.com/middag-io/middag-php-moodle)), the OSS adapter that plugs Moodle into the framework's ports. This page is the entry point of the adapter: what it is, what it needs, where its public surface is listed, then the reference pages grouped by topic (the sidebar uses the same clustering). Pages marked **downstream** document mechanisms that live in proprietary packages built on the adapter, not in the adapter itself.

::: info Status: in progress
This page states the `2.x` line of the library family. Support starts at `2.0.0`; earlier releases are pre-stable and unsupported. Some sections below are still being written and say so.
:::

## What it is and who it is for

- A library, not a Moodle plugin. It implements the framework's ports with Moodle APIs: bootstrap, configuration, user context, translation, the database connection, the maintenance gate and the host event bridge ([Adapter Port Catalog](../../bridge-contracts), Moodle column).
- It ships no composition root. A Moodle plugin of the consumer (a `local_*` or `mod_*` plugin, for example) builds the container and boots the kernel.
- It carries no product feature and imports no proprietary MIDDAG code ([Boundary & Whitelist](./boundary-whitelist)).
- For developers of a Moodle plugin built on `middag-io/framework`, and for developers who maintain the adapter itself.

## Requirements and install

| Item                | Value                                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| Package             | `middag-io/moodle` ([middag-php-moodle](https://github.com/middag-io/middag-php-moodle)), Apache-2.0        |
| PHP                 | `^8.3`: 8.3, 8.4 and 8.5, within the PHP versions the Moodle version supports; with the `json` extension   |
| Symfony             | `^7.4 \|\| ^8.1` for every Symfony component it requires (contracts and polyfills keep their own ranges)    |
| Sibling libraries   | `middag-io/framework` and `middag-io/ui`, on the family MAJOR (`^2.0` on `2.x`)                            |
| Moodle              | 4.5 (PHP 8.3), 5.1, 5.2 and 5.3 (PHP 8.3 and 8.4); 5.0 as best effort, with no support promise              |
| Database engines    | PostgreSQL and MySQL, as supported by the Moodle version                                                   |

```bash
composer require middag-io/moodle
```

The require pulls `middag-io/framework` and `middag-io/ui`. Moodle 4.5 runs up to PHP 8.3, so a plugin that ships its `vendor/` to a Moodle 4.5 site resolves it on PHP 8.3: a `vendor/` resolved on PHP 8.4 or later installs Symfony 8.x, which PHP 8.3 cannot run.

The platform rules behind these values are in [Platform](/libraries/reference/platform) and [Versioning and compatibility](/libraries/reference/versioning-and-compatibility#compatibility-matrix). Moodle bundles some namespaces that the adapter's dependency tree also uses: see [Shared-Namespace Dependencies](./shared-namespace-dependencies).

## Public surface

- Support covers the types tagged `@api` only. Anything untagged, or tagged `@internal`, may change in any release.
- [`API-STABILITY.md`](https://github.com/middag-io/middag-php-moodle/blob/main/API-STABILITY.md) in the repository lists the public surface.
- The native-router bridge (`RouterBridgeSupport` and the routing placeholder it serves) is internal and outside the supported surface ([Versioning and compatibility](/libraries/reference/versioning-and-compatibility#supported-surface)).
- The reference pages below describe the adapter's mechanisms. In progress: the generated reference of the `@api` surface is not published yet ([Documentation publication](/libraries/reference/publication#generated-api-reference)).

## Changelog, decisions and help

- [`CHANGELOG.md`](https://github.com/middag-io/middag-php-moodle/blob/main/CHANGELOG.md) records every release; [Releases](https://github.com/middag-io/middag-php-moodle/releases) carry the tags.
- The decision records behind these pages live in [`middag-php-moodle/docs/decisions`](https://github.com/middag-io/middag-php-moodle/tree/main/docs/decisions).
- Questions and bugs: [issues of `middag-php-moodle`](https://github.com/middag-io/middag-php-moodle/issues). Security reports: [`SECURITY.md`](https://github.com/middag-io/middag-php-moodle/blob/main/SECURITY.md); do not open a public issue for a vulnerability.

## Boundary & Coverage

- [Support Layer & Anti-Patterns](./support-class-inventory)
- [Boundary & Whitelist](./boundary-whitelist)
- [API Coverage & Version Gates](./api-coverage-inventory)
- [Shared-Namespace Dependencies](./shared-namespace-dependencies)

## DI & Events

- [DI Bridge](./di-bridge-mechanics)
- [Event Observation](./event-observation-detail)

## Routing & Navigation

- [Routing Bridge Maturity](./routing-bridge-maturity)
- [Navigation Integration](./navigation-integration-detail)
- [File Areas & Pluginfile Routing](./file-areas-pluginfile-routing)

## Config & Cache

- [Settings & Config Keys](./settings-and-config-keys)
- [Config Schema Inventory](./config-schema-inventory) (downstream)
- [Cache Decorator](./cache-decorator) (downstream)

## External Services & Data Migration

- [External Services & Mobile API](./external-services-migration)
- [Import Repository (Backup/Restore)](./import-repository-contract) (downstream)

## Frontend & Codegen

- [Frontend Build & Theme Bridge](./frontend-build-detail)
- [Statics Generation](./statics-generation)

Related framework pages: [Adapter Port Catalog](../../bridge-contracts) (the Moodle column, including the transaction mapping) and [Module Layout Convention](../../module-layout-convention#moodle-adapter-host-domain-surface).
