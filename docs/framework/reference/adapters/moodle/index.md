---
title: 'Reference — Moodle Adapter'
---

# Reference — Moodle Adapter

Implementation reference for `middag-io/moodle` ([middag-php-moodle](https://github.com/middag-io/middag-php-moodle)), the OSS adapter that plugs Moodle into the framework's ports. This page is the entry point of the adapter: what it is, what it needs, where its public surface is listed, then the reference pages grouped by topic (the sidebar uses the same clustering). Pages marked **downstream** document mechanisms that live in proprietary packages built on the adapter, not in the adapter itself.

::: info Status: in progress
This page states the `2.x` line of the library family. Support starts at `2.0.0`; earlier releases are pre-stable and unsupported. One part is still being written: the generated reference of the `@api` surface (see [Public surface](#public-surface)).
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
| Sibling libraries   | `middag-io/framework` `^1.24` and `middag-io/ui` `^1.14` on the `1.x` line, then the family MAJOR (`^2.0` on `2.x`) |
| Client              | the shared props target `@middag-io/react` `^0.48.0` (envelope version `2`); the adapter does not install it |
| Moodle              | 4.5 (PHP 8.3), 5.1, 5.2 and 5.3 (PHP 8.4; PHP 8.3 expected, not installed in CI)                             |
| Database engines    | PostgreSQL, MySQL and MariaDB, as supported by the Moodle version; SQL Server and Oracle are outside the range |

```bash
composer require middag-io/moodle
```

The require pulls `middag-io/framework` and `middag-io/ui`. The adapter ships no container builder: the consumer plugin registers its own at boot with `Runtime\ContainerFactory::setBuilder()`, a closure that receives the `Runtime\Kernel` and the `Http\Contract\RouterInterface` router and returns the compiled Symfony `ContainerBuilder`. When the kernel asks for the container and no builder is registered, `ContainerFactory` throws a `RuntimeException`. Moodle 4.5 runs up to PHP 8.3, so a plugin that ships its `vendor/` to a Moodle 4.5 site resolves it on PHP 8.3: a `vendor/` resolved on PHP 8.4 or later installs Symfony 8.x, which PHP 8.3 cannot run.

The platform rules behind these values are in [Platform](/libraries/reference/platform) and [Versioning and compatibility](/libraries/reference/versioning-and-compatibility#compatibility-matrix). Moodle bundles some namespaces that the adapter's dependency tree also uses: see [Shared-Namespace Dependencies](./shared-namespace-dependencies).

## Public surface

Support covers the types tagged `@api` only ([Supported surface](/libraries/reference/versioning-and-compatibility#supported-surface)). Every type in `src/` carries exactly one of `@api` or `@internal`; a type with neither is internal. [`API-STABILITY.md`](https://github.com/middag-io/middag-php-moodle/blob/main/API-STABILITY.md) in the repository lists the public surface. All names below are relative to the `Middag\Moodle\` namespace.

| Area                       | `@api` types                                                                                                                                                                                                                                 |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain model               | `Domain\*` entities, DTOs and enums for courses, users, enrolments, groups, roles, contexts, grades, completion, calendar, messages, files, custom fields, events, backup and the platform, plus `Domain\Task\Enum\TaskRunState`; the domain `Contract\` interfaces (the `*ServiceInterface` types, `FileAreaHandlerInterface` and `BackupStepsProviderInterface`). `Domain\Platform\PluginDto` and the `Domain\Task\*Dto` types (`AdhocTaskDto`, `ScheduledTaskDto`, `RunningTaskDto`, `TaskSummaryDto`), which `@api` services return. The concrete `*Service` classes are `@internal` |
| Settings and definitions   | `Settings\*` (admin setting types and `Settings\SettingsResolver`) and `Definition\*` (the builders that statics generation turns into `db/*.php`, with their `Contract/` interface)                                                         |
| Moodle API wrappers        | `Support\Moodle` (the façade) and the public `Support\*` wrappers, one per Moodle API: course, user, enrolment, capability, context, cache, config, file, grade, task, lock, session, URL, output and the others in the [API coverage](./api-coverage-inventory); the bridges `Support\DiBridgeSupport` ([DI bridge](./di-bridge-mechanics)) and `Support\RouterBridgeSupport` ([routing bridge](./routing-bridge-maturity)) |
| Security and privacy       | `Security\Contract\*` (authentication, authorization, capability), the `Security\ValueObject\Capability` and `Security\ValueObject\Sesskey` value objects, the `Security\Enum\CapabilityRisk` and `Security\Enum\CapabilityType` enums and the `Security\Attribute\Sesskey` attribute; `Privacy\Contract\*` and `Privacy\PrivacyProvider`                                                       |
| HTTP, output and services  | `Http\Contract\MoodleControllerInterface`, `Http\Contract\RouterInterface`, `Output\Contract\ViewAdapterInterface`, `Output\MoodleView`, `Output\MoodleRenderer`, the `Output\Table` helpers and `WebService\AbstractExternal`              |
| Forms                      | `Form\DraftFileValueMapper`, which maps the `uploadToken` of a `middag-io/ui` `FileValue` to a Moodle draft area and back. The `Form\Mform*` field mapper and renderer are `@internal` |
| Exceptions                 | `Exception\MoodleAdapterException`, `Exception\MoodleConfigurationException`, `Exception\MoodleTransportException` and `Exception\MoodleVersionException`                                                                                                                                       |
| Other host services        | `Mail\MoodleMailer`, `Filesystem\MoodledataFilesystem`, `Hook\AbstractExtendExtensions`, `Persistence\UpgradeHelper`, `Shared\Enum\TextFormat`, `Shared\Util\Debug` and `Shared\Util\Environment` |
| Composition root           | The concretes a consumer names when it wires the kernel (next table)                                                                                                                                                                          |

The composition-root concretes are public because a consumer must name them when it builds the container, not because their shape is a contract. Type your own code against the framework contract each one implements.

| Concrete (`@api`)                                                                                 | Role at boot                                                                                     |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `Runtime\Kernel`, `Runtime\ContainerFactory`                                                      | Boot the kernel and register the container builder                                               |
| `Runtime\MoodleHostContext`, `Runtime\MoodleComponentNameResolver`, `Runtime\Loader\FacadeLoader`, `Runtime\Loader\MoodleHookfileLoader` | Host context, component-name resolution, the façade loader and hookfile discovery at boot |
| `Config\ComponentContext`, `Settings\SettingsResolver`                                             | Plugin component and settings resolution                                                         |
| `Bus\MoodleUserContext`, `Bus\MoodleHostEventBridge`, `Bus\MoodleAdhocTransport`                   | User context, host event bridge and the ad hoc task transport                                    |
| `Logging\MoodleLogger`, `Logging\MoodleActorResolver`, `Logging\MoodleOriginResolver`              | Logging port                                                                                     |
| `Translation\MoodleTranslator`                                                                     | Translation port                                                                                 |
| `Database\Schema\XmldbSchemaAdapter`, `Persistence\VersionTracker`, `Persistence\Query\SqlGenerator` | Schema, version tracking and SQL generation                                                      |
| `Http\Routing\PluginAwareUrlGenerator`                                                             | Named only to exclude it from autowiring; do not extend or type-hint it                          |

What stays internal is the wiring a consumer never names: the concrete `Security\Authentication`, `Security\Authorizer` and `Security\Capability` (depend on the `Security\Contract\*` interfaces) and `Security\Enum\PermissionType`, the database connection adapter and SQL dialect, the config resolver, the maintenance gate, the bootstrap, `Http\Routing\MoodleRouter` (depend on `Http\Contract\RouterInterface`) and the convention helpers in `Support` (`CrudConventionResolver` and `TaskDefinitionBuilder`). The framework contracts the adapter implements are in the [Adapter Port Catalog](../../bridge-contracts).

In progress: the generated reference of the `@api` surface, with signatures and docblocks, is not published yet ([Documentation publication](/libraries/reference/publication#generated-api-reference)). The reference pages below describe the adapter's mechanisms.

## Changelog, decisions and help

- [`CHANGELOG.md`](https://github.com/middag-io/middag-php-moodle/blob/main/CHANGELOG.md) records every release; [Releases](https://github.com/middag-io/middag-php-moodle/releases) carry the tags.
- release-please cuts every release from Conventional Commits; there are no manual tags. The adapter shares only the MAJOR with the rest of the family: its MINOR and PATCH releases are its own, and its supported Moodle versions belong to it ([Lifecycle](/libraries/reference/versioning-and-compatibility#lifecycle)).
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
