---
title: 'Moodle Adapter — API Coverage & Version Gates'
---

# API Coverage & Version Gates

Reference for how `middag-io/moodle` covers Moodle's APIs: the runtime version gates that let one codebase serve every supported Moodle version, the coverage registry (tiers A, B and C), and the `@api`/`@internal` classification of the adapter's host surface. Verified against `middag-php-moodle` `main@6aae04d` on 2026-11-04.

## One codebase, runtime gates

There is no branch or package per Moodle version. The adapter's support floor is Moodle 4.5; an API that only exists on newer (or older) versions is gated at runtime, either by version range or by detecting the symbol, and degrades to a defined behavior when absent.

| Mechanism                         | API                                                                                                                                                   |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Version range                     | `VersionSupport::supports($feature, $matrix)` with `['since' => 'x.y', 'until' => 'x.y']` rules; `VersionSupport::atLeast()`, `between()`, `assertMin()` |
| Symbol detection                  | `VersionSupport::symbolExists($fqcn)` (classes, interfaces and traits); `method_exists()` for single methods                                         |
| Per-definition gate               | `min_moodle` / `max_moodle` on every `Definition/*` class, checked by `isCompatible($moodleVersion)` before a static file entry is emitted           |

## Version gates in the code

| API                              | Gate                                                                                                                                   | Behavior when unavailable                                                                                                   |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Hooks API                        | `HookDefinition` defaults to `min_moodle: '4.3'`                                                                                        | Hook entry not emitted into `db/hooks.php`                                                                                  |
| DI bridge (PSR-11 `\core\di`)    | `DiBridgeSupport::isAvailable()`: `supports('moodle_di_hook', ['since' => '4.4'])` and `symbolExists('core\hook\di_configuration')`        | Nothing exported to Moodle's container; the framework container is unaffected. See [DI Bridge](./di-bridge-mechanics)        |
| Native router                    | `RouterBridgeSupport::isAvailable()`: `supports('moodle_router', ['since' => '5.1'])` and `symbolExists('core\router\route_loader_interface')` | Proxy inactive; routing only through the consumer's own entry points. See [Routing Bridge](./routing-bridge-maturity)        |
| Bootstrap 5 navbar markup        | `NavbarService`: `VersionSupport::atLeast('5.0')`                                                                                       | Bootstrap 4 attributes (`data-toggle`, `dropdown-menu-right`) instead of `data-bs-toggle`, `dropdown-menu-end`               |
| Read-replica table pinning       | `DbSupport::markTablesForPrimary()`: `method_exists($DB, 'mark_tables_for_primary')` (Moodle 5.2+)                                       | No-op                                                                                                                       |
| Check API                        | No runtime gate: the API predates the 4.5 floor                                                                                        | n/a                                                                                                                         |

## Coverage registry

Every Moodle API the boundary might touch is classified into one of three tiers, each with standard justification language:

| Tier | Name                    | Pattern                                                               | When                                                                         | Justification                                                      |
| ---- | ----------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| A    | Full integration        | `*Support`, entities, DTOs, enums, definitions, port implementations, contracts | API consumed by 2+ extensions, or a cross-cutting concern                    | "Essential to the framework: {reason}"                             |
| B    | Compatibility interface | Minimal contract or light wrapper                                     | API consumed by specific extensions; absorbs breaking changes                | "Protection interface: {reason}. Priority: {high\|medium\|low}"    |
| C    | Out of scope            | No artifact                                                           | Does not apply to the framework's purpose, or covered by its own mechanism   | "Out of scope: {reason}"                                           |

Admission to tier A requires 2+ real call sites, a wrapper that follows the [support pattern](./support-class-inventory), entities and DTOs that follow the [host domain layout](../../module-layout-convention#moodle-adapter-host-domain-surface), an updated [boundary allowlist](./boundary-whitelist), and, when the integration is non-trivial (DI, routing), its own decision record. A tier B interface is promoted to A once it has 3+ distinct operations or 2+ consuming extensions. The registry is reviewed by event (a new Moodle major version, a new extension, a product-discovery gap), not on a calendar.

### Tier A — 45 APIs

Access/Capability, Authentication, Backup/Restore, Cache, Config, Context, Course/Category/Cohort, DML, Enrolment, Events, External Services/Web Services, File, Form, Grade, Groups, Hooks, HTML Writer, Logging, Message, Navigation, Output/Rendering, Page, Plugin, Privacy (GDPR), Role, Session, Settings (Admin), String/i18n, Task, Upgrade, URL, User, Version, Preference, Calendar, Lock, Custom Fields, Check, Notification, Time, Competency, Routing (5.1+), DI (PSR-11, 4.4+).

All are available on the 4.5 floor except the gated rows in the table above. The registry was reconstructed when the legacy plugin had 38 wrappers; the adapter now has 42 (see [Support Layer](./support-class-inventory)).

### Tier C — out of scope

| #   | API                    | Justification                                                                                                                  |
| --- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| C01 | DDL (data definition)  | Persistence goes through the framework's repositories and schema adapter; tables live in `install.xml`                         |
| C02 | Deprecation            | The framework has its own deprecation model, independent of Moodle's `debugging()`                                             |
| C03 | Search (global search) | Global-search indexing is the extension's responsibility, through `\core_search\base` directly                                 |

## `@api` / `@internal` classification

Every class in `src/` carries an explicit stability tag. The default for the host domain surface is `@api`: extensions and external plugins consume the typed wrappers directly, so treating them as internal would be fiction. A class opts out with an explicit `@internal` tag.

| Area                                                                                                                             | Tag         | Notes                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Domain/*` entities, DTOs, enums and `Contract/` interfaces; `Domain/AbstractMoodleEntity`                                       | `@api`      | Includes `CalendarEventDto` and `NotificationDto`                                                                                                             |
| Infrastructure-only DTOs                                                                                                         | `@internal` | `Domain/Task/AdhocTaskDto`, `RunningTaskDto`, `ScheduledTaskDto`, `TaskSummaryDto`, `Domain/Platform/PluginDto`                                                |
| `Domain/*` service implementations                                                                                               | `@internal` | `EnrolmentService`, `FileService`, `GroupService`, `MessageService`, `PlatformService`, `AdhocService`, `ScheduledService`, `UserService`; consume them through their `Contract/` interface |
| `Definition/`, `Settings/` (DSL, `SettingsResolver`, `SettingsNamingPolicy`), `Privacy/Contract/`, `Domain/File/Contract/FileAreaHandlerInterface`, `Domain/Backup/Contract/BackupStepsProviderInterface` | `@api`      | Safe to import directly                                                                                                                                       |
| `Support/*Support`, `Support/Moodle`                                                                                             | `@api`      | Except `DiBridgeSupport`, `RouterBridgeSupport`, `TaskDefinitionBuilder`, `CrudConventionResolver` (`@internal`)                                              |
| `Runtime/Kernel`, `Bus/MoodleHostEventBridge`                                                                                    | `@api`      | The consumer's composition root drives them                                                                                                                   |
| Port implementations wired by the container (`MoodleConfigResolver`, `MoodleConnectionAdapter`, `MoodleSqlDialect`, `TransactionManager`, `MoodleBootstrap`, `MoodleMaintenanceGate`), `Http/` controllers, kernel, routing and Inertia bridge, `Form/`, `Security/` implementations, `Output/NavbarService`, `Output/Widget`, `Output/AbstractBlock` | `@internal` | Bind or consume them through the framework port or the local `Contract/` interface, never by importing the concrete class                                     |

An `@api` class enters the API evolution and deprecation cycle of the family's `1.x` policy (`API-STABILITY.md` in each repository): a breaking change goes through deprecation, never a silent rename.

## Enforcement state

| Check                                                                       | State                                                                    |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Tier A admission (call-site count, promotion criteria)                      | **planned** — no automated check                                         |
| `@internal` classes are not imported from outside a facade or DI seam       | **planned** — no static-analysis rule restricts imports across the tags  |
| Entities and DTOs default to `@api` unless tagged `@internal`               | **planned** — no automated check; the tag is present on every class today |

---

Decision records: MDL-002 and MDL-005 in [`middag-php-moodle/docs/decisions`](https://github.com/middag-io/middag-php-moodle/tree/main/docs/decisions).
