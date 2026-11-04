---
title: 'Moodle Adapter — Boundary & Whitelist'
---

# Boundary & Whitelist

Reference for the Moodle boundary of `middag-io/moodle` ([middag-php-moodle](https://github.com/middag-io/middag-php-moodle)): which code may call native Moodle APIs, what each wrapper is allowed to call, the files a consumer plugin must keep thin, and the current state of the enforcement tooling. Verified against `middag-php-moodle` `main@6aae04d` on 2026-11-04.

## The rule

Only this adapter package calls Moodle APIs. A consumer (domain code, services, extensions, a product) reaches Moodle through the adapter: through a framework port the adapter implements (see [Adapter Port Catalog](../../bridge-contracts)), through a host domain service in `Domain/<Subsystem>/`, or through a `*Support` wrapper. The adapter itself never imports proprietary code and never carries a product identity: the component name reaches it at runtime (`Config\ComponentContext`, `Runtime\MoodleHostContext`).

Inside the package, direct Moodle calls are concentrated in `Support/` (stateless wrappers, see [Support Layer](./support-class-inventory)). The port implementations (`Database/`, `Logging/`, `Mail/`, `Translation/`, `Filesystem/`, `Bus/`, `Http/`, `Runtime/`), the host domain services (`Domain/*/*Service`), the settings DSL (`Settings/`), the form renderer (`Form/MformRenderer`) and the privacy provider (`Privacy/`) are also inside the boundary.

### What counts as a violation

A violation is Moodle coupling outside the boundary:

- an import of a Moodle namespace or type that does not go through the adapter: `\core\*`, `\core_*`, `\mod_*`, another plugin's `\local_*`, or a `stdClass` returned by a Moodle API;
- a Moodle global (`$DB`, `$CFG`, `$PAGE`, `$OUTPUT`, `$USER`) used outside the boundary.

Pure PHP functions (`intval`, `array_map`, …) do not count.

## Per-wrapper allowlist highlights

Every `*Support` class exposes only the Moodle calls it exists to wrap. Anything else against the same Moodle API, from outside the boundary, is the anti-pattern.

| Wrapper                | Moodle API it wraps                                                                                                                                                              | Anti-pattern                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `DbSupport`            | `$DB` (`getRecord`, `getRecords`, `insertRecord`, `updateRecord`, `deleteRecords`, `execute`, delegated transactions, SQL helpers)                                               | `global $DB` in consumer code                                                                   |
| `CacheSupport`         | `cache::make()` and the MUC API (`get`, `set`, `getMany`, `setMany`, `delete`, `deleteMany`, `purge`, `getOrSet`); `CacheSupportPsr16` exposes the same store as PSR-16          | Calling `cache::make()` directly                                                                |
| `ContextSupport`       | `\core\context\*` (`system()`, `course()`, `coursecat()`, `module()`, `user()`, `block()`, `instanceById()`)                                                                      | `context_system::instance()` in consumer code                                                   |
| `CustomFieldSupport`   | `\core_customfield\handler` and its field/data controllers; returns primitives                                                                                                    | Leaking `core_customfield` types to consumers                                                   |
| `CompetencySupport`    | `\core_competency\api` (frameworks, competencies, user competencies, evidence)                                                                                                    | Calling `\core_competency\api` directly                                                         |
| `TaskSupport`          | `\core\task\manager` (scheduled and adhoc tasks)                                                                                                                                 | Queuing adhoc tasks through the manager directly                                                |
| `TimeSupport`          | `time()`, `userdate()`, `usertime()`, `core_date`                                                                                                                                | Formatting user dates with `userdate()` in consumer code                                        |
| `LockSupport`          | `lock_config` / lock factory (closure-based `execute()`)                                                                                                                         | Acquiring locks without release on every path                                                   |
| `CheckSupport`         | `\core\check\manager` / `\core\check\result`                                                                                                                                     | Instantiating check classes by hand                                                             |
| `RouterBridgeSupport`  | Moodle 5.1+ native router (`isAvailable()`, `register()`, `proxyRequest()`); see [Routing Bridge](./routing-bridge-maturity)                                                      | Manipulating `r.php` manually                                                                   |
| `DiBridgeSupport`      | `\core\hook\di_configuration`, `\core\di` (outbound only); see [DI Bridge](./di-bridge-mechanics)                                                                                  | Framework code calling `\core\di::get()` directly                                               |

The full class list is in [Support Layer](./support-class-inventory).

Two further allowances:

- Port implementations and host domain services may call `debugging()` and the already-wrapped auth/capability APIs.
- Definition classes (`Definition/`) and host enums express Moodle constants as typed values (for example `ContextLevel::toMoodleValue()`, `CacheMode`, `CapabilityRisk`). These are inert values, not behavior, so they need no wrapper.

## Files a consumer plugin must keep thin

Moodle's plugin API mandates files at fixed locations of the **consumer plugin**. This adapter ships none of them. Each may touch Moodle directly because the plugin contract requires it, but must stay a thin adapter or callback that delegates, never business logic.

| Consumer file                                            | Plugin-API obligation                  | Delegates to (in this adapter)                                               | Anti-pattern                                                         |
| -------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `settings.php`                                           | Admin settings entry point             | `Settings\SettingsResolver` (see [Settings & Config Keys](./settings-and-config-keys)) | Defining `admin_setting_*` objects inline                            |
| `lib.php`                                                | Plugin callbacks (navigation, pluginfile, …) | `Output\NavbarService`, file-area handlers, `Runtime\Kernel`                  | Callback bodies that implement instead of delegate                   |
| `db/install.php`, `db/upgrade.php`                       | Install and upgrade hooks              | `Persistence\UpgradeHelper`, `Database\Schema\XmldbSchemaAdapter`             | Schema or migration logic inline                                     |
| `classes/external/*` (or a legacy `external.php`)        | External functions                     | `WebService\AbstractExternal`, generated `db/services.php`                    | Service logic inside the external class; `external.php` as a router |
| `classes/event/*`, `classes/task/*`, `classes/privacy/*` | Event, task and privacy APIs           | Generated event classes, `Bus\MoodleAdhocTransport`, `Privacy\PrivacyProvider` | A provider or task that implements instead of delegates              |

## Mandatory plugin APIs are thin adapters

Moodle requires some APIs of every plugin that stores data or serves pages. The adapter implements each as a thin adapter that delegates to a contract; the consumer supplies the data and the storage.

| Plugin API                     | Adapter piece                                                                                                                       | What the consumer provides                                                                                                                       |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Privacy (GDPR)                 | `Privacy\PrivacyProvider` implements Moodle's privacy `provider` and `plugin\provider`; it never runs SQL itself                      | A `Privacy\Contract\PrivacyRepositoryInterface` binding for its own tables, table metadata through `PrivacyProvider::registerDataTable()`, and optional extension providers |
| Privacy for third-party storage | `Privacy\Contract\PrivacyProviderInterface` (`@api`)                                                                                | Services tagged `middag.privacy_provider` in the container; `PrivacyProvider` calls each after the central repository, in the container's tag order, and skips tagged services that do not implement the interface      |
| Backup and restore             | `Domain\Backup\Contract\BackupStepsProviderInterface` (`@api`): `getBackupSteps()`, `getRestoreSteps()`                              | One implementation per integration with its own storage; integrations that only use the central persistence need none. The import repository that rehydrates restored rows is downstream (see [Import Repository](./import-repository-contract)) |
| Pluginfile                     | `Definition\FileAreaDefinition`, `Domain\File\Contract\FileAreaHandlerInterface`                                                    | The `pluginfile` callback and the registry; see [File Areas](./file-areas-pluginfile-routing)                                                     |
| Navigation                     | `Output\NavbarService`, `Http\Inertia\InertiaSharedProps`                                                                           | The `lib.php` navigation callbacks; see [Navigation](./navigation-integration-detail)                                                            |
| Host page for the SPA          | `Http\Inertia\MoodleInertiaBootstrap`, `Support\ThemeSupport`                                                                        | The compiled frontend bundle; see [Frontend Build & Theme Bridge](./frontend-build-detail)                                                       |

`PrivacyProvider` catches any exception from the repository or an extension provider and returns a partial result instead of failing the privacy request. Its four operations (contexts for a user, export, delete for all users in a context, delete for a user) are covered by `tests/Privacy/PrivacyProviderCoverageTest.php`, including tagged-provider discovery.

## Static entry points

`lib.php` callbacks, Moodle hooks and cron run in procedural contexts that receive no dependency injection. The adapter therefore keeps a static, per-request kernel: `Runtime\Kernel` is a singleton (`Kernel::init()`, `Kernel::get()`, `Kernel::handle()`, `Kernel::shutdown()`) that compiles the container once per request. One Moodle plugin boots per request, so a single process-wide slot is safe here. The WordPress adapter makes the opposite choice for the opposite reason (several plugins share one PHP process); see [Adapter Port Catalog — host identity](../../bridge-contracts#host-identity-in-a-shared-process).

Facades over the support layer belong to the consumer, not to this package. `Support\Moodle` is a static aggregator that returns fresh `*Support` instances; generated facades live in the consumer plugin (`{component}\facade\...`).

## User-facing text

All user-facing text resolves through language strings: the framework `TranslatorInterface` (implemented by `Translation\MoodleTranslator`, which maps to `get_string()`) or `LangSupport`. Hard-coded PHP strings are reserved for technical messages (debugging, error logs).

## Enforcement state

The decision intends three complementary tools: an import-based check, a global-variable check, and a per-file refactoring exception list. As of `main@6aae04d`:

| Check                                                                                                       | State                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No consumer-plugin or proprietary namespace, no product table literals in `src/`                            | **coded** — `tests/AdapterPluginIsolationTest.php` (source scan, runs under `composer test`)                                                                                                 |
| Every class autoloads without a Moodle runtime (documented host-only exclusions)                            | **coded** — `tests/ClassLoadabilityTest.php`                                                                                                                                                |
| Import-based boundary check (dependency-boundary tool over a "Moodle internal" layer)                       | **planned** — no dependency-boundary tool is configured; `Output/NavbarService.php` mentions the intended layer in a docblock only                                                            |
| Moodle globals outside the boundary (custom static-analysis rule)                                           | **planned** — `.phpstan.neon` runs PHPStan level 6 with no custom rules (the intended rule was sketched as `NoInternalImportsFromExtensionsRule`)                                                                                                                       |
| Wrapper files exempted from refactoring rules that fight their repetitive shape                             | **planned** — `.php-rector.php` skips whole rule classes and `tests/phpstan`, not individual wrapper files such as `DbSupport.php`                                                                                   |
| Consumer plugin files stay thin                                                                             | **planned** — code review in the consumer                                                                                                                                                    |

## Why this is a reference page

The allowlist grows as Moodle subsystems get wrapped. The durable rule (the boundary, the thin-file obligation, the static entry point) lives in the decision record; per-API detail lives here so the record does not change every time a wrapper is added.

---

Decision record: MDL-001 in [`middag-php-moodle/docs/decisions`](https://github.com/middag-io/middag-php-moodle/tree/main/docs/decisions).
