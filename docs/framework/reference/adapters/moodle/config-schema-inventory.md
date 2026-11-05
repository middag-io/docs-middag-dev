---
title: 'Moodle Adapter — Config Schema Inventory (Downstream)'
---

# Config Schema Inventory

> **Downstream.** The OSS adapter ships the settings DSL, the naming policy and typed access by `{slug}_config` enum; see [Settings & Config Keys](./settings-and-config-keys), which also holds the DSL type-coverage table. The schema contract and the per-extension key inventory below belong to a proprietary package and product downstream. Names verified against the downstream code on 2026-11-04.

## The schema contract

Each extension with settings keeps one string-backed `{slug}_config` enum as the single source of truth for its keys. Downstream, that enum implements `ConfigSchemaInterface`, which makes type, default and static options queryable at any lifecycle phase without loading services:

```php
interface ConfigSchemaInterface {
    public function type(): string;     // host-specific type id (for Moodle, a SettingType value); treat as opaque
    public function default(): mixed;
    public function options(): ?array;  // null = no options, or options that need services (lazy)
    public function isLazy(): bool;     // true = options resolved at admin-page render time
}
```

Rules:

- A lazy setting returns `options() === null`; its real options are resolved only when the admin page renders, where services are available, never during `register()` or `compile()`.
- The enum never resolves dynamic options itself; it only marks `isLazy()`. Resolution belongs to the settings DSL. This keeps the enum pure metadata, cheap to query at any phase.

## Product key inventory (MIDDAG Moodle plugin)

This inventory belongs to the consumer product (the `local_middag` extensions), reproduced as the scale the schema mechanism was built for (reconstruction of April 2026).

| Metric                                                                 | Count |
| ---------------------------------------------------------------------- | ----- |
| Extensions with a `{slug}_config` enum (of 12 product extensions)      | 10    |
| Keys with storage                                                      | 60    |
| `storedfile` keys                                                      | 3     |
| `multiselect` keys                                                     | 1     |
| Lazy keys (`isLazy() === true`)                                        | 6     |

Extensions covered: `core`, `ecommerce`, `videolibrary`, `automessage`, `bigquery`, `opengraph`, `cleaner`, `sentry`, `coursegroup`, `helpdesk`.

- `core` has the largest enum, 15 keys, including `authprofilefield` (lazy, options from the user-field list) and `authsecretkey` (`password` type).
- `bigquery` has the most lazy options (4), for data retention and mode selection.

## Anti-patterns

| Anti-pattern                                         | Why it is wrong                                                                      |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `get_config()` directly                              | Bypasses the typed schema; read through `SettingsSupport` / `ConfigSupport`          |
| Resolution logic inside the `{slug}_config` enum     | The enum must stay pure metadata                                                     |
| A config key with no matching enum case              | A "ghost" key that never appears in the schema                                       |
| Resolving lazy options during `register()`           | Services are not available at that phase                                             |

---

Decision records: MDL-011 and MDL-012 in [`middag-php-moodle/docs/decisions`](https://github.com/middag-io/middag-php-moodle/tree/main/docs/decisions).
