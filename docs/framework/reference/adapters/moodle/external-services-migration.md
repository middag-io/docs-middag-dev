---
title: 'Moodle Adapter — External Services & Mobile API'
---

# External Services & Mobile API

Reference for exposing Moodle External Functions (`db/services.php`) through `middag-io/moodle`. Verified against `middag-php-moodle` `main@6aae04d` on 2026-11-04.

## The flow

1. An extension declares its functions with `getServiceDefinitions()`, returning `Definition\ServiceDefinition` objects (`name`, `classname`, `type`, `method`, `description`, `ajax`, `services`, `capabilities`, `min_moodle`, `max_moodle`). Named service groups use `Definition\WebServiceDefinition` (`getWebServiceDefinitions()`).
2. The static generator writes `db/services.php`, pointing each function's `classname` at the extension's external class. The file is generated, never edited by hand (see [Static Generation](./statics-generation)).
3. Moodle resolves and invokes that class directly. There is no indirection through a plugin-root `external.php`.

External classes extend `WebService\AbstractExternal` (`@api`), which extends Moodle's `core_external\external_api` and marks the extension point. The function name Moodle sees is `{plugin_name}_{name}` (`ServiceDefinition::getQualifiedName()`); `methodname` defaults to `name` when `method` is null.

`capabilities` is advisory metadata in `db/services.php`; the external method still enforces access itself.

A plugin-root `external.php`, where a consumer keeps one, exists only because some plugin layouts expect it. It never orchestrates or routes external functions.

## Mobile API

Including `MOODLE_OFFICIAL_MOBILE_SERVICE` in a definition's `services` array publishes the function in Moodle's official mobile app service.

## Anti-patterns

| Anti-pattern                                                          | Why it matters                                                                       |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Editing `db/services.php` by hand                                     | The generator overwrites it on the next run; manual edits are lost                   |
| Business logic in the external class                                  | The external class is a boundary adapter; delegate to a service or command           |
| Using `external.php` as a dispatcher                                  | It is plugin-API scaffolding, not a router                                           |
| Forgetting `self::validate_parameters()`                              | A security defect, not a style issue                                                 |
| `type: 'read'` for an operation that changes state                    | Moodle lets a `read` call through without a sesskey; any mutation must be `write`    |
| Renaming a published function                                         | Breaks every client already calling it, including the mobile app                     |

## Consumer section: legacy migration (MIDDAG product)

This section describes the MIDDAG Moodle plugin (`local_middag`), not the adapter. It is kept here as the worked migration example.

Part of the product's externals predate the generated convention and are still being migrated per extension:

| Extension   | Status                  |
| ----------- | ----------------------- |
| `core`      | New style (migrated)    |
| `helpdesk`  | Legacy                  |
| `trilha`    | Legacy                  |
| `studyplan` | Legacy                  |

Legacy shape: the external class lives at `classes/extensions/{slug}/legacy/classes/external.php`, is declared by hand in `legacy/db/services.php`, sometimes under an older namespace (`mtool_*`), outside the generation pipeline. The new-style class is a dedicated `{slug}_external` at `classes/extensions/{slug}/{slug}_external.php`.

| Step | Action                                                                                         |
| ---: | ---------------------------------------------------------------------------------------------- |
|    1 | Move the external class out of `legacy/`                                                       |
|    2 | Rename the namespace to the current convention                                                 |
|    3 | Declare the function through `getServiceDefinitions()` with a `ServiceDefinition`              |
|    4 | Remove `legacy/db/services.php`                                                                |
|    5 | Regenerate `db/services.php`                                                                   |
|    6 | Keep the public function name (`local_middag_{name}`) so existing clients do not break         |

Step 6 is the one mistake with real blast radius. Adding a new external under `legacy/` is not allowed: `legacy/` is migration debt, not a place to grow.

---

Decision records: MDL-007 and MDL-016 in [`middag-php-moodle/docs/decisions`](https://github.com/middag-io/middag-php-moodle/tree/main/docs/decisions).
