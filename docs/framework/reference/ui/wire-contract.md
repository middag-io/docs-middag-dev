---
title: 'UI wire contract'
---

# UI wire contract

This page describes the JSON that [`middag-php-ui`](https://github.com/middag-io/middag-php-ui) emits and that a client renderer consumes. [UI-002](https://github.com/middag-io/middag-php-ui/blob/main/docs/decisions/UI-002-page-contract-composition-model.md) records why there is one versioned contract published as schema; this page is the specification.

## Envelopes and version

Two envelopes go on the wire. Both implement [`ContractEnvelopeInterface`](https://github.com/middag-io/middag-php-ui/blob/main/src/Envelope/Contract/ContractEnvelopeInterface.php), which holds the single `VERSION` constant (currently `'2'`, since 1.13.0). Each serialized envelope carries it as `version`, so a full page and a partial update can never disagree on the contract version. The same value is the `x-contract-version` of every schema bundle, including the shared props bundle described in [Shared props](#shared-props).

| Envelope | Use | Required keys | Optional keys |
| --- | --- | --- | --- |
| [`PageContract`](https://github.com/middag-io/middag-php-ui/blob/main/src/Page/PageContract.php) | A full page render. | `version`, `shell`, `page`, `layout` | `notifications`, `entities` |
| [`Fragment`](https://github.com/middag-io/middag-php-ui/blob/main/src/Region/Fragment.php) | A partial slice when the client already owns the page. | `version`, `kind` | `payload`, `notifications`, `customType` |

Optional keys are omitted from the JSON when they are empty, so adding an optional capability does not change the wire shape of payloads that do not use it.

## Page contract layers

A `PageContract` is built from five layers:

| Layer | Key | Carries |
| --- | --- | --- |
| Shell | `shell` | The macro frame of the experience, as a string. `PageBuilder` defaults to `product`. |
| Page | `page` (`PageMeta`) | Screen identity: key, title, subtitle, breadcrumbs and global actions. |
| Layout | `layout.template` | The structural template, as a string. `PageBuilder` defaults to `stack`; `CrudBuilder` uses `stack`, and `split` for `show`. |
| Regions | `layout.regions` | Named slots, each an ordered list of blocks. `CrudBuilder` uses `content`, and `aside` for `show`. |
| Blocks | `BlockDescriptor` | A typed widget: `type`, `key`, `data`, with optional `variant`, `title`, `subtitle`, `actions`, `meta`, `poll`, `deferred` and `remember`. |

`entities` maps an entity type to a route pattern; blocks resolve entity references against it.

Since 1.14.0 there is no `resources` key. `PageResources`, `PageResourcesInterface`, `Branding` and `ResourcePatch` are removed, and the `resources` property is gone from `PageContract`, `Fragment` and `ActionResult`, so the contract no longer carries feature flags or branding. Identity, capabilities, theme and locale travel in the [shared props](#shared-props). `PageContract::__construct()` lost its fourth parameter, `$resources`, so `$notifications` and `$entities` moved up to positions 4 and 5; pass them by name. `ActionResult::__construct()` lost its last parameter, `$resources`. The contract version stays `'2'`.

### Open vocabulary

Shell names, layout templates, region names and block types are plain strings in PHP and in the schema. The package does not enumerate them: the client's registry decides which values it can render. [`BlockBuilder`](https://github.com/middag-io/middag-php-ui/blob/main/src/Block/BlockBuilder.php) and [`RegionBuilder`](https://github.com/middag-io/middag-php-ui/blob/main/src/Region/RegionBuilder.php) ship named constructors for the standard block types (`dense_table`, `form_panel`, `detail_panel`, `metric_card`, `empty_state`, `status_strip`, `activity_timeline`, `markdown_panel`, `card_grid`, `action_grid`, `link_list`, `chart`, `tabs`). `RegionBuilder::block()` emits any other type, and the same contract carries standard and custom blocks the same way. Tables and forms are blocks (`dense_table`, `form_panel`), not per-screen code; see [Tables and forms](#tables-and-forms).

### Block hints

`deferred: true` marks a block whose data the client fetches after the first render. `remember: true` marks a block whose local UI state the client restores on back and forward navigation. Both are omitted when false. Their docblocks describe them in terms of the first-party client's transport (Inertia deferred props and `useRemember`); whether they stay renderer-neutral is an open question in UI-002.

## Tables and forms

### Tables

A `dense_table` block carries a table definition plus the current page of rows. [`TableConfig`](https://github.com/middag-io/middag-php-ui/blob/main/src/Table/TableConfig.php) (built by [`TableBuilder`](https://github.com/middag-io/middag-php-ui/blob/main/src/Table/TableBuilder.php), or by `CrudBuilder` for an L1/L2 index page) serializes:

| Key | Value object | Carries |
| --- | --- | --- |
| `columns` | [`Column`](https://github.com/middag-io/middag-php-ui/blob/main/src/Table/Column.php) | `key`, `label`, `sortable`, `searchable`, a `format` (`ValueFormat`), optional `formatOptions`, `options` and a cell `variant` (`ColumnVariant`, see [optional capabilities](./composition-levels-and-capabilities#optional-capabilities-in-the-php-contract)). |
| `filters` | [`FilterDefinition`](https://github.com/middag-io/middag-php-ui/blob/main/src/Table/FilterDefinition.php) | `key`, `label`, a control `type` (`FilterType`: `select`, `text`, `date`, `date_range`, `boolean`, `number_range`), and optional `options`, `placeholder` and `default`. |
| `rowActions` | `Action` | Per-row actions; their targets use an `{id}` placeholder for the row. |
| `bulkActions` | `Action` | Actions applied to the selected rows. |
| `options` | [`TableDisplayOptions`](https://github.com/middag-io/middag-php-ui/blob/main/src/Table/TableDisplayOptions.php) | `perPage` (default 25), optional `sortColumn`, `sortDirection` (default `desc`), `selectable` and `searchable`. |

`CrudBuilder` merges this configuration with `rows` and a [`Pagination`](https://github.com/middag-io/middag-php-ui/blob/main/src/Table/Pagination.php) (`page`, `perPage`, `total`, `lastPage`; `Pagination::of()` derives `lastPage`) into the block `data`. The contract declares which columns sort and search and which filters exist; the server applies sorting, filtering and pagination and sends the resulting page. `CrudBuilder` turns `selectable` on when bulk actions are configured and `searchable` on when any column is searchable. The block `meta` bag can ask the client to sort, filter and paginate the supplied rows itself (`clientSide`); `meta` is passthrough, so the client decides which keys it reads.

`TableConfig`, `TableDisplayOptions`, `FilterDefinition`, `Pagination` and `Column` are registered in the schema bundles, but the `dense_table` block `data` stays a passthrough object, so the schema does not validate a table payload inside a page.

### Forms

A `form_panel` block carries `action`, a lowercase `method`, a `schema` (a list of form schema nodes), `values`, `errors` and `meta`; `BlockBuilder::formPanel()` defaults `errors` to an empty object and `meta.validation` to `both`, and adds `steps` and `multiStep` for a multi-step form. Each `schema` entry is a [`FormSchemaNodeInterface`](https://github.com/middag-io/middag-php-ui/blob/main/src/Form/Contract/FormSchemaNodeInterface.php) value object (`FormFieldNode`, `FormGroupNode`, `FormSectionNode`, `FormHeaderNode`), serialized by the builder; a loose array raises a `TypeError` (since 1.12.0). A file field's value is a [`FileValue`](https://github.com/middag-io/middag-php-ui/blob/main/src/Form/FileValue.php) (or a list of them), on the wire either a bare URL or an object with `url` and optional `name`, `size`, `type`, `id` and `uploadToken`. `uploadToken` is a string: an opaque reference to a pending upload, issued by the host's upload endpoint and sent back with the form. It is not the file id (`id`). `ui` and the client only carry it; the host adapter maps it to its own storage.

A pending file upload travels as [`FileValue`](https://github.com/middag-io/middag-php-ui/blob/main/src/Form/FileValue.php): its `uploadToken` is a **string** that the host's upload endpoint issues and the adapter maps to its own storage. It is never a numeric host id.

The form DSL itself lives in the framework. A host renderer that cannot consume the JSON implements [`FormRendererInterface`](https://github.com/middag-io/middag-php-ui/blob/main/src/Form/Contract/FormRendererInterface.php), which returns a `RendererOutput` for one `RenderTarget`; those renderers live in the framework and the host adapters, not in this package.

## Fragments and mutation results

[`FragmentKind`](https://github.com/middag-io/middag-php-ui/blob/main/src/Shared/Enum/FragmentKind.php) tells the client how to route a fragment: `block`, `region`, `table`, `form`, `detail`, `inspector`, `notifications` or `custom`. A `custom` fragment also carries `customType`, so a host can ship its own payload kind without widening the enum. A `notifications` fragment has no payload. Fragments reuse the page value objects; they introduce no new data shapes.

A `region` fragment carries a [`RegionUpdate`](https://github.com/middag-io/middag-php-ui/blob/main/src/Region/RegionUpdate.php) with a mode from `RegionUpdateMode`: `replace`, `append`, `prepend` and `update` read `blocks`; `remove` reads `keys`.

[`ActionResult`](https://github.com/middag-io/middag-php-ui/blob/main/src/Action/ActionResult.php) is the server's answer to a mutation. It carries `success`, notifications, an optional redirect, validation errors keyed by field (a [`FormErrors`](#form-errors) map; the reserved `_` key holds form-level errors), and two ways to update the view: `refreshBlocks` lists block keys the client re-fetches (pull), and `fragments` carries ready pieces to swap in (push).

## Actions

An [`Action`](https://github.com/middag-io/middag-php-ui/blob/main/src/Action/Action.php) has an id, a label, an intent and a target. [`ActionTarget`](https://github.com/middag-io/middag-php-ui/blob/main/src/Action/ActionTarget.php) is discriminated by `kind`:

| Kind | Carries |
| --- | --- |
| `link` | `href`, optionally `external` |
| `route` | a host-named `route` and its `params`, resolved by the client |
| `request` | an HTTP mutation: `endpoint` and `method` |
| `panel` | nothing; opens the page's editable panel for the acting row |

## Opaque data

The contract carries authorization and translation as data and never resolves them:

- **Authorization.** `Action`, `NavigationNode` and `CrudBuilder` accept a `capability` string. It is an opaque token that the host adapter maps to its own permission check. The tokens the current user holds travel as a list of strings in the `auth` slot of the [shared props](#shared-props) (`SharedAuth.capabilities`).
- **Translation.** [`Translatable`](https://github.com/middag-io/middag-php-ui/blob/main/src/Shared/ValueObject/Translatable.php) serializes a `key`, a host i18n `domain` and optional `params`. The client resolves it with the host's i18n tool. Entity data stays a plain string; the client tells the two apart by type (object to resolve, string to print).

Navigation is built through [`NavigationRegistryInterface`](https://github.com/middag-io/middag-php-ui/blob/main/src/Navigation/Contract/NavigationRegistryInterface.php): modules register groups, sections and items during boot, and the registry filters by capability and serializes the tree for the client. Hosts register against the registry instead of exposing their own navigation callbacks. Since 1.13.0, `build()` returns a [`NavigationTree`](#navigation-tree) value object instead of an array. See [Navigation registry](#navigation-registry) for what each registration takes.

## Shared props

[`SharedProps`](https://github.com/middag-io/middag-php-ui/blob/main/src/Shared/ValueObject/SharedProps.php) (new in 1.13.0) describes the props shared with every page, next to the page contract. It is the root of its own schema bundle, `shared-props.json`. The root is open (`additionalProperties: true`), so hosts and products can add their own keys, such as `middag.*`; the typed slots stay strict. Every slot is optional. A slot left `null` is omitted from the wire, except `scope`, which is always emitted.

| Slot | Type | Carries |
| --- | --- | --- |
| `auth` | [`SharedAuth`](https://github.com/middag-io/middag-php-ui/blob/main/src/Shared/ValueObject/SharedAuth.php) | The authenticated user, as one flat object: the `Identity` keys `id` (string), `name`, and optional `email`, `avatarUrl` and `roles` (a list of strings, omitted when empty); then `capabilities` (a list of strings, always emitted) and an optional `logoutUrl`. `id`, `name` and `capabilities` are required. |
| `theme` | [`SharedTheme`](https://github.com/middag-io/middag-php-ui/blob/main/src/Shared/ValueObject/SharedTheme.php) | An optional `appearance` (`ThemeMode`: `light`, `dark`, `system`) and `strings`, a map of string overrides for the client, always emitted and `{}` when empty. |
| `flash` | [`FlashMessages`](https://github.com/middag-io/middag-php-ui/blob/main/src/Shared/ValueObject/FlashMessages.php) | One-shot messages for the next render: a flat map with at most one string per key. The only keys are `success`, `error`, `info` and `warning`. |
| `errors` | [`FormErrors`](#form-errors) or [`FormErrorBags`](#error-bags) | The validation errors of the current request. |
| `csrf_token` | string | A CSRF token. |
| `locale` | string | The current locale. |
| `scope` | object | An open object that describes the current scope. Always emitted, `{}` when empty. |
| `navigation` | [`NavigationTree`](#navigation-tree) | The navigation payload. |

`ui` defines these shapes only. Which values a host puts in each slot is up to the host adapter.

`FlashMessages` emits only the keys that carry text: a `null`, empty or whitespace-only value is dropped, and an empty set serializes to `{}`. `FlashMessages::fromArray()` builds the set from a raw map, such as a session flash bag; it drops keys other than the four above and values that are not strings, instead of rejecting them.

### Navigation tree

[`NavigationTree`](https://github.com/middag-io/middag-php-ui/blob/main/src/Navigation/NavigationTree.php) always emits its three keys:

| Key | Carries |
| --- | --- |
| `tree` | The main list of [`NavigationNode`](https://github.com/middag-io/middag-php-ui/blob/main/src/Navigation/NavigationNode.php). |
| `activeKey` | The dot-notation key of the active node. The empty string `''` means that no node is active. |
| `footer` | The secondary list of `NavigationNode`, shown at the bottom. |

The constructor rejects a `tree` or `footer` that is not a list of `NavigationNode`. A `NavigationNode` requires `key` and `label` (a string or a [`Translatable`](#opaque-data)) and has the optional `icon`, `href`, `badge`, `children` and the flags `active`, `drilldown`, `collapsible` and `defaultOpen` (emitted only when true). Since 1.13.0 it also has four optional fields, typed as open strings that the client interprets: `entityType`, `badgeVariant`, `statusColor` and `target` (an HTML link target, such as `_blank`). Each is omitted when unset. Since 1.14.0 the constructor rejects an `href` whose scheme is `javascript:`, `data:` or `vbscript:` with an `InvalidArgumentException`.

### Navigation registry

Since 1.14.0, the registry takes what a `NavigationNode` carries:

| Method | Registers | Takes |
| --- | --- | --- |
| `group()` | A top-level group | `key`, `label`, and the optional `icon`, `weight`, `entityType`, `badgeVariant` and `statusColor` |
| `section()` | A section in a group (`{group}.{section}`) | The same parameters as `group()` |
| `item()` | A leaf item in a section (`{group}.{section}.{item}`) | `key`, `label`, a nullable `route`, and the optional `routeParams`, `icon`, `weight`, `entityType`, `badgeVariant`, `statusColor`, `target` and `href` |

A label is a string or a `Translatable`, stored as given: the registry never translates it, and a `Translatable` reaches the client as `{key, domain, params?}`. An item has exactly one destination: a `route`, which the host resolves to a URL, or an external `href`, which the registry uses as given. An `href` must be an absolute URL that starts with a lowercase `http://` or `https://`, with a non-empty host and no whitespace or control characters, and it takes no `routeParams`. An item without a route is never marked active.

```php
$registry->group('audience', Translatable::of('nav.audience', 'app'), icon: 'users', statusColor: 'blue')
    ->section('audience.segments', 'Segments')
    ->item('audience.segments.index', 'All segments', 'segments.index')
    ->item('audience.segments.docs', 'Docs', null, href: 'https://docs.example', target: '_blank');
```

`NavigationRegistryInterface` is an implementable contract: its method signatures, including parameter names, are frozen for 2.x. An implementation must use the interface's parameter names, so named arguments work against any implementation.

### Form errors

[`FormErrors`](https://github.com/middag-io/middag-php-ui/blob/main/src/Form/FormErrors.php) maps a field name to a [`FieldError`](https://github.com/middag-io/middag-php-ui/blob/main/src/Form/FieldError.php). Since 1.14.0 a `FieldError` is one of:

- a message, as a string;
- a [`FieldMessage`](https://github.com/middag-io/middag-php-ui/blob/main/src/Form/FieldMessage.php): `{message, key, domain, params?}`;
- a list whose entries are strings or `FieldMessage` objects.

A `FieldMessage` carries the message the server already resolved (`message`, which the client can print as is) next to the translation `key`, the host i18n `domain` and the placeholder `params`, so a client that owns the translations can render the message in the user's language. `params` is a map keyed by placeholder name and is omitted when empty; a non-empty list is rejected. Clients must accept the object form.

The reserved key `_` carries errors for the whole form, and dotted keys such as `address.zip` target nested fields. The map always serializes as a JSON object: an empty set is `{}`, and numeric field names such as `0` and `1` stay object keys. The same shape types the `errors` of the shared props and of an `ActionResult`; `ActionResult` omits `errors` when there are none.

### Error bags

[`FormErrorBags`](https://github.com/middag-io/middag-php-ui/blob/main/src/Form/FormErrorBags.php) (new in 1.14.0) maps a bag name to a `FormErrors`. The `errors` shared prop carries it instead of a flat `FormErrors` when the request named an error bag with the `X-Inertia-Error-Bag` header, so several forms on one page keep their errors apart. Bag names must not be empty, and the map always serializes as a JSON object.

The wire does not say which of the two shapes it carries. The client that sent the header reads `errors[bag]`, and any other client reads the map as flat. In the schema, the `errors` slot is `anyOf [FormErrors, FormErrorBags]`.

### Empty maps

Since 1.13.0, an empty map goes on the wire as a JSON object `{}`, never as an empty array `[]`. This applies to `FormErrors`, `FlashMessages`, `SharedTheme.strings` and `SharedProps.scope`, and to `FormErrorBags` since it was added in 1.14.0.

## Published schemas

The PHP value objects are the source of truth. Each wire value object and enum declares a hand-authored `jsonSchema()` next to its `jsonSerialize()`. [`SchemaRegistry`](https://github.com/middag-io/middag-php-ui/blob/main/src/Schema/SchemaRegistry.php) (`@internal`) bundles them into three JSON Schema draft 2020-12 files under [`schema/`](https://github.com/middag-io/middag-php-ui/tree/main/schema):

| File | Root | `$id` |
| --- | --- | --- |
| `page-contract.json` | `PageContract` | `https://ui-docs.middag.io/schemas/page-contract.json` |
| `fragment.json` | `Fragment` | `https://ui-docs.middag.io/schemas/fragment.json` |
| `shared-props.json` | `SharedProps` | `https://ui-docs.middag.io/schemas/shared-props.json` |

Each bundle declares `x-contract-version` (the envelope `VERSION`), a `$ref` to its root and every type under `$defs`. `@middag-io/ui-contracts` ships the TypeScript types and zod schemas that `@middag-io/ui-contracts-codegen` generates from these files.

The schemas are strict. Every value object is `additionalProperties: false`, except the `SharedProps` root, the `FormErrors` map (field name to `FieldError`) and the `FormErrorBags` map (bag name to `FormErrors`). `FieldPropsBase`, which other schemas compose through `allOf`, declares no `additionalProperties`. Discriminated unions such as `ActionTarget` use `oneOf` on a `kind` const. The only open objects are the `SharedProps` root, its `scope`, and passthrough bags: a block's `data` and `meta`, layout `meta`, a fragment's `payload`, `Translatable` `params`, `FieldMessage` `params`, route `params`, and a column's `options` and `formatOptions`. The form schema tree (`FormSchemaNode` and its node types) is registered but not yet referenced from the page tree; the `form_panel` block payload stays a passthrough.

### Drift gate

| Check | What it guards |
| --- | --- |
| `composer emit:schemas` | Writes `schema/*.json` from the registry. |
| `composer check:schemas` (`bin/emit-schemas.php --check`, part of `composer check`) | Fails when a committed schema differs from the code. |
| `tests/Schema/SchemaCoverageTest.php` | Every registered type exposes a schema, so a new wire type cannot ship without one. |
| `tests/Schema/SchemaRoundtripTest.php` | Serializer output validates against the schema, including required keys and discriminator strictness. |
| `tests/Envelope/ContractEnvelopeInterfaceTest.php` | Page and fragment share one version constant. |

## Evolution rules

The wire JSON follows the same SemVer rules as the PHP `@api` surface ([`API-STABILITY.md`](https://github.com/middag-io/middag-php-ui/blob/main/API-STABILITY.md#the-wire-contract) is the normative text):

- Adding an optional key or a new `$def` is additive and ships in a MINOR. Clients ignore keys they do not know.
- Adding a discriminator value (`kind`, `type`) is additive and ships in a MINOR. Clients treat an unknown value as unsupported and degrade that element instead of rejecting the whole payload.
- Removing or renaming a key, removing an enum value, changing a type or making a key required is a breaking change: it ships in a MAJOR and raises `ContractEnvelopeInterface::VERSION` and `x-contract-version`.

### Enum evolution

Whether an enum can grow in a MINOR depends on what the client does with a value it does not know.

| Kind | Enums | Unknown value on the client | Add a value | Remove or rename a value |
| --- | --- | --- | --- | --- |
| Control | `HttpMethod` (also the form `submitMethod`), `ActionTargetKind`, `FragmentKind`, `RegionUpdateMode`, `RenderTarget`, `ConditionOperator` (the condition `operator`), `documentScope` | Rejected: these values drive behavior, so the contract does not guess | MAJOR | MAJOR |
| Open | `ActionIntent`, `NotificationLevel`, `ThemeMode`, `ValueFormat`, `ColumnVariant`, `FilterType`, `ChartType`, `FormComponent`, `FieldType` | Reaches the renderer, which falls back to a safe default | MINOR | MAJOR |

On the client, `@middag-io/ui-contracts` keeps the control enums strict and lets an unknown value of an open enum through to the renderer, typed as a plain string. The `@middag-io/react` renderer shows an action with an unknown `ActionIntent` in the destructive (danger) style.

## What the contract does not cover

The contract does not guarantee that a particular host or client renders every block type, layout or shell; that is the client registry's job. Rendering, HTTP transport and host wiring live in `middag-io/framework`, the host adapters and the client. See [Page composition contract](./composition-levels-and-capabilities) for the builder levels and [ui architecture](../../explanation/ui/architecture) for the package boundaries.

Verified against `middag-php-ui@f3f714b` (tag `v1.14.0`, release 1.14.0) on 2026-11-23.
