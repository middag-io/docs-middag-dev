---
title: 'framework — Form Field Type Catalog & Renderer Anti-Corruption'
---

# Form Field Type Catalog & Renderer Anti-Corruption

Reference for the field-type DSL and the renderer boundary in `middag-io/framework`'s form engine. Backs [FW-004](https://github.com/middag-io/middag-php-framework/blob/main/docs/decisions/FW-004-form-renderer-adapters-field-type-dsl.md). Provenance: legacy vault ADR-805 (renderer adapters) and ADR-806 (field type DSL), both 2026-04-13.

## Renderer boundary

A form renderer implements a two-method contract. No host-specific type — HTML form-builder markup, a template engine's node type, or anything else specific to one target — is allowed to cross this boundary into the shared `Form/` schema code:

```php
interface FormRendererInterface
{
    public function target(): RenderTarget;              // enum: which output shape this renderer produces
    public function render(FormInterface $form): RendererOutput;
}
```

`FormRendererInterface` itself lives in `middag-io/ui`, not in this framework package — the UI package owns the wire contract a renderer emits. `Form/Renderer/InertiaRenderer.php` is the one renderer this repo ships: it targets `RenderTarget::Inertia` and returns an array shape (`{schema, values, errors, meta}`) consumed directly by the Inertia SPA payload.

**The renderer never validates.** It only reads the form's already-computed state, including errors — validation happens exclusively in `Form`/`FormRequest`.

### Resolution: default + per-call override

A controller has one default renderer. A specific route can override it per call to target a different output. There is no global per-extension config and no per-user toggle — an override is always an explicit, per-call choice.

### Host widgets live only in adapter renderers

Host form widgets exist only inside renderers that ship with a host adapter, never in this framework's `Form/` code. The Moodle adapter's `MformRenderer` (`middag-php-moodle`, `src/Form/MformRenderer.php`) implements the same `FormRendererInterface` and maps the schema onto `MoodleQuickForm` through `MformFieldMapper`. The WordPress adapter ships no form renderer of its own and uses the framework's `InertiaRenderer`.

The legacy Moodle-era design had the same split: an `mform_renderer` producing `MoodleQuickForm` HTML as the default for host-page controllers. Nothing in this framework checks the boundary automatically; each adapter keeps its host-specific types inside its own renderer files.

## Field type catalog

`FieldFactory` is the closed, `@api` entry point for every field type — concrete field classes are `@internal`. New field types are added by adding a factory method (plus a backing enum case when needed), never by growing an open set of ad hoc classes.

| `FieldFactory` method | Backing class | Variant enum (`Middag\Ui\Shared\Enum\FieldType`) |
|---|---|---|
| `text()` | `TextField` | — |
| `email()` | `TextField` | `FieldType::Email` |
| `password()` | `TextField` | `FieldType::Password` |
| `url()` | `TextField` | `FieldType::Url` |
| `textarea()` | `TextareaField` | — |
| `integer()` | `IntField` | — |
| `decimal()` | `FloatField` | — |
| `select()` | `SelectField` | — |
| `multiselect()` | `SelectField` | `FieldType::Multiselect` |
| `radio()` | `RadioField` | — |
| `checkbox()` | `GenericField` | `FieldType::Checkbox` |
| `toggle()` | `GenericField` | `FieldType::Switch` |
| `date()` | `DateField` | — |
| `datetime()` | `DateField` | `FieldType::Datetime` |
| `duration()` | `DurationField` | — |
| `file()` | `FileField` | — |
| `entityPicker()` | `EntityPickerField` | — |
| `hidden()` | `GenericField` | `FieldType::Hidden` |
| `header()` | `StaticField` | `FieldType::Header` |
| `display()` | `StaticField` | — |

Layout primitives come from `middag-io/ui`: `Middag\Ui\Form\Group::of()` (inline field group) and `Middag\Ui\Block\Section::of()`.

`FieldType` — the enum distinguishing variants like `Email`/`Password`/`Url` within one `TextField` class — lives in `Middag\Ui\Shared\Enum\FieldType`, in `middag-io/ui`, not in this framework. Field-shape vocabulary is shared cross-repo so the UI package's block/page builders speak the same type language as the form DSL without depending on `Form/` internals.

There is no separate `static` factory method: static, non-input content uses `header()` and `display()`, both backed by `StaticField`. A regex constraint is declared with `TextField::pattern()`, which `FormValidator` turns into `Assert\Regex`.

### Out of MVP scope (still true today)

`editor` (rich text), `repeats`, `filemanager` (multi-file), `tags`, `colorpicker` were explicitly out of scope for the original MVP catalog and are not present in the table above.

### Historical naming (no live code behind these — informational only)

An early legacy reference document used `field::number()` for what the canonical legacy decision called `field::int()`/`field::float()` — `number()` was never actually implemented anywhere. None of the three legacy names (`int()`, `float()`, `number()`) exist in the current code; the live, `@api` names are `integer()` and `decimal()`.

| Concept | Current `FieldFactory` |
|---|---|
| Integer field | `integer()` |
| Float field | `decimal()` |

## Naming & validation rules

- Field names must be snake_case-equivalent; validated at construction.
- Reserved names — `id`, `submit`, `cancel`, `save`, `_token` — throw `InvalidArgumentException` at construction.
- There is no `->optional()` — a field is optional by default; `->required()` opts it out of that default.
- `checkbox()` returns `0|1`; `toggle()` (switch) fields return `bool`.

## Condition operators

Conditional field behaviour (`visible_when`/`required_when`/`disabled_when`/`hidden_when`) is schema data, not a procedural callback, so the same declaration renders consistently across every renderer target.

A subset of conditions has no non-Inertia equivalent: `matches` (an Inertia-only operator), non-string comparisons applied to string fields, and compound AND/OR multi-field conditions. On a non-Inertia target, these degrade to a `disabledIf`-style callback or server-side post-submit validation, with a runtime warning. This degradation path is legacy guidance — no non-Inertia renderer ships in this repo today — but it remains the relevant playbook for whichever adapter builds one.

## Anti-pattern

Don't duplicate a validation rule across the field schema and an attached `FormRequest` when the rule affects rendering (e.g. a `max:n` shown as a client-side hint) — the schema is the single declaration site for anything the renderer needs to reflect.
