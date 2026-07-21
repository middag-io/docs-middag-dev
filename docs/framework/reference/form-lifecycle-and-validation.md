---
title: 'framework — Form Lifecycle & Validation Reference'
---

# Form Lifecycle & Validation Reference

Reference for how a `Form` moves from construction to submission, how field-level
validation is enforced, and how the `FormRequest` escalation path relates to it.
Backs [FW-003](https://github.com/middag-io/middag-php-framework/blob/docs/docs/decisions/FW-003-schema-first-forms-form-request-escalation.md).

## Lifecycle

| Stage | Trigger | What happens |
|---|---|---|
| Construct | `$container->get(SiteForm::class)` (autowired) | `AbstractForm::__construct()` injects `FormValidator`; the form starts unsubmitted. |
| Hydrate | `FormResolver`, only on `POST`/`PUT`/`PATCH`/`DELETE` | `hydrate(array $input)` stores the submitted values on the form's internal `FormState`. On `GET` (and other safe methods) the form is left unhydrated — initial render state. |
| Validate | Same resolver call, immediately after hydrate | `validate()` walks `schema()` against the submitted values via `FormValidator`; errors are attached to the form state. |
| Submit | Controller reads `isSubmittedAndValid()` | `true` only when the form was hydrated (a mutating verb ran) **and** `errors() === []`. `validated()` returns the submitted values. |

`FormResolver` (`Http/Resolver/FormResolver.php`, `@internal`) runs hydrate + validate
automatically whenever a controller method type-hints a `FormInterface` subclass — the
same resolver-chain mechanism the HTTP kernel uses for routing/auth.

## Declaring a schema

```php
final class SiteForm extends AbstractForm
{
    public function schema(): array
    {
        return [
            FieldFactory::text('name')->label('site.name', 'ecommerce')->required()->max(255),
            FieldFactory::url('url')->label('site.url', 'ecommerce')->required(),
            FieldFactory::select('provider')->label('site.provider', 'ecommerce')
                ->options(['eduzz' => 'provider.eduzz', 'woocommerce' => 'provider.woocommerce'])
                ->required(),
            FieldFactory::password('api_key')->label('site.api_key', 'ecommerce')
                ->visibleWhen('provider', ConditionOperator::In, ['eduzz'])
                ->requiredWhen('provider', ConditionOperator::In, ['eduzz']),
        ];
    }
}
```

Field names must match `/^[a-z][a-z0-9_]*$/` (snake_case) and cannot be one of the
reserved names `id`, `submit`, `cancel`, `save`, `_token` — enforced at construction, not
left to convention.

### Field factory

`FieldFactory` is the only supported way to create a field (`@api`); concrete field
classes are `@internal`.

| Method | Field | Notes |
|---|---|---|
| `text` / `textarea` | Text | — |
| `email` / `password` / `url` | Text variant | Same `TextField` class, distinguished by an explicit `FieldType` — no separate class per variant. |
| `integer` / `decimal` | Numeric | `max`/`min` bound the numeric value itself, not a string length. |
| `checkbox` / `toggle` | Boolean | — |
| `date` / `datetime` | Date | — |
| `duration` | Duration | — |
| `select` / `multiselect` / `radio` | Choice | `options()` (static array) or `optionsFrom()` (lazy loader). |
| `entityPicker` | Entity reference | — |
| `file` | Upload | — |
| `header` / `display` | Static | No submitted value. |
| `hidden` | Hidden | — |

### Common fluent methods (every field)

| Method | Effect |
|---|---|
| `label(key, component)` / `help(key, component)` | i18n intent, resolved through the translation contract — never a raw string. |
| `default(value)` | Seeds the rendered control and the client props. |
| `required()` | Statically required — enforced server-side and exposed to the renderer. |
| `readonly()` | Read-only, both internally and as a renderer prop. |
| `visibleWhen` / `hiddenWhen` / `disabledWhen` | Conditional UI behaviour — **client-only**, not enforced by `FormValidator`. |
| `requiredWhen` | Conditional requirement — the one condition kind `FormValidator` also enforces server-side. |
| `rule(Constraint)` | Attaches a raw Symfony `Constraint` (e.g. `new Assert\Email()`) — enforced server-side, never sent to the client. |
| `meta(key, value)` | Arbitrary metadata; the Inertia/React renderer does not forward it. |

Conditional behaviour is schema data (a `Condition` value object), not a procedural
callback — the same declaration renders correctly on every renderer target.

## Server-side validation

`FormValidator` (`Form/FormValidator.php`, `@internal`) walks the schema and validates
submitted values using the **Symfony Validator** (`symfony/validator`).

| Field declaration | Symfony constraint applied |
|---|---|
| `required()` / `requiredWhen()` evaluates true | `Assert\NotBlank` |
| `max(n)` | `Assert\LessThanOrEqual(n)` for numeric fields, `Assert\Length(max: n)` otherwise |
| `min(n)` | `Assert\GreaterThanOrEqual(n)` for numeric fields, `Assert\Length(min: n)` otherwise |
| `pattern(...)` | `Assert\Regex` (non-numeric fields only) |
| `rule(Constraint)` | The given constraint, verbatim |

An optional field left empty (`null` or `''`) is skipped entirely — mirrors Symfony's own
null/empty handling and keeps comparison constraints from firing on nothing. Violation
messages come back per field: a single string, or a `string[]` when several constraints
fail on the same field.

## `FormRequest` — standalone or companion validation

`AbstractFormRequest` (`Http/Request/AbstractFormRequest.php`) is a second, independent
validation path — not a subtype of `Form`. A subclass declares:

```php
use Symfony\Component\Validator\Constraints as Assert;

final class SiteStoreRequest extends AbstractFormRequest
{
    public function rules(): array
    {
        return [
            'title' => [new Assert\NotBlank(), new Assert\Length(max: 255)],
            'email' => new Assert\Email(),
            'age'   => new Assert\Optional([new Assert\Type('integer'), new Assert\Positive()]),
        ];
    }
}
```

`FormRequestResolver` resolves and validates it automatically whenever a controller
method type-hints a `FormRequestInterface` subclass. Input is validated as an
`Assert\Collection`: every declared field must be present unless wrapped in
`Assert\Optional`; undeclared input keys are ignored. Failure throws
`MiddagValidationException` (HTTP 422) carrying a `field => message(s)` map; success
exposes only the declared fields via `validated()`.

### When to use which

| Scenario | Mechanism |
|---|---|
| Field-level rules, simple conditional requirements | `schema()` on the `Form` alone. |
| Cross-field or DB-backed validation on top of a form | Both — the controller method type-hints the `Form` **and** a `FormRequest` as two separate parameters; each resolver runs independently. |
| A pure REST endpoint with no UI | `FormRequest` alone, no `Form`. |
| Validation shared between a form and a REST endpoint over the same payload | The same `FormRequest` class, type-hinted by both controller methods. |

Pairing a `Form` with a `FormRequest` today is a controller-signature convention (type-hint
both), not a binding the framework reads off a class constant — `AbstractForm` and
`FormResolver` carry no such property. When both declare a rule for the same field, the
`FormRequest` rule is the one that applies — never duplicate a rule across the two.

## i18n

Labels, help text, option lists and validation error messages never carry a raw string.
`label()` / `help()` resolve to a `Translatable` (translation key + host domain);
`FormValidator` optionally routes Symfony violation messages through the host's
`TranslatorInterface` (translation domain `validators`) via `SymfonyTranslatorAdapter` —
without a configured translator, Symfony's default English messages pass through
unchanged.

## Legacy context (historical)

Reconstructed from the `moodle-local_middag` vault, kept only for anyone still reading
that plugin's tree — none of this applies to this package's own layout:

- Extension forms lived at `extensions/{slug}/{aggregate}/{entity}_form.php`;
  `form_request` classes at `{action}_request.php`; base classes at
  `classes/base/form.php` / `classes/base/form_request.php`.
- Migration away from the legacy Moodle form-builder had no hard deadline: migrate a
  form only when it was touched by an unrelated change, gated by at least one
  proof-of-concept migration, eventually moving retired forms to a `legacy/` folder.
  Relevant only to a host adapter that still bridges an older form engine — this
  package never shipped that renderer in the first place.
