---
title: 'Moodle Adapter — Support Layer & Anti-Patterns'
---

# Support Layer & Anti-Patterns

Reference for the `*Support` layer in `middag-io/moodle`: the stateless wrappers that sit between the boundary and Moodle's procedural APIs, one class per Moodle subsystem. Verified against `middag-php-moodle` `main@6aae04d` on 2026-11-04.

## What a `*Support` class is

| Property            | Rule                                                                                                                                                                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope               | One class per Moodle subsystem (`DbSupport`, `CacheSupport`, `ContextSupport`, …), in `src/Support/`, suffixed `*Support`                                                                                                                     |
| State               | None; static methods. Exceptions in the code today: `EventSupport`, `PluginSupport` and `TaskSupport` expose instance methods; `DiBridgeSupport` keeps a static export registry filled by the consumer                                        |
| Logic               | No business logic; interface translation only, never a behavior decision                                                                                                                                                                     |
| Return types        | Typed: Moodle's `false` / `stdClass` results become `?Type`, host entities or DTOs from `Domain/`                                                                                                                                              |
| Return semantics    | A lookup where "not found" is a legitimate flow returns `?Type`; an operation where absence means an invalid state may expose a throwing variant, or both                                                                                     |
| Dependencies        | `Shared/`, `Exception/`, `Config\ComponentContext`, host entities, DTOs and enums from `Domain/` (as return types), `Settings\SettingsNamingPolicy`, and framework `Shared` utilities. Never `Domain/*` services or `Http/`. The one documented exception is `RouterBridgeSupport`, which reaches `Runtime\Kernel` to dispatch proxied requests |
| Admission threshold | A new wrapper needs 2 or more real call sites consuming the same subsystem. A single-call convenience method is accepted for testability when no type transformation is involved                                                             |
| Layering            | Low level of the boundary. When a subsystem needs an OO contract for DI, a dedicated adapter delegates to the matching `*Support` (for example `Security\Capability` over `CapabilitySupport`, `Security\Authentication` over `AuthSupport`)                                                |

## Current inventory

42 `*Support` classes in `src/Support/`:

| Group                | Classes                                                                                                                                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data and persistence | `DbSupport`, `CacheSupport`, `ConfigSupport`, `PreferenceSupport`, `SettingsSupport`                                                                                                                           |
| Auth and access      | `AuthSupport`, `CapabilitySupport`, `SessionSupport`, `RoleSupport`                                                                                                                                            |
| Context and entities | `ContextSupport`, `UserSupport`, `UserFieldSupport`, `CourseSupport`, `CategorySupport`, `GroupSupport`, `CohortSupport`, `EnrolSupport`, `CompletionSupport`, `CustomFieldSupport`, `CompetencySupport` |
| Content and files    | `FileSupport`, `GradeSupport`                                                                                                                                                                                  |
| Presentation         | `PageSupport`, `OutputSupport`, `HtmlWriterSupport`, `UrlSupport`, `LangSupport`, `ThemeSupport`                                                                                                               |
| Communication        | `MessageSupport`, `EventSupport`, `NotificationSupport`, `CalendarSupport`                                                                                                                                     |
| Runtime              | `TaskSupport`, `CronSupport`, `PluginSupport`, `RequestSupport`, `VersionSupport`, `TimeSupport`, `LockSupport`, `CheckSupport`                                                                                |
| Bridges              | `DiBridgeSupport`, `RouterBridgeSupport`                                                                                                                                                                       |

Also in `src/Support/`:

- `Moodle`: a static aggregator. Each method (`Moodle::db()`, `Moodle::user()`, `Moodle::config()`, …) returns a fresh instance of the matching wrapper. It covers every wrapper except `CronSupport`.
- `CacheSupportPsr16`: the PSR-16 view of the plugin cache.
- `TaskDefinitionBuilder` and `CrudConventionResolver` (`@internal` helpers).

The legacy `moodle-local_middag` plugin had 38 wrappers (snake_case, for example `db_support`, `di_bridge_support`). Every one of them has a PascalCase counterpart above; `CompletionSupport`, `CronSupport`, `ThemeSupport` and `UserFieldSupport` were added during the OSS extraction.

## Facades belong to the consumer

The legacy plugin made facade consumption mandatory: every wrapper had a generated mirror facade, and importing the `support` namespace directly was an anti-pattern. This adapter ships no per-class facades. Facades are generated inside the **consumer** plugin (`{component}\facade\...`) by the consumer's own build tooling; the adapter provides only the generic mechanism (`Runtime\Facade\AbstractFacade`, `Runtime\Loader\FacadeLoader`).

Consequence: importing `Middag\Moodle\Support\*` directly is not an anti-pattern for code that depends on this package. The facade-bypass anti-pattern below applies only inside a consumer that has adopted a facade convention.

## Auth and capability: two consumption paths

`AuthSupport` and `CapabilitySupport` follow the wrapper pattern, but consumption is split by context:

| Path              | Mechanism                                                                                                                 | When                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| DI (preferred)    | `Security\Contract\AuthenticationInterface`, `AuthorizerInterface`, `CapabilityInterface` (implemented by `Security\Authentication`, `Authorizer`, `Capability`) | Controllers, services, extensions: anywhere DI is available       |
| Static (fallback) | `AuthSupport::requireLogin()`, `CapabilitySupport::has()`, …                                                              | Procedural contexts only: `lib.php`, navigation callbacks, install and upgrade |

## Anti-patterns

| Anti-pattern                                                                                | Why it is wrong                                                                  |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| A consumer extension importing a wrapper directly when the consumer has a facade convention | Defeats the indirection the consumer's facade layer exists to provide            |
| A wrapper carrying business logic                                                           | A wrapper translates; logic belongs in a service or the domain                   |
| Calling a Moodle API (`$DB`, `$PAGE`, …) outside the boundary                               | Bypasses the boundary entirely (see [Boundary & Whitelist](./boundary-whitelist)) |
| A new wrapper with a single call site                                                       | Below the 2-call-site admission threshold                                        |
| The static auth/capability fallback inside a controller                                     | Controllers always have DI                                                       |
| A wrapper depending on `Domain/*` services, `Http/` or `Runtime/`                           | Only the dependencies listed above are allowed (`RouterBridgeSupport` excepted)  |

## Enforcement state

None of the wrapper rules (one class per subsystem, statelessness, typed returns, the admission threshold, the dependency restriction, the DI-preferential rule) has a coded static-analysis check yet; they are reviewed at PR time.

---

Decision record: MDL-003 in [`middag-php-moodle/docs/decisions`](https://github.com/middag-io/middag-php-moodle/tree/main/docs/decisions).
