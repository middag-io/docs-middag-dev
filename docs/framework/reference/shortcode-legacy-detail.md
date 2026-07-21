---
title: 'framework — WordPress-Style Shortcode Processing (Legacy Detail)'
---

# WordPress-Style Shortcode Processing — Legacy Detail

Historical only — **none of the mechanism below ships in `middag-io/framework` today**. The macro-parsing engine did not carry over into the standalone OSS package; only the sanitize-by-default / `#[TrustedOutput]`-opt-out safety posture it originated survives, generalised as a framework attribute. This page preserves the legacy design in case a host adapter (Moodle, WordPress) ever wants to rebuild an equivalent text-macro feature over its own content-authoring model. Backs [FW-009](https://github.com/middag-io/middag-php-framework/blob/docs/docs/decisions/FW-009-shortcode-processing.md).

## Interface shape (legacy)

```php
interface shortcode_manager_interface {
    public function register(string $tag, callable $callback): void;
    public function render(string $text): string;
    public function has(string $tag): bool;
    public function clear(): void; // testing/reset
}
```

## Macro syntax & parsing

| Element | Detail |
|---|---|
| Macro form | `[middag type="xyz" attr1="val1"]` |
| Fast path | Early-return skip of all regex work when the literal substring `[middag` is absent from the input — the cheapest path for the common case (prose with no macros at all). |
| Main regex | `/\[middag\s+(.*?)\]/i` |
| Attribute regex | `/(\w+)\s*=\s*(["\'])(.*?)\2/` |
| Case sensitivity | Tags are case-insensitive by design. |
| Registration | Manual only — `register(tag, callback)` at boot. No auto-discovery. |

## Security model

| Rule | Behavior |
|---|---|
| Default | Output sanitized via the host's own text-cleaning function (e.g. Moodle's `clean_text()`). |
| Opt-out | A handler declares `#[trusted_output]` to disable sanitization for its own output — detected via reflection, cached per tag. |
| Responsibility | Declaring `#[trusted_output]` transfers XSS responsibility for that output entirely to the handler's author; the marker only disables the *automatic* pass, it does not escape anything itself. |

## Failure handling

Aligned with the reactive-model rule ([FW-007](https://github.com/middag-io/middag-php-framework/blob/docs/docs/decisions/FW-007-signal-hook-reactive-model.md)): a step's failure accompanies the caller only when that step composes the contract the caller was promised.

| Situation | Behavior | Why |
|---|---|---|
| Malformed macro | Ignored silently (fail-safe) | A broken macro in user-authored prose should not break the whole page. |
| Tag with no registered handler | Ignored silently (fail-safe) | Same reasoning — an unknown macro is not a caller-visible error. |
| Exception from a valid, registered handler | Propagates normally | Rendering that handler's output is part of the contract the final HTML response promises its caller — output composition is not lateral. |

## Anti-patterns

| Anti-pattern | Why it's a problem |
|---|---|
| Producing HTML output with no `#[trusted_output]` marker | The output silently disappears after the default sanitization pass. |
| Declaring `#[trusted_output]` without separately escaping user-supplied data inside that output | A direct XSS hole — the marker only disables *automatic* sanitization, not the handler's own responsibility to escape untrusted fragments. |
| A handler with database write side effects | Shortcodes execute on every render of a piece of text, so a handler must be idempotent and read-only; a write-on-render handler fires repeatedly with no user-initiated action. |

## What survives today

None of the parsing/registration mechanism above ships in this framework. What generalised and does ship: `Shared/Attribute/TrustedOutput.php` (`#[TrustedOutput]`) — the same sanitize-by-default / explicit-opt-out posture, decoupled from shortcode handlers specifically and available to any renderer in the ecosystem.
