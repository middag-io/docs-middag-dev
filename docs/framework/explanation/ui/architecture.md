---
title: 'ui — Architecture'
---

# Architecture

`middag-io/ui` is the **contract-builder** layer of the MIDDAG frontend stack: a transport- and host-agnostic PHP library for describing a UI as an immutable, serializable value object — the **page contract** — that something downstream renders. It has zero runtime dependencies (PHP `^8.2` only).

## The page contract system

A page is built up from value objects, never from markup. Builders compose a tree of concerns (regions, forms, tables, blocks, navigation, actions), and the root **page contract** serializes to JSON (`JsonSerializable`). A renderer — `middag-io/framework`'s Inertia renderer, a host adapter, or the `@middag-io/react` client — turns that JSON into a UI.

The contract is the entire public surface: if a value can appear on the wire, it is a `readonly` value object with a deterministic `jsonSerialize()`. If it is a boundary object a renderer maps manually (e.g. `FieldDefinition`, `Condition`), it does **not** implement `JsonSerializable` — this keeps the model decoupled from any one wire format.

## Why nothing here renders

[UI-001](https://github.com/middag-io/middag-php-ui/blob/main/docs/decisions/UI-001-react-typescript-inertia-stack.md) records this decision.

`middag-io/ui` sits at the bottom of the stack and defines only generic contracts. Rendering, host wiring, and HTTP transport all live downstream, never here:

- **No contract produces HTML** (`render(): string`). Contracts produce **data / value objects** (e.g. `FormRendererInterface` → `RendererOutput`, not a string) — rendering is a product/host concern.
- **No host knowledge.** No `mform`, `wpdb`, capability calls, column names, or plugin conventions.
- **Authorization is data, not a call.** Opaque authorization tokens (the `capability` field on `Action`/`NavigationNode`/`CrudBuilder`) are data the contract carries — resolving them by calling a host API is forbidden here; the adapter does that downstream.

## Concern-first layout

The library's `src/` is organized by **UI concern**, each a top-level directory:

| Concern | What it carries |
|---|---|
| `Action/` | The canonical `Action` value object + its discriminated `ActionTarget` (link / route / request / panel). |
| `Block/` | Content blocks (`BlockBuilder`, `BlockDescriptor`) and the `Section` layout primitive. |
| `Condition/` | The `Condition` value object (field visibility/requirement rules). |
| `EditablePanel/` | The editable side-panel descriptor that an action of kind `panel` opens. |
| `Envelope/` | The response envelope around a contract. |
| `Form/` | The form model — `FieldDefinition`, `Group`, form state and renderer contracts. |
| `Inspector/` | Detail/inspector view contracts. |
| `Navigation/` | Navigation nodes and registries. |
| `Page/` | The page contract entry points and page metadata. |
| `Region/` | Page regions and fragments (partial updates). |
| `Schema/` | `SchemaRegistry` — the single source of truth for the emitted JSON schemas. |
| `Table/` | Tables and the CRUD builder. |
| `Shared/` | Cross-cutting `Enum/` (closed catalogs), `ValueObject/` (readonly value objects), `Concerns/` (shared traits). |

Inside each concern, `@api` interfaces live in a `Contract/` sub-namespace (suffix `Interface`), fluent builders return `static` and produce value objects, and leaf value objects are `final readonly`. A value object paired with a dedicated `*Interface` extension seam may be `readonly` (non-`final`).

The wire value objects form an intentionally interlinked cluster — an envelope can embed any payload, an `ActionResult` carries either a full page contract or a partial fragment, a `CrudBuilder` emits a page contract — so "concern" here is an organizational axis, **not** an acyclic dependency boundary. The cross-references between concerns are inherent to the domain, not a layering defect.

## Composition levels

The builders meet the caller at whatever level of control is needed — see [Page Composition Contract](../../reference/ui/composition-levels-and-capabilities) for the verified L1-L3 entry points (L4 has no builder in this package; the consuming adapter owns it).

## Wire contract and JSON schemas

The JSON schemas emitted under `schema/` (`page-contract.json`, `fragment.json`) are **published artifacts**: the `@middag-io/react` client and other consumers codegen against them. `SchemaRegistry` (in `Schema/`) is the single source of truth; `bin/emit-schemas.php` writes the files, and `composer check` runs it with `--check` to fail on drift. The schemas are strict — every value object is `additionalProperties:false` (only passthrough bags such as block `data`/`meta`, a fragment `payload` and parameter maps are open), and discriminated unions (like `ActionTarget`) use `oneOf` on a `kind` const — so the contract stays a small, stable, machine-checkable wire format. [UI-002](https://github.com/middag-io/middag-php-ui/blob/main/docs/decisions/UI-002-page-contract-composition-model.md) records why; [UI wire contract](../../reference/ui/wire-contract) is the full specification.

## Relationship to other packages

```
middag-io/ui                    ← zero deps, host-agnostic
  └─ middag-io/framework        ← requires ui; generic renderers/kernel
       ├─ middag-io/moodle      ← requires framework; Moodle adapters + host-specifics
       └─ middag-io/wordpress   ← requires framework; WordPress adapters
  └─ @middag-io/react (NPM)     ← consumes the JSON this package produces
```
