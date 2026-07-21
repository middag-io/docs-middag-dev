---
title: 'moodle — Event Observation: Inbound Paths, Naming & Anti-Patterns'
---

# Event Observation: Inbound Paths, Naming & Anti-Patterns

Reference for how the Moodle adapter (`middag-io/middag-php-moodle`) observes native Moodle events (inbound) and emits its own domain activity into Moodle's logstore (outbound). Backs [MDL-015](https://github.com/middag-io/middag-php-moodle/blob/docs/docs/decisions/MDL-015-moodle-event-observation-model.md).

## Inbound paths, in order of preference

| Path | Mechanism | When to use |
|---|---|---|
| Attribute-based (preferred) | `#[moodle_event(...)]` on the signal class, auto-discovered by `moodle_signal_loader` | Default choice — zero registration boilerplate. Requires the file to be suffixed `_signal.php`; without it, the attribute is present but discovery silently does not happen. |
| Bridge registration | `moodle_event_bridge::register()` / `register_declarative()`, called from `boot()` | Middle-ground path when the attribute convention doesn't fit. |
| Manual observer | `middag_observer` with explicit signal publication | Only when the Moodle event needs data enrichment before becoming an internal signal — not for simple pass-through mappings. |

## Duplicate registration

Registering the same Moodle event class through more than one of the three paths above is a configuration error. In practice, the bridge resolves it by **last-write-wins, silently** — no fallback, no hard failure. This is looser than the item-type system's identifier-collision rule (a separate mechanism), which treats a collision as fatal rather than resolved by precedence.

## Signal naming

Hierarchy defined by `aggregate_signal_interface`:

| Form | Pattern | Use |
|---|---|---|
| General | `middag/{aggregate}/{action}` | Default signal name. |
| Specific | `middag/{aggregate}/{action}/{type}` | Variant scoped to a type. |

## Outbound naming

Generated event classes are named `{extension}_{entity}_{action}`, under the namespace `\local_middag\event\` (or `\{plugin}\event\` for external plugins), extending `\core\event\base`. Generation itself is handled by the static-generation pipeline — see [MDL-016](https://github.com/middag-io/middag-php-moodle/blob/docs/docs/decisions/MDL-016-moodle-statics-generation.md).

## External plugin extension point

`{plugin}_extend_local_middag_moodle_signal_loader(array $dirs): array` is the single hook an external plugin implements to expose its own signal-class directories to the loader.

## Anti-patterns

| Anti-pattern | Why it's wrong |
|---|---|
| Registering the same event through two different paths | Last-write-wins resolves it silently — the losing registration simply never fires, with no error raised to signal the mistake. |
| `#[moodle_event]` on a class without the `_signal.php` suffix | Not discovered — silently, since the attribute is syntactically valid but never scanned by the loader. |
| Manual observer for a direct, no-enrichment mapping | Unnecessary boilerplate when the attribute path would do. |
| `catch_all` (wildcard) left ON in production | Real performance cost — invoked for every Moodle event site-wide. |
