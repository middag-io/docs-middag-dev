---
title: 'Reference — Moodle Adapter'
---

# Reference — Moodle Adapter

Implementation reference for `middag-io/moodle` ([middag-php-moodle](https://github.com/middag-io/middag-php-moodle)), the OSS adapter that plugs Moodle into the framework's ports. Grouped by topic (the sidebar uses the same clustering). Pages marked **downstream** document mechanisms that live in proprietary packages built on the adapter, not in the adapter itself.

The decision records behind these pages live in [`middag-php-moodle/docs/decisions`](https://github.com/middag-io/middag-php-moodle/tree/main/docs/decisions).

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
