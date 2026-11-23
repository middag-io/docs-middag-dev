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
