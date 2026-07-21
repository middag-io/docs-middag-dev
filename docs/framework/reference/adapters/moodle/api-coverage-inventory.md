---
title: 'moodle — API Coverage Inventory'
---

# API Coverage Inventory

Reference for the Moodle adapter's (`middag-io/middag-php-moodle`) full API coverage registry: the Tier A list, the version-guard table for conditionally-available APIs, the `@api`/`@internal` classification, and the Tier C (out-of-scope) list. Backs [MDL-005](https://github.com/middag-io/middag-php-moodle/blob/docs/docs/decisions/MDL-005-api-coverage-registry.md).

## Tier A — 45 APIs, full integration

Coverage is essentially complete across Moodle's core areas:

Access/Capability, Authentication, Backup/Restore, Cache, Config, Context, Course/Category/Cohort, DML, Enrolment, Events, External Services/Web Services, File, Form, Grade, Groups, Hooks (4.4+), HTML Writer, Logging, Message, Navigation, Output/Rendering, Page, Plugin, Privacy (GDPR), Role, Session, Settings (Admin), String/i18n, Task, Upgrade, URL, User, Version, Preference, Calendar, Lock, Custom Fields, Check, Notification, Time, Competency, Routing (5.1+), DI (PSR-11, 4.4+).

All 45 entries are available since Moodle 4.5 (the adapter's general minimum supported version) **except** the four version-gated APIs below (Hooks, Check, Routing, DI).

## Version guards (conditional availability)

| API         | min_moodle | Guard mechanism                                                                                  | Behavior if unavailable                                                                                                                                                                          |
|-------------|------------|----------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Hooks       | 4.4        | `min_moodle: '4.4'` on the hook definition                                                         | Hook not registered                                                                                                                                                                                 |
| Check       | 4.0        | `class_exists('core\check\check')`                                                                | Check definitions silently ignored                                                                                                                                                                 |
| Routing     | 5.1        | `class_exists('core\router\route_loader_interface')` via `router_bridge_support::is_available()`  | Proxy inactive below 5.1; routing via MIDDAG entry points only. On Moodle ≥ 5.1 the availability/discovery half of the bridge is confirmed active in code — see the routing bridge reference below for the precise maturity split. |
| DI (PSR-11) | 4.4        | `version_support::supports('moodle_di_hook')`                                                     | Services not exposed to Moodle DI; framework isolated                                                                                                                                              |

Routing bridge maturity detail lives in the routing-bridge coexistence reference for [MDL-017](https://github.com/middag-io/middag-php-moodle/blob/docs/docs/decisions/MDL-017-routing-bridge-coexistence.md).

## `@api` / `@internal` classification by artifact

| Namespace pattern                                                                     | Classification | Consumption rule                                  |
|-----------------------------------------------------------------------------------------|-----------------|-----------------------------------------------------|
| `moodle/entity/*`, `moodle/contract/*`, `moodle/definition/*`, `moodle/enum/*`, `moodle/settings/*` | `@api`          | Safe to import directly.                             |
| `moodle/support/*`, `moodle/adapter/*`                                                  | `@internal`     | Consume via facade or inject via DI — never import directly. |

This resolves a practical ambiguity left open between [MDL-004](https://github.com/middag-io/middag-php-moodle/blob/docs/docs/decisions/MDL-004-entities-dtos-as-public-api.md) (entities/DTOs are Tier A / public API) and [MDL-001](https://github.com/middag-io/middag-php-moodle/blob/docs/docs/decisions/MDL-001-boundary-consolidation-whitelist.md)/[MDL-002](https://github.com/middag-io/middag-php-moodle/blob/docs/docs/decisions/MDL-002-boundary-internal-organization.md) (boundary organization): an adapter is never public API, full stop.

## Tier C — 3 out-of-scope APIs

| # | API | Justification |
|---|---|---|
| C01 | DDL (Data Definition) | Persistence is governed by persistence families and the repository boundary; tables live in `install.xml`. |
| C02 | Deprecation | The framework has its own deprecation model, independent of Moodle's `debugging()`. |
| C03 | Search (Global Search) | The framework has its own query engine; global-search indexing is the extension's responsibility via `\core_search\base` directly. |

## Related counts

38 original legacy support classes plus 2 bridges (40 total) map to the 45 Tier A APIs above, at the time this registry was last reconstructed. The current support-class count for this adapter may have moved since — see [MDL-003](https://github.com/middag-io/middag-php-moodle/blob/docs/docs/decisions/MDL-003-support-layer-pattern.md) and its companion reference for the up-to-date figure.
