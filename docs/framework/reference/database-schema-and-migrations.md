---
title: 'Database Schema & Migrations'
---

# Database Schema & Migrations

Reference for the database abstraction in `middag-io/framework` (`src/Database/`): the connection seam, pluggable SQL dialects, schema described as data or attributes, and forward-only migrations. Backs [FW-017](https://github.com/middag-io/middag-php-framework/tree/main/docs/decisions). For the query builder, Active Record and repositories built on top of this layer, see [Active Record (Eloquent Compatibility)](./active-record-eloquent-compatibility).

## The connection seam

[`ConnectionAdapterInterface`](https://github.com/middag-io/middag-php-framework/blob/main/src/Database/Contract/ConnectionAdapterInterface.php) (`@api`) is the only object in the stack that knows a concrete database: Moodle's `$DB`, WordPress's `$wpdb`, a standalone PDO connection, or an optional Eloquent/Capsule connection the consumer wires (`illuminate/database` is a `suggest`, with no shipped integration). Everything above it depends on the contract, never on a host API. It speaks tables, associative-array records, SQL and bind parameters only; mapping rows to domain entities happens above, in repositories.

It composes three contracts and adds capability reporting:

| Contract | Members |
| --- | --- |
| `ConnectionInterface` | `execute()`, `fetch()`, `fetchAll()`, `transaction(callable)` |
| `RecordConnectionInterface` (extends the above) | `insert()`, `update()`, `delete()`, `find()`, `findAll()`, `cursor()` |
| `ConnectionAdapterInterface` (extends the above) | `supports(Capability)`, `dialect(): SqlDialectInterface` |

`supports()` lets a caller fall back instead of emitting SQL the host rejects. The `Capability` enum:

| Case | Meaning | Notes from the contract |
| --- | --- | --- |
| `Transactions` | Run a callable atomically | A `$wpdb` adapter may report false depending on the table engine |
| `Streaming` | `cursor()` streams lazily | Unbuffered PDO cursor or a native recordset |
| `JsonWhere` | JSON-path predicates in `WHERE` | Modern MySQL/PostgreSQL |
| `Returning` | `RETURNING` on writes | PostgreSQL; not MySQL or Moodle DML |
| `Upsert` | Insert-or-update in one statement | — |
| `SchemaDiff` | Introspect or diff the schema | False where the host owns its schema lifecycle (Moodle XMLDB) |
| `RowLock` | `SELECT … FOR UPDATE` / `FOR SHARE` | False on SQLite |

The OSS implementation is `PdoConnectionAdapter` (`final readonly`, constructed with an open `PDO` and an optional dialect, default `StandardSqlDialect`); it sets `ERRMODE_EXCEPTION` and `FETCH_ASSOC` and reports `Transactions` and `Streaming`. The adapters ship `MoodleConnectionAdapter` and `WpdbConnectionAdapter`.

## Dialects

[`SqlDialectInterface`](https://github.com/middag-io/middag-php-framework/blob/main/src/Database/Contract/SqlDialectInterface.php) (`@api`) covers the few platform-specific idioms a repository needs when it must write raw SQL:

| Method | Purpose |
| --- | --- |
| `table($logicalName)` | Render a table name (ANSI passthrough; Moodle wraps it in braces, `{middag_items}`) |
| `inClause($values, $prefix = 'p')` | A parameterised `IN (...)` fragment and its bindings |
| `compareText($column)` | A TEXT/CLOB-comparable column reference (Moodle: `sql_compare_text()`) |
| `limitOffset($limit, $offset)` | The trailing `LIMIT`/`OFFSET` clause, per engine (since 0.6.0) |
| `lockClause('update'\|'share')` | The row-lock clause, or `''` where unsupported (since 0.9.0) |
| `upsertClause($uniqueBy, $update)` | `ON CONFLICT … DO UPDATE` or MySQL's `ON DUPLICATE KEY UPDATE` (since 0.10.0) |

OSS implementations: `StandardSqlDialect` (ANSI, SQLite, PostgreSQL), `MysqlSqlDialect`, and `PrefixingSqlDialect`, a decorator that prefixes logical table names (`mysite_` + `middag_items`) for standalone or development use. A host dialect that already prefixes is not wrapped. The adapters ship `MoodleSqlDialect` and `WpdbSqlDialect`.

## Schema as data

A table is a platform-agnostic descriptor array with the keys `name`, `comment`, `columns`, `keys` and `indexes`. [`SchemaBuilder`](https://github.com/middag-io/middag-php-framework/blob/main/src/Database/Schema/SchemaBuilder.php) (`@api`) collects descriptors from three sources:

- `loadFromDirectory($dir)`: every `*.php` file in a directory that returns a descriptor array (conventionally `db/schema/`).
- `register(array $descriptor)`: one descriptor directly.
- `registerClass($class)` / `loadFromClasses($classes)`: classes annotated with the schema attributes below.

Read access: `table()`, `tables()`, `all()`, `has()`, `columns()`, `keys()`, `indexes()`.

### Schema attributes

`#[Table]`, `#[Column]`, `#[Key]` and `#[Index]` (`Database/Attribute/`, all `@api`) describe a table on a class; `SchemaAttributeReader` reflects them into the same descriptor array (cached per class), so adapters and runners only ever see the array format.

```php
#[Table('middag_items', comment: 'Current state for framework items')]
#[Column('id', 'int', length: 10, notnull: true, sequence: true)]
#[Column('type', 'char', length: 100, notnull: true, default: 'generic')]
#[Key('primary', ['id'], name: 'primary')]
#[Index('type', ['type'])]
final class MiddagItemsSchema {}
```

| Attribute | Parameters |
| --- | --- |
| `#[Table]` | `name`, `comment` |
| `#[Column]` (repeatable) | `name`, `type`, `length`, `notnull`, `sequence`, `default`, `comment`, `decimals` |
| `#[Key]` (repeatable) | `type`, `fields`, `name`, `reftable`, `reffields` (foreign keys) |
| `#[Index]` (repeatable) | `name`, `fields`, `unique` |

## DDL adapters

[`SchemaBuilderAdapterInterface`](https://github.com/middag-io/middag-php-framework/blob/main/src/Database/Contract/SchemaBuilderAdapterInterface.php) (`@api`) turns descriptors into DDL: `createTable()`, `dropTable()`, `addColumn()`, `dropColumn()`, `addIndex()`, `dropIndex()`, `tableExists()`, `columnExists()`.

| Implementation | Target |
| --- | --- |
| `MysqlSchemaBuilderAdapter` | MySQL/MariaDB over a `ConnectionInterface` |
| `SqliteSchemaBuilderAdapter` | SQLite over a `ConnectionInterface` |
| `DbalSchemaBuilderAdapter` | Any DBAL platform; needs the suggested `doctrine/dbal` |
| `XmldbSchemaAdapter` | Moodle XMLDB (in `middag-php-moodle`) |

WordPress owns its schema through `dbDelta()`, and the WordPress adapter ships no DDL adapter.

## Forward-only migrations

[`MigrationRunner`](https://github.com/middag-io/middag-php-framework/blob/main/src/Database/Schema/MigrationRunner.php) (`@api`, abstract) takes a `SchemaBuilder`, a `SchemaBuilderAdapterInterface` and a `VersionTrackerInterface`:

| Method | Behaviour |
| --- | --- |
| `install()` | Creates every described table that does not exist yet. Idempotent. |
| `upgrade(int $oldVersion)` | Creates missing tables, adds columns present in a descriptor but absent from the live table, then calls `onUpgrade($oldVersion)`. |
| `onUpgrade(int $oldVersion)` (protected) | Override point for anything else: index changes, renames, data moves. |
| `getInstalledVersion()` / `setInstalledVersion(int)` | Read and persist the schema version through the tracker. |

There is no `down()`: migrations only move forward. The base pass never drops a table, a column or an index; removals and renames are explicit code in `onUpgrade()`. DDL failures surface as `MiddagPersistenceException`.

`MysqlMigrationRunner::make($builder, $connection, $libKey)` (`@api`) wires `MysqlSchemaBuilderAdapter` and `MysqlVersionTracker` for apps on MySQL or MariaDB without a host runner. `MysqlVersionTracker` keeps one row per library key in a shared `_middag_schema_versions` table (created with `CREATE TABLE IF NOT EXISTS`), so several libraries track their versions side by side; despite the name it uses plain ANSI SQL and also runs on SQLite. The adapters ship their own `VersionTracker`.

## Transactions

`ConnectionInterface::transaction(callable)` is the connection-level primitive. The domain-facing boundary is `TransactionManagerInterface` (`executeAtomic()`, `executeGraceful()`), implemented by host adapters; the one-aggregate-per-transaction rule is described in [Active Record (Eloquent Compatibility)](./active-record-eloquent-compatibility).

Verified against `middag-php-framework/main@c9daec5` on 2026-11-04.
