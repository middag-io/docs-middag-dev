---
title: 'Moodle Adapter — Event Observation: Inbound, Outbound & Naming'
---

# Event Observation: Inbound, Outbound & Naming

Reference for how Moodle events reach consumer code (inbound) and how consumer activity reaches Moodle's logstore (outbound). Verified against `middag-php-moodle` `main@6aae04d` on 2026-11-04.

## What ships where

| Piece                                                                                         | Where                     |
| --------------------------------------------------------------------------------------------- | ------------------------- |
| `Bus\MoodleHostEventBridge` (`@api`): the framework `HostEventBridgeInterface` over the bound `HookManagerInterface` | This adapter |
| `Domain\Event\Attribute\MoodleEvent` (`@api`): marks a signal class as the handler of a Moodle event | This adapter        |
| `Definition\EventDefinition` (`@api`): outbound event declaration                             | This adapter              |
| `Support\EventSupport`: lists core and plugin event classes, by educational level             | This adapter              |
| Typed Moodle-event-to-signal bridge, signal loader, observers, signal naming contract          | Downstream (proprietary)  |

## The generic host event seam (OSS)

`MoodleHostEventBridge` implements the framework's platform-agnostic `HostEventBridgeInterface`: `dispatch($eventName, $payload)` fires an action hook, `listen($eventName, $listener, $priority)` registers an action callback. Execution is synchronous and in-process. The consumer's composition root binds the concrete to the interface, so listeners depend only on the framework contract. This is the basic eventing seam; it does not map Moodle core events onto typed signals.

## Outbound: consumer activity into Moodle's logstore

Extensions declare `getEventDefinitions()` returning `EventDefinition` objects (`name`, `crud`, `edulevel`, `objecttable`, `description`, `min_moodle`, `max_moodle`). The static generator writes the `db/events.php` entries and one class per definition under the consumer's `classes/event/`, extending `\core\event\base` (see [Static Generation](./statics-generation)).

Generated class names come from `EventDefinition::getEventClassname($plugin_name, $extension)`: `\{plugin_name}\event\{extension}_{name}`, with no extension prefix for `core`. With `name` written as `{entity}_{action}` (for example `order_created`), the class is `{extension}_{entity}_{action}`. Outbound emission may also fire an internal signal.

## Inbound: Moodle events into signals (downstream)

> **Downstream.** The inbound machinery below lives in a proprietary package built on this adapter. Only the `#[MoodleEvent]` attribute is OSS.

Three inbound paths coexist, in order of preference:

| Path                        | Mechanism                                                                                                 | When                                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Attribute (preferred)       | `#[MoodleEvent(\core\event\user_enrolment_created::class)]` on the signal class, discovered by the signal loader | Default: no registration boilerplate. The file must end in `_signal.php`, or it is never scanned |
| Bridge registration         | The typed bridge's `register()` / `registerDeclarative()`, called from an extension's `boot()`              | When the attribute convention does not fit                                                   |
| Manual observer             | An observer class that publishes the signal itself                                                         | Only when the event needs data enrichment first                                              |

A class carrying `#[MoodleEvent]` must accept `\core\event\base` as its first (and only required) constructor argument.

Registering one Moodle event through more than one path is a configuration error. The bridge resolves it by **last write wins**, silently, with no fallback and no failure. This is looser than the item-type rule, where an identifier collision is fatal.

Observer modes:

| Mode                    | Behavior                                                       | Recommendation                                                       |
| ----------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------- |
| Explicit list (default) | Observers for the events the extensions list                   | Default in production                                                |
| Catch-all               | One wildcard (`*`) observer invoked for every Moodle event     | Gated by configuration (the legacy key was `moodle_events_catch_all`); keep it off in production (cost on every event site-wide) |

### Signal naming

Signals that represent an aggregate change name themselves hierarchically from `getAggregate()`, `getAction()` and `getType()`:

| Form     | Pattern                              | Use                       |
| -------- | ------------------------------------ | ------------------------- |
| General  | `middag/{aggregate}/{action}`        | Default signal name       |
| Specific | `middag/{aggregate}/{action}/{type}` | Variant scoped to a type  |

External plugins expose their signal-class directories to the loader through one hook the consumer provides (in the MIDDAG product: `{plugin}_extend_local_middag_moodle_signal_loader(array $dirs): array`).

## Anti-patterns

| Anti-pattern                                                  | Why it is wrong                                                                         |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Registering one event through two paths                       | Last write wins silently; the losing registration never fires and nothing reports it    |
| `#[MoodleEvent]` in a file without the `_signal.php` suffix   | Never scanned, silently                                                                 |
| A manual observer for a direct, no-enrichment mapping         | Boilerplate the attribute path removes                                                   |
| Catch-all left on in production                               | Invoked for every Moodle event on the site                                              |

---

Decision records: MDL-001 (inbound host seam), MDL-015 and MDL-016 (outbound generation) in [`middag-php-moodle/docs/decisions`](https://github.com/middag-io/middag-php-moodle/tree/main/docs/decisions).
