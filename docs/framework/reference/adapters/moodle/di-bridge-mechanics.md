---
title: 'Moodle Adapter — DI Bridge Mechanics & Consumption Patterns'
---

# DI Bridge Mechanics & Consumption Patterns

Reference for exposing framework services to Moodle's native PSR-11 container (`\core\di`, Moodle 4.4+) through `Support\DiBridgeSupport`. Verified against `middag-php-moodle` `main@6aae04d` on 2026-11-04.

The two containers stay separate. The bridge is **outbound only**: the consumer exposes a curated set of services into Moodle's container; there is no reverse path. Framework code never resolves a Moodle service through `\core\di::get()`; it goes through the boundary (a `*Support` wrapper or a port implementation). The framework's own container factory and its register/boot/compile lifecycle do not change.

| Direction                        | Mechanism                                                                                   | When                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Framework → Moodle DI (outbound) | `DiBridgeSupport::configure()` adds the registered exports to the `di_configuration` hook  | Expose a service to external plugins and native controllers |
| Moodle DI → framework (inbound)  | None. The boundary encapsulates access                                                      | The framework needs a Moodle service                       |

## Exposure model

| Property               | Value                                                                                                                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What is exported       | Nothing by default. The adapter is product-agnostic; the consumer's composition root calls `DiBridgeSupport::registerExport(string $id, callable $factory)` for each `@api` service it wants visible (typically its own facade) |
| Registration           | `DiBridgeSupport::configure(object $hook)` receives `\core\hook\di_configuration` and calls `$hook->add_definition($id, $factory)` for each export                                                                              |
| Hook wiring            | The consumer's `db/hooks.php` entry for `di_configuration`, declared with `min_moodle: '4.4'` so it never runs on older hosts                                                                                                    |
| Availability check     | `DiBridgeSupport::isAvailable()`: `VersionSupport::supports('moodle_di_hook', ['since' => '4.4'])` and `VersionSupport::symbolExists('core\hook\di_configuration')`                                                             |
| Introspection          | `DiBridgeSupport::getExportedServiceIds()` returns only ids actually pushed into Moodle's builder; empty before `configure()` runs and on hosts without the hook                                                                 |
| Exposure criterion     | Manual and deliberate: only `@api` services with a demonstrated external consumer; no auto-discovery                                                                                                                            |
| Extension exports      | A private `getExtensionExports()` is reserved for extensions that export their own services; it returns an empty array until a concrete consumer justifies it                                                                  |
| Moodle class references | `\core\di` and `\core\hook\di_configuration` are referenced only as strings, so the class still autoloads on Moodle < 4.4                                                                                                    |

## Consuming an exported service

The examples assume the consumer exported its facade class `\local_example\facade::class`.

| Context                                         | Code                                                                                                                                         |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Moodle DI (recommended, Moodle 4.4+)            | `$facade = \core\di::get(\local_example\facade::class);`                                                                                     |
| Autowiring in a native Moodle controller (4.4+) | `public function __construct(private \local_example\facade $facade) {}`                                                                     |
| Inside the consumer plugin, any version         | `DiBridgeSupport::isAvailable() ? \core\di::get(...) : <the consumer's own accessor>`                                                        |

## Error isolation

`configure()` catches and traces (`Debug::traceException()`) any exception thrown while adding a definition; nothing propagates into Moodle's DI boot, where a throw could break the whole site. Isolation is per export: one id the builder rejects does not stop the exports after it.

## Anti-patterns

| Anti-pattern                                                              | Why it is wrong                                                                         |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| An external plugin resolving an `@internal` service through the export    | `@internal` services are not part of the supported external surface                     |
| Framework or adapter code calling `\core\di::get()`                       | Reintroduces the platform coupling the boundary exists to prevent                       |
| Exporting a service with no concrete consumer                             | The exposed surface stays small and justified by need                                   |
| Calling into `\core\di` without checking `isAvailable()`                  | Fatal error on Moodle < 4.4, where the hook and `\core\di` do not exist                 |
| Auto-discovering exports                                                  | The curated, manual list is the design                                                  |

## Enforcement state

| Clause                                                                | Verification                                                                                                                         | State       |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| `configure()` never propagates exceptions and isolates failures per id | `tests/Support/DiBridgeSupportCoverageTest.php` (`testConfigureSwallowsHookErrors`, `testConfigureIsolatesAFailingExportPerId`)        | **coded**   |
| `isAvailable()` gates the bridge to Moodle 4.4+                       | same file (`testIsAvailableReturnsTrueOnSupportedMoodle`, `testIsAvailableReturnsFalseOnUnsupportedMoodle`)                          | **coded**   |
| Only confirmed ids are reported                                       | same file (`testGetExportedServiceIdsIsEmptyUntilConfigured`, `testGetExportedServiceIdsListsIdsAfterConfigure`)                      | **coded**   |
| No framework code resolves through `\core\di::get()`                  | No architecture check                                                                                                                 | **planned** |
| Exports stay manual and curated                                       | No automated check                                                                                                                    | **planned** |

---

Decision record: MDL-006 in [`middag-php-moodle/docs/decisions`](https://github.com/middag-io/middag-php-moodle/tree/main/docs/decisions).
