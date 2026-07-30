---
title: 'moodle adapter — Boundary Whitelist Detail'
---

# Boundary Whitelist Detail

Reference for the Moodle boundary in `middag-io/moodle` — which classes may call native Moodle APIs, what each is allowed to call, and the controlled exceptions to the whitelist model.

## Per-support-class allowlist highlights

Every `*Support` class exposes only the Moodle calls it exists to wrap. The correct usage is always via a consumer-side facade (legacy plugin) or direct injection (this OSS adapter); anything else against the same Moodle API is the anti-pattern. Highlights:

| Support class | Permitted Moodle calls |
|---|---|
| `db_support` | `$DB->get_record`, `get_records`, `insert_record`, `update_record`, `delete_records`, `execute` |
| `cache_support` | `cache::make()`, `cache_store::MODE_*` |
| `context_support` | `context_system::instance()`, `context_course::instance()`, `context_module::instance()` |
| `custom_field_support` | `\core_customfield\handler`, `field_controller`, `data_controller` |
| `competency_support` | `\core_competency\api`, `competency`, `competency_framework`, `evidence` |
| `router_bridge_support` | Bridges the framework's Symfony-based router to Moodle's native router; active only on Moodle >= 5.1 (`proxyRequest()`). Anti-pattern: manipulating `r.php` manually. See the [routing bridge coexistence decision](https://github.com/middag-io/middag-php-moodle/blob/docs/docs/decisions/MDL-017-routing-bridge-coexistence.md) for the current maturity split between the availability/discovery mechanism (active) and the proxy-forwarding method. |
| `di_bridge_support` | `\core\hook\di_configuration`, `\core\di`. Anti-pattern: any framework layer calling `\core\di::get()` directly instead of going through this support class. |
| `task_support` | Task API |
| `time_support` | `\core\clock`, `usertime()` |
| `lock_support` | `\core\lock\lock_factory` |
| `check_support` | `\core\check\check` |

Two further allowances beyond the per-class table:

- `adapter/`-equivalent classes may delegate to `debugging()` and to the already-encapsulated auth/capability APIs.
- Definition classes (for static generation) access pure Moodle constants directly — `cache_store::MODE_*`, `RISK_*`, `CONTEXT_*` — without needing a support-class indirection, since these are inert values, not behavior.

## Controlled exceptions — obligation and anti-pattern

Moodle's plugin API mandates a handful of files that must exist at fixed locations outside the boundary. Each carries an obligation: touch Moodle directly if the plugin contract requires it, but stay a thin adapter/callback — never carry business logic.

| File | Plugin-API obligation | Anti-pattern to avoid |
|---|---|---|
| `settings.php` | Must exist as the Moodle admin-settings entry point | Defining settings directly instead of delegating to `settings_resolver` — the obligation to exist outside the boundary never licenses business logic inside it |
| `lib.php` | Moodle's plugin lifecycle callbacks | Same shape: callback body must delegate, not implement |
| `db/install.php`, `db/upgrade.php` | Moodle's install/upgrade hooks | Same shape: delegate to the boundary, don't implement schema/migration logic inline |
| `external.php` | Moodle's web-service/external-function declarations | Same shape: declare and delegate, don't implement service logic inline |
| `classes/event/*`, `classes/task/*`, `classes/privacy/*` | Moodle's event, task, and privacy-provider APIs | Same shape: thin callback/provider that delegates to the boundary |

The other exceptions above follow the same obligation shape as `settings.php` (the one case with a concrete worked anti-pattern on record); treat "thin orchestrator, no inline business logic" as the general rule for all of them.

## Why this is a living inventory, not ADR text

This allowlist grows as new Moodle subsystems get wrapped. The durable rule (whitelist model, controlled-exceptions list, three-tool enforcement intent) lives in the decision record; this page is where per-API detail belongs so the decision itself doesn't need a revision every time a support class is added.

---

Decision record: [MDL-001 — Consolidate the Moodle Boundary Behind a Physical Whitelist](https://github.com/middag-io/middag-php-moodle/blob/docs/docs/decisions/MDL-001-boundary-consolidation-whitelist.md).
