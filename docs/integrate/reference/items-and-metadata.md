---
title: 'Items and metadata'
---

# Items and metadata

An item is a typed record that `middag-io/core` stores in a shared items table, with a key/value metadata table beside it. An extension declares an item type, writes items through the item service and reads them through the item query service. `middag-io/core` is on its pre-stable `1.x` line; only the curated `@api` types are meant for integrators, and an open enum may gain values, so handle values you do not know. See [Integrating with MIDDAG](/integrate/explanation/overview).

## Types

| Type | Role |
|---|---|
| `Middag\Core\Domain\Item\Item` | Item entity. Immutable: each `with*()` method returns a new instance. |
| `Middag\Core\Domain\Item\Contract\ItemInterface` | Read-only view of an item. Type-hint this one. |
| `Middag\Core\Domain\Item\Attribute\ItemType` | Class attribute that declares an item type: `type`, `metadataSchema`, `label`. |
| `Middag\Core\Domain\Item\ItemTypes` | Static registry from type slug to item class. |
| `Middag\Core\Domain\Item\Type\MiddagItemType` | An item type as seen by the framework's entity type registry. |
| `Middag\Core\Domain\Item\Contract\ItemServiceInterface` | Write side: create, update, delete, find. |
| `Middag\Core\Domain\Item\Contract\ItemQueryServiceInterface` | Read side: search with criteria, pagination and sorting. |
| `Middag\Core\Domain\Item\ItemQueryService` | Default implementation of the query service. |
| `Middag\Core\Domain\Item\ItemDto` | Input DTO. Base of the two DTOs below. |
| `Middag\Core\Domain\Item\CreateItemDto` | Input for `create()`. `type` is required. |
| `Middag\Core\Domain\Item\UpdateItemDto` | Input for `update()`. `id` is required. `@api`, outside the curated list. |
| `Middag\Core\Persistence\Query\QueryCriteria` | Filters on item columns. |
| `Middag\Core\Persistence\Query\QueryMetadataCriteria` | Filters on metadata keys. |
| `Middag\Core\Persistence\Query\Pagination` | Page (0-based) and page size. |
| `Middag\Core\Persistence\Query\Sorting` | Sort columns and direction. |
| `Middag\Core\Persistence\QueryEngine\Executor` | Runs a query against the item tables. |
| `Middag\Core\Persistence\Attribute\MetaField` | Property attribute that maps a DTO property to a metadata key. |
| `Middag\Core\Exception\ItemTypeSlugCollisionException` | Two classes claim the same type slug. |

## Declare an item type

```php
<?php

declare(strict_types=1);

namespace local_acme\extensions\acme\product;

use Middag\Core\Domain\Item\Attribute\ItemType;
use Middag\Core\Domain\Item\Item;

#[ItemType(type: 'product', metadataSchema: ['sku' => 'string', 'price' => 'float'], label: 'Product')]
final class product extends Item
{
    public const TYPE = 'product';
}
```

- The class must be a concrete subclass of `Item` inside an extension directory. Discovery reads `#[ItemType]` first and the `TYPE` constant second.
- **Declare `TYPE` with the same slug as `#[ItemType]`.** `Item::TYPE` is `'generic'`. The query service and `#[On(type: ...)]` with a class name read the constant, not the attribute.
- Keep the constructor of `Item`. Core builds the class with `Item`'s named arguments.
- `metadataSchema` maps each metadata key to a type name or an OpenAPI-shaped fragment. It documents the metadata. It does not validate writes. A list instead of a key map throws `InvalidArgumentException`.

## Read an item

`ItemInterface` exposes the columns and the metadata:

| Group | Methods |
|---|---|
| Identity | `getId()`, `getType()`, `getGuid()`, `getIdnumber()`, `getParent()`, `getScope()` |
| Content | `getFullname()`, `getShortname()`, `getDescription()`, `getDescriptionformat()` |
| State | `getStatus()`, `getVisible()`, `isVisible()`, `getSortorder()`, `getVersion()` |
| Audit | `getUserid()`, `getTimecreated()`, `getTimemodified()`, `getUsermodified()` |
| Metadata | `getMeta(string $key, mixed $default = null)`, `hasMeta(string $key)`, `getAllMeta()` |

## Write items

Type-hint `ItemServiceInterface` in your service constructor.

| Method | Behaviour |
|---|---|
| `create(ItemDtoInterface $dto): ItemInterface` | Validates, writes the item, its metadata, an audit entry and a revision, then dispatches `Signal::Created`. Generates a `guid` when the DTO has none. |
| `update(ItemDtoInterface $dto): ItemInterface` | Changes only the fields that are not `null`. Merges the given metadata keys; keys you leave out are kept. Dispatches `Signal::Updated`. |
| `delete(int $id): void` | Deletes the item and its metadata. Dispatches `Signal::Deleted` when the item existed. |
| `find(int $id): ?ItemInterface` | One item, with its metadata. |
| `getMetadata(int $id): array` | The metadata of one item. |
| `findByType(string $type): array` | Every item of a type, with metadata. |

```php
use Middag\Core\Domain\Item\CreateItemDto;
use Middag\Core\Domain\Item\UpdateItemDto;

$item = $this->items->create(new CreateItemDto(
    type: 'product',
    fullname: 'Course bundle',
    metadata: ['sku' => 'B-100', 'price' => 49.9],
));

$this->items->update(new UpdateItemDto(
    id: $item->getId(),
    status: 'published',
    metadata: ['price' => 39.9],
));
```

Use `UpdateItemDto` for updates. A plain `ItemDto` defaults `type` to `'generic'` and `status` to `'draft'`. `update()` throws `Middag\Core\Exception\CoreValidationException` when the item does not exist or the DTO changes the type. Signals are described in [Signals and hooks](/integrate/reference/signals-and-hooks).

## Query items

Type-hint `ItemQueryServiceInterface`.

| Method | Returns |
|---|---|
| `query(QueryCriteria $criteria, QueryMetadataCriteria $meta, ?Pagination $pagination = null, ?Sorting $sorting = null, ?string $domain_class = null)` | A result of items. With `$domain_class`, also filters by that class's `TYPE`. |
| `queryRaw(QueryCriteria $criteria, QueryMetadataCriteria $meta, ?Pagination $pagination = null, ?Sorting $sorting = null)` | A result of `stdClass` rows. |
| `first(QueryCriteria $criteria, QueryMetadataCriteria $meta, ?string $domain_class = null)` | The first match, or `null`. |

```php
use local_acme\extensions\acme\product\product;
use Middag\Core\Persistence\Query\Pagination;
use Middag\Core\Persistence\Query\QueryCriteria;
use Middag\Core\Persistence\Query\QueryMetadataCriteria;
use Middag\Core\Persistence\Query\Sorting;
use Middag\Core\Shared\Enum\SortDirection;
use Middag\Framework\Shared\Enum\Operator;

$criteria = (new QueryCriteria())->whereIn('status', ['published', 'draft']);
$meta = (new QueryMetadataCriteria())->where('price', Operator::Lte, 50);

$result = $this->query->query(
    $criteria,
    $meta,
    new Pagination(page: 0, perpage: 20),
    Sorting::by('timecreated', SortDirection::Desc)->thenBy('id'),
    product::class,
);

foreach ($result as $product) {
    // ...
}
```

- `QueryCriteria` has `where()`, `whereIn()` and `whereNotIn()` on item columns. `QueryMetadataCriteria` has the same three on metadata keys, plus `whereMetaMissing()` for a key that was never set.
- Operators come from `Middag\Framework\Shared\Enum\Operator` in the public `middag-io/framework`.
- `Sorting::toSql()` throws `CoreValidationException` for a column name that is not letters, digits, `_` or `.`.
- The result is a `Middag\Framework\Persistence\Contract\ResultInterface` (implemented by `Middag\Core\Persistence\QueryEngine\Result`). It is iterable and has `items()`, `total()`, `pages()`, `first()` and `isEmpty()`.
- Items from the query service carry no metadata. Call `find()` or `getMetadata()` when you need it.

`Executor::execute()` runs a `Middag\Core\Persistence\QueryEngine\MiddagItemQueryBuilder` (`@api`, outside the curated list). Prefer the query service unless you need the builder.

## Map a DTO to metadata

`#[MetaField]` maps one DTO property to one metadata key and a `Middag\Core\Persistence\Enum\MetaValueType` (`String`, `Integer`, `Float`, `Bool`, `Json`). `Middag\Core\Persistence\Contract\FieldMapSerializerInterface` (`@api`, outside the curated list) then turns the DTO into `meta_key => value` pairs with `toMeta()`, and back with `fromMeta()`.

```php
use Middag\Core\Persistence\Attribute\MetaField;
use Middag\Core\Persistence\Enum\MetaValueType;

final class billing_dto
{
    public function __construct(
        #[MetaField('bill_email')]
        public ?string $email = null,
        #[MetaField('bill_lines', MetaValueType::Json)]
        public array $lines = [],
    ) {}
}
```

The key is the storage contract: do not rename it once data exists.

## Slug collisions

A slug maps to exactly one class.

- `ItemTypes::register()` throws `LogicException` when a slug is already bound to another class. Registering the same class again is allowed.
- Discovery throws `ItemTypeSlugCollisionException` (a `LogicException`) when two discovered classes claim one slug. For a `native` or `pro` extension the boot fails. For a `custom` or `third_party` extension the slug keeps its first class, and the extension that made the second claim is recorded as failed. See [Extension contract](/integrate/reference/extension-contract).
- A slug already registered in `ItemTypes` (for example `generic`) fails the boot for every tier.
