---
title: 'moodle adapter — DI Bridge Mechanics & Consumption Patterns'
---

# DI Bridge Mechanics & Consumption Patterns

Reference for consuming MIDDAG framework services from Moodle's native PSR-11 container (`\core\di`, Moodle 4.4+). Backs [MDL-006](https://github.com/middag-io/middag-php-moodle/blob/docs/docs/decisions/MDL-006-di-bridge-container-interoperability.md).

The bridge is **outbound-only**: the framework exposes a curated set of services into Moodle's container; there is no reverse path. Framework code never resolves Moodle services via `\core\di::get()` — that always goes through the boundary (support/adapter).

## Consuming a MIDDAG service from external code

| Context | Code |
|---|---|
| Via Moodle DI (recommended, plugins >= 4.4) | `$middag = \core\di::get(\local_middag\middag::class);`<br>`$service = $middag->container()->get(SomePublicService::class);` |
| Auto-wiring in a native Moodle controller (>= 4.4) | `class my_controller { public function __construct(private \local_middag\middag $middag) {} }` |
| Fallback for Moodle < 4.4 (inside the plugin only) | `if (di_bridge_support::is_available()) { $middag = \core\di::get(...); } else { $middag = middag::get_instance(); }` |

## Exposure model

| Property | Value |
|---|---|
| Registration mechanism | `di_bridge_support::configure(\core\hook\di_configuration $hook)`, wired via the `di_configuration` hook |
| Availability gate | `di_bridge_support::is_available()` — `version_support::supports('moodle_di_hook')` plus a `class_exists()` check |
| Minimum Moodle version | `4.4`, enforced via `min_moodle: '4.4'` on the hook callback so it never runs on older hosts |
| Exposure criterion | Manual and deliberate — only `@api` (Group A) services with demonstrated external-consumer utility; no auto-discovery |
| Extension exports | `get_extension_exports()` reserved for future use — returns an empty array today; requires a concrete consumer before it's filled in |

## Error isolation

Exceptions thrown inside `configure()` are caught and traced, never propagated into the Moodle DI boot sequence. This matters operationally: a boot-time throw here could otherwise break the whole site. Isolation is per-export — one export the DI builder rejects does not abort registration of the exports that follow it in iteration order.

## Anti-patterns

| Anti-pattern | Why it's wrong |
|---|---|
| An external plugin resolving an `@internal` service via `$middag->container()->get()` | `@internal` services are not part of the supported external surface, curated or otherwise. |
| The framework resolving anything via `\core\di::get()` directly | Reintroduces the ad hoc platform coupling the boundary exists to prevent — framework access to Moodle always goes through the boundary (support/adapter). |
| Exporting a service with no concrete consumer | The exposed surface is deliberately small and justified by demonstrated need, not speculative completeness. |
| Ignoring `is_available()` before calling into Moodle DI | Fatal error on Moodle < 4.4 — the hook and `\core\di` do not exist there. |
| Auto-discovery of exports | The curated, manual `EXPORTS` list is a deliberate design choice, not an oversight to fix later. |
