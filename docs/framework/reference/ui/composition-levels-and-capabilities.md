---
title: 'Page composition contract'
---

# Page composition contract

The [`middag-php-ui` page contract](https://github.com/middag-io/middag-php-ui/blob/main/src/Page/PageContract.php) carries the server's page description to a client renderer. [UI-002](https://github.com/middag-io/middag-php-ui/blob/main/docs/decisions/UI-002-page-contract-composition-model.md) records the choice of one versioned contract that every composition level emits. The envelope, schemas and fragments are specified in [UI wire contract](./wire-contract). This reference describes the verified PHP surface; product and host adapters decide how to render and expose it.

## Contract shape

`PageContract` serializes a version, a shell, page metadata, and a layout. It can also include resources, notifications, and entity route patterns. The layout contains named regions; each region holds typed block descriptors. [`BlockDescriptor`](https://github.com/middag-io/middag-php-ui/blob/main/src/Block/BlockDescriptor.php) serializes a `type`, `key`, and `data`, with optional presentation, actions, polling, deferral, and remembered state.

| Level | Verified PHP entry point | Scope |
| --- | --- | --- |
| L1 — convention | `PageBuilder::crud(Entity::class)` returning `CrudBuilder` | Generate a standard CRUD page from an entity. |
| L2 — configured convention | The same `CrudBuilder`, with explicit configuration | Adjust the generated page while keeping the contract. |
| L3 — composed page | `PageBuilder::page('key')` and its `region()` method | Assemble a page from named regions and block descriptors. |
| L4 — dedicated frontend | No separate L4 builder in `middag-php-ui` | A consuming product may render a dedicated React page; its adapter owns that integration. |

For L3, the current builder can produce a contract with:

```php
use Middag\Ui\Page\PageBuilder;

$page = PageBuilder::page('segments.index')
    ->title('Segments')
    ->layout('stack')
    ->build();
```

`region()` accepts block descriptors or a callback using `RegionBuilder`. `PageBuilder::build()` returns `PageContract`. The PHP contract does not by itself guarantee that a particular host or React renderer supports every block type.

## Optional capabilities in the PHP contract

These are serialized data contracts; the active React and host versions determine their runtime behavior.

| Capability | Value object | What the contract carries |
| --- | --- | --- |
| Polling | [`PollConfig`](https://github.com/middag-io/middag-php-ui/blob/main/src/Region/PollConfig.php) | A refresh `endpoint` and `intervalMs` for a block or inspector, an optional `stopAfterMs`, and `pauseWhenHidden` (default true). |
| Confirmation dialogs | [`Confirmation`](https://github.com/middag-io/middag-php-ui/blob/main/src/Action/Confirmation.php) | The `title`, `message`, optional confirm and cancel labels, and a `variant` of a guarded action. `CrudBuilder` attaches a `danger` confirmation to its `delete` row and bulk actions. |
| Action state | [`Action`](https://github.com/middag-io/middag-php-ui/blob/main/src/Action/Action.php) | An `intent`, an optional `icon`, an opaque `capability` token, and `disabled` and `loading` flags. There is no per-row visibility condition: a row action applies to every row, and the server omits or disables it when it does not apply. |
| Notifications (flash and toast) | [`Notification`](https://github.com/middag-io/middag-php-ui/blob/main/src/Shared/ValueObject/Notification.php) | A `level` (`NotificationLevel`: `success`, `info`, `warning`, `error`), a `message`, an optional `title`, `dismissible` (default true), an optional `timeout` and an optional follow-up `Action`. `PageContract`, `Fragment` (including a `notifications` fragment) and `ActionResult` carry them. |
| Column cell variants | [`ColumnVariant`](https://github.com/middag-io/middag-php-ui/blob/main/src/Shared/Enum/ColumnVariant.php) | The cell component for a `dense_table` column: `text`, `status`, `badge`, `boolean`, `timestamp`, `link`, `rich_status`, `html`, `link_group`, `annotated`, `progress`. `rich_status` reads a `{label, appearance}` value, so the colour does not depend on translated text; `annotated` and `progress` read their own structured values. A null variant leaves the client on `text`. |

`variant` and `format` (`ValueFormat`: how a scalar is formatted) are separate: a column that needs a coloured pill declares the variant, because `format: badge` alone leaves the cell as text. Consult the [React package documentation](https://github.com/middag-io/middag-react/tree/main/docs) for rendering and client APIs.

Verified against `middag-php-ui/main@8602bb179816ed2c51c633855535a985792abb72` on 2026-11-04. The old `REF-UI-002-01` and previous versions of this page included method names and feature claims that were not verified against this source; they are not used as current API evidence here.
