---
title: 'UI wire contract'
---

# UI wire contract

This page describes the JSON that [`middag-php-ui`](https://github.com/middag-io/middag-php-ui) emits and that a client renderer consumes. [UI-002](https://github.com/middag-io/middag-php-ui/blob/main/docs/decisions/UI-002-page-contract-composition-model.md) records why there is one versioned contract published as schema; this page is the specification.

## Envelopes and version

Two envelopes go on the wire. Both implement [`ContractEnvelopeInterface`](https://github.com/middag-io/middag-php-ui/blob/main/src/Envelope/Contract/ContractEnvelopeInterface.php), which holds the single `VERSION` constant (currently `'1'`). Each serialized envelope carries it as `version`, so a full page and a partial update can never disagree on the contract version.

| Envelope | Use | Required keys | Optional keys |
| --- | --- | --- | --- |
| [`PageContract`](https://github.com/middag-io/middag-php-ui/blob/main/src/Page/PageContract.php) | A full page render. | `version`, `shell`, `page`, `layout` | `resources`, `notifications`, `entities` |
| [`Fragment`](https://github.com/middag-io/middag-php-ui/blob/main/src/Region/Fragment.php) | A partial slice when the client already owns the page. | `version`, `kind` | `payload`, `notifications`, `resources`, `customType` |

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

`entities` maps an entity type to a route pattern; blocks resolve entity references against it. `resources` (`PageResources`) carries user preferences, a capability map, feature flags, the current identity and branding.

### Open vocabulary

Shell names, layout templates, region names and block types are plain strings in PHP and in the schema. The package does not enumerate them: the client's registry decides which values it can render. [`BlockBuilder`](https://github.com/middag-io/middag-php-ui/blob/main/src/Block/BlockBuilder.php) and [`RegionBuilder`](https://github.com/middag-io/middag-php-ui/blob/main/src/Region/RegionBuilder.php) ship named constructors for the standard block types (`dense_table`, `form_panel`, `detail_panel`, `metric_card`, `empty_state`, `status_strip`, `activity_timeline`, `markdown_panel`, `card_grid`, `action_grid`, `link_list`, `chart`, `tabs`). `RegionBuilder::block()` emits any other type, and the same contract carries standard and custom blocks the same way. Tables and forms are blocks (`dense_table`, `form_panel`), not per-screen code.

### Block hints

`deferred: true` marks a block whose data the client fetches after the first render. `remember: true` marks a block whose local UI state the client restores on back and forward navigation. Both are omitted when false. Their docblocks describe them in terms of the first-party client's transport (Inertia deferred props and `useRemember`); whether they stay renderer-neutral is an open question in UI-002.

## Fragments and mutation results

[`FragmentKind`](https://github.com/middag-io/middag-php-ui/blob/main/src/Shared/Enum/FragmentKind.php) tells the client how to route a fragment: `block`, `region`, `table`, `form`, `detail`, `inspector`, `notifications` or `custom`. A `custom` fragment also carries `customType`, so a host can ship its own payload kind without widening the enum. A `notifications` fragment has no payload. Fragments reuse the page value objects; they introduce no new data shapes.

A `region` fragment carries a [`RegionUpdate`](https://github.com/middag-io/middag-php-ui/blob/main/src/Region/RegionUpdate.php) with a mode from `RegionUpdateMode`: `replace`, `append`, `prepend` and `update` read `blocks`; `remove` reads `keys`.

[`ActionResult`](https://github.com/middag-io/middag-php-ui/blob/main/src/Action/ActionResult.php) is the server's answer to a mutation. It carries `success`, notifications, an optional redirect, validation errors keyed by field (the reserved `_` key holds form-level errors), and two ways to update the view: `refreshBlocks` lists block keys the client re-fetches (pull), and `fragments` carries ready pieces to swap in (push). A [`ResourcePatch`](https://github.com/middag-io/middag-php-ui/blob/main/src/Page/ResourcePatch.php) on a fragment or an action result updates preferences, capabilities or feature flags without resending `PageResources`.

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

- **Authorization.** `Action`, `NavigationNode` and `CrudBuilder` accept a `capability` string. It is an opaque token that the host adapter maps to its own permission check. `PageResources` and `ResourcePatch` carry a capability map of booleans the server has already evaluated.
- **Translation.** [`Translatable`](https://github.com/middag-io/middag-php-ui/blob/main/src/Shared/ValueObject/Translatable.php) serializes a `key`, a host i18n `domain` and optional `params`. The client resolves it with the host's i18n tool. Entity data stays a plain string; the client tells the two apart by type (object to resolve, string to print).

Navigation is built through [`NavigationRegistryInterface`](https://github.com/middag-io/middag-php-ui/blob/main/src/Navigation/Contract/NavigationRegistryInterface.php): modules register groups, sections and items during boot, and the registry filters by capability and serializes the tree for the client. Hosts register against the registry instead of exposing their own navigation callbacks.

## Published schemas

The PHP value objects are the source of truth. Each wire value object and enum declares a hand-authored `jsonSchema()` next to its `jsonSerialize()`. [`SchemaRegistry`](https://github.com/middag-io/middag-php-ui/blob/main/src/Schema/SchemaRegistry.php) (`@internal`) bundles them into two JSON Schema draft 2020-12 files under [`schema/`](https://github.com/middag-io/middag-php-ui/tree/main/schema):

| File | Root | `$id` |
| --- | --- | --- |
| `page-contract.json` | `PageContract` | `https://ui-docs.middag.io/schemas/page-contract.json` |
| `fragment.json` | `Fragment` | `https://ui-docs.middag.io/schemas/fragment.json` |

Each bundle declares `x-contract-version` (the envelope `VERSION`), a `$ref` to its root and every type under `$defs`. `@middag-io/react` generates its TypeScript types and zod schema from these files.

The schemas are strict. Every value object is `additionalProperties: false`, and discriminated unions such as `ActionTarget` use `oneOf` on a `kind` const. The only open objects are passthrough bags: a block's `data` and `meta`, layout `meta`, a fragment's `payload`, `Translatable` and route `params`, a column's `options` and `formatOptions`, and `UserPreferences`. The form schema tree (`FormSchemaNode` and its node types) is registered but not yet referenced from the page tree; the `form_panel` block payload stays a passthrough.

### Drift gate

| Check | What it guards |
| --- | --- |
| `composer emit:schemas` | Writes `schema/*.json` from the registry. |
| `composer check:schemas` (`bin/emit-schemas.php --check`, part of `composer check`) | Fails when a committed schema differs from the code. |
| `tests/Schema/SchemaCoverageTest.php` | Every registered type exposes a schema, so a new wire type cannot ship without one. |
| `tests/Schema/SchemaRoundtripTest.php` | Serializer output validates against the schema, including required keys and discriminator strictness. |
| `tests/Envelope/ContractEnvelopeInterfaceTest.php` | Page and fragment share one version constant. |

## What the contract does not cover

The contract does not guarantee that a particular host or client renders every block type, layout or shell; that is the client registry's job. Rendering, HTTP transport and host wiring live in `middag-io/framework`, the host adapters and the client. See [Page composition contract](./composition-levels-and-capabilities) for the builder levels and [ui architecture](../../explanation/ui/architecture) for the package boundaries.

Verified against `middag-php-ui/main@e752e2aa8e2577cccef4135a9472df597056dc55` on 2026-11-04.
