---
title: 'moodle adapter — Config Schema Inventory & DSL Type Coverage'
---

# Config Schema Inventory & DSL Type Coverage

Reference for the `{slug}_config` enum inventory (product-level scale) and the `setting_type` DSL implementation coverage in `middag-io/moodle`. Backs [MDL-012](https://github.com/middag-io/middag-php-moodle/blob/docs/docs/decisions/MDL-012-config-schema-settings-support.md).

## Legacy config-key inventory (product-level, `local_middag`)

This inventory belongs to the consumer product (`local_middag`'s own extensions), not to this OSS adapter — it is reproduced here as the historical scale the config-schema mechanism was built to support.

| Metric | Count |
|---|---|
| Extensions with a `{slug}_config` enum (of 12 product extensions total) | 10 |
| Keys with storage | 60 |
| `storedfile` keys | 3 |
| `multiselect` keys | 1 |
| Lazy keys (`is_lazy() === true`) | 6 |

Extensions covered: `core`, `ecommerce`, `videolibrary`, `automessage`, `bigquery`, `opengraph`, `cleaner`, `sentry`, `coursegroup`, `helpdesk`.

- `core` has the largest enum, 15 keys — including `authprofilefield` (lazy, resolved via `user_support::get_options_for_user_fields()`) and `authsecretkey` (`password` type).
- `bigquery` has the largest concentration of lazy options (4), related to data retention and mode selection.

## DSL type coverage

`setting_type` covers 22 variants total (19 with storage, plus 3 display-only: `heading`, `description`, `link`). The legacy plugin (`ref-312-01`, 2026-04-09) had only 8 implemented, with 14 reserved-but-unimplemented. This adapter has since closed that gap — verified against real code on 2026-07-17, `src/Settings/Type/` now contains all 22.

| Setting type | Legacy (`ref-312-01`, 2026-04-09) | This adapter (verified 2026-07-17) |
|---|---|---|
| `text` | implemented | implemented |
| `checkbox` | implemented | implemented |
| `select` | implemented | implemented |
| `password` | implemented | implemented |
| `textarea` | implemented | implemented |
| `heading` | implemented | implemented |
| `description` | implemented | implemented |
| `link` | implemented | implemented |
| `autocomplete` | reserved, unimplemented | implemented — `Autocomplete.php` |
| `encrypted_password` | reserved, unimplemented | implemented — `EncryptedPassword.php` |
| `htmleditor` | reserved, unimplemented | implemented — `Htmleditor.php` |
| `colourpicker` | reserved, unimplemented | implemented — `Colourpicker.php` |
| `duration` | reserved, unimplemented | implemented — `Duration.php` |
| `time` | reserved, unimplemented | implemented — `Time.php` |
| `multicheckbox` | reserved, unimplemented | implemented — `Multicheckbox.php` |
| `multiselect` | reserved, unimplemented | implemented — `Multiselect.php` |
| `storedfile` | reserved, unimplemented | implemented — `Storedfile.php` |
| `filepath` | reserved, unimplemented | implemented — `Filepath.php` |
| `directory` | reserved, unimplemented | implemented — `Directory.php` |
| `executable` | reserved, unimplemented | implemented — `Executable.php` |
| `iplist` | reserved, unimplemented | implemented — `Iplist.php` |
| `portlist` | reserved, unimplemented | implemented — `Portlist.php` |
| **Total** | **8 / 22** | **22 / 22** |

This closes the gap the legacy ADR/REF pair documented as open — a genuine forward-progress finding, not a contradiction to flag as debt.

## Anti-patterns

| Anti-pattern | Why it's wrong |
|---|---|
| Using `get_config()` directly | Bypasses the typed schema — reads should go through `config_support`/`settings_support`. |
| Putting resolution logic in the `{slug}_config` enum | The enum must stay pure metadata; resolution logic belongs to the DSL/services layer. |
| Creating a config key with no matching enum case | Produces a "ghost" key that never appears in the schema. |
| Registering lazy options during `register()` | Services are not available at that phase (boot) — see the routing/lifecycle note below. |

## Related

- [MDL-011 — Admin Settings: Typed DSL Is the Only Interface](https://github.com/middag-io/middag-php-moodle/blob/docs/docs/decisions/MDL-011-admin-settings-declaration-lifecycle.md) — the settings declaration/registration lifecycle this schema plugs into; the boot-phase restriction on registering lazy options comes from that same lifecycle.
- [MDL-003 — Support Layer Pattern](https://github.com/middag-io/middag-php-moodle/blob/docs/docs/decisions/MDL-003-support-layer-pattern.md) — `settings_support` (the runtime API backed by this schema) is one of the `*_support` classes this pattern governs.
