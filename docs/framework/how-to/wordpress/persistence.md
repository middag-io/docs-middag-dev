---
title: 'wordpress adapter — Persistence'
---

# Store data with the `$wpdb` connection adapter

**Goal:** create a custom table for your plugin, track its schema version, and read and write it through the framework's connection contract, with `$wpdb` underneath.

**Prerequisites:**

- A plugin with a kernel and a container, as built in [Getting started with the WordPress adapter](../../tutorials/wordpress/getting-started).
- A MySQL or MariaDB database with InnoDB tables (the WordPress default).

Your code depends on the framework contracts `ConnectionAdapterInterface` and `VersionTrackerInterface`. The adapter's `WpdbConnectionAdapter` and `VersionTracker` implement them, and only your composition root names those classes. To read WordPress posts and users instead of a custom table, see [Repositories](./repositories).

## 1. Bind the connection and the version tracker

In `buildContainer()`, register `$wpdb` as a synthetic service, the connection adapter on top of it, and a version tracker with **your** option name:

```php
use Acme\Notes\Domain\NoteSchema;
use Acme\Notes\Domain\NoteStore;
use Middag\Framework\Database\Contract\ConnectionAdapterInterface;
use Middag\Framework\Database\Contract\VersionTrackerInterface;
use Middag\WordPress\Database\WpdbConnectionAdapter;
use Middag\WordPress\Persistence\VersionTracker;
use Symfony\Component\DependencyInjection\Reference;
use wpdb;

$builder->register('wpdb', wpdb::class)->setSynthetic(true);
$builder->register(ConnectionAdapterInterface::class, WpdbConnectionAdapter::class)
    ->setArguments([new Reference('wpdb')])
    ->setPublic(true);
$builder->register(VersionTrackerInterface::class, VersionTracker::class)
    ->setArguments(['acme_notes_schema_version'])
    ->setPublic(true);
// Your own classes, written in steps 2 and 3.
$builder->register(NoteSchema::class)->setAutowired(true)->setPublic(true);
$builder->register(NoteStore::class)->setAutowired(true)->setPublic(true);

// ... your other services ...

$builder->compile();
$builder->set('wpdb', $GLOBALS['wpdb']);
```

- `NoteSchema` and `NoteStore` are the classes you write in steps 2 and 3. Autowiring passes them the two contracts bound above.
- The connection adapter builds its own SQL dialect (`WpdbSqlDialect`) from `$wpdb->prefix`. Reach it with `$connection->dialect()`.
- `VersionTracker` stores an integer in a `wp_options` row that is not autoloaded. The option name is required; there is no default.

## 2. Create the table on activation

WordPress owns its schema through `dbDelta()`, and the adapter ships no schema builder. Create the table with `dbDelta()` and record the version you installed:

```php
<?php

declare(strict_types=1);

namespace Acme\Notes\Domain;

use Middag\Framework\Database\Contract\ConnectionAdapterInterface;
use Middag\Framework\Database\Contract\VersionTrackerInterface;

final class NoteSchema
{
    private const int VERSION = 1;

    public function __construct(
        private readonly ConnectionAdapterInterface $connection,
        private readonly VersionTrackerInterface $versions,
    ) {}

    public function install(): void
    {
        if ($this->versions->getVersion() >= self::VERSION) {
            return;
        }

        $table = $this->connection->dialect()->table('acme_notes');
        $charset = $GLOBALS['wpdb']->get_charset_collate();

        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        dbDelta("CREATE TABLE {$table} (
  id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  user_id bigint(20) unsigned NOT NULL,
  title varchar(190) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'open',
  PRIMARY KEY  (id),
  KEY user_id (user_id)
) {$charset};");

        $this->versions->setVersion(self::VERSION);
    }
}
```

Run `install()` from your activation callback (see [Cron](./cron#_3-unschedule-on-deactivation) for `PluginLifecycle`). To change the schema later, raise `VERSION`, edit the `CREATE TABLE` statement and let `dbDelta()` apply the difference. Call `install()` on `plugins_loaded` too if you ship updates that are not reactivated.

`dialect()->table('acme_notes')` returns the physical name, for example `wp_acme_notes`, or `wp_2_acme_notes` on the second site of a network.

## 3. Read and write rows

```php
<?php

declare(strict_types=1);

namespace Acme\Notes\Domain;

use Middag\Framework\Database\Contract\ConnectionAdapterInterface;
use Middag\Framework\Persistence\Query\QueryBuilder;

final class NoteStore
{
    private readonly string $table;

    public function __construct(
        private readonly ConnectionAdapterInterface $connection,
    ) {
        // The physical name, for example wp_acme_notes.
        $this->table = $connection->dialect()->table('acme_notes');
    }

    public function add(int $userId, string $title): int
    {
        return $this->connection->insert($this->table, ['user_id' => $userId, 'title' => $title]);
    }

    public function close(int $id): void
    {
        $this->connection->update($this->table, ['id' => $id, 'status' => 'closed']);
    }

    /** @return list<array<string, mixed>> */
    public function openFor(int $userId): array
    {
        return $this->connection->fetchAll(
            "SELECT id, title FROM {$this->table} WHERE user_id = :user AND status = :status ORDER BY id",
            ['user' => $userId, 'status' => 'open'],
        );
    }

    public function countOpen(): int
    {
        return QueryBuilder::on($this->connection, $this->table)
            ->where('status', 'open')
            ->count();
    }

    public function moveAll(int $fromUser, int $toUser): int
    {
        return $this->connection->transaction(
            fn (ConnectionAdapterInterface $tx): int => $tx->execute(
                "UPDATE {$this->table} SET user_id = :to WHERE user_id = :from",
                ['to' => $toUser, 'from' => $fromUser],
            ),
        );
    }
}
```

What the connection adapter does with each call:

| Method | Behaviour |
| --- | --- |
| `insert($table, $record)` | `$wpdb->insert()`; returns the new auto-increment id |
| `update($table, $record)` | `$wpdb->update()` keyed on the record's `id` element |
| `delete($table, $conditions)` | `$wpdb->delete()` with column `=` value conditions |
| `find($table, $conditions)`, `findAll($table, $conditions)` | `SELECT *` with column `=` value conditions |
| `fetch($sql, $params)`, `fetchAll($sql, $params)` | one row or all rows, as associative arrays |
| `execute($sql, $params)` | any statement; returns the affected row count |
| `cursor($sql, $params)` | yields rows one by one, but `$wpdb` buffers the whole result first |
| `transaction($work)` | `START TRANSACTION`, then `COMMIT`, or `ROLLBACK` and rethrow when `$work` throws |

Parameters are passed to `$wpdb->prepare()`. Use named placeholders (`:user` with the key `user`) or positional `?`, never both in one statement. An `int` or `bool` value is bound as `%d`, a `float` as `%f`, anything else as `%s`. A failed query, insert, update or delete throws `WordPressDatabaseException` with `$wpdb->last_error` in the message.

`QueryBuilder::on($connection, $table)` is the framework's SQL query builder, `Middag\Framework\Persistence\Query\QueryBuilder`. The adapter's own `Middag\WordPress\Persistence\QueryBuilder` is a different class: it builds `WP_Query` reads over posts and is covered in [Repositories](./repositories#_2-build-wp-query-reads-with-the-query-builder). The framework builder is fluent (`where()`, `orderBy()`, `paginate()`, `insert()`, `update()`, `upsert()`, ...). It runs on the same connection, so it uses the same prepared statements and the same dialect.

## 4. Use framework models, if you want them

The adapter ships no model or mapper layer. The framework's `Model` (Active Record) runs on any `ConnectionAdapterInterface`, including this one. Give the model the physical table name, the same way as above:

```php
use Middag\Framework\Database\Contract\ConnectionAdapterInterface;
use Middag\Framework\Persistence\Model;

final class Note extends Model
{
    protected array $fillable = ['user_id', 'title', 'status'];

    public function getTable(): string
    {
        return $this->resolveConnection()->dialect()->table('acme_notes');
    }
}

// Once, after the container is built (for example in onBoot()):
Model::setConnection($container->get(ConnectionAdapterInterface::class));

$note = Note::create(['user_id' => 9, 'title' => 'Call the bank', 'status' => 'open']);
$first = Note::where('user_id', 9)->first();
```

`Model::setConnection()` sets one connection for every model in the PHP process. If several plugins in one request use framework models, they share it. See [Active Record (Eloquent Compatibility)](../../reference/active-record-eloquent-compatibility) for the model API.

## 5. Check what the database supports

`$connection->supports(Capability::...)` tells portable code what this connection can do:

| `Capability` | On `$wpdb` |
| --- | --- |
| `Transactions` | yes (meaningful on InnoDB only) |
| `Upsert` | yes, `INSERT ... ON DUPLICATE KEY UPDATE` |
| `RowLock` | yes, `FOR UPDATE` / `FOR SHARE` |
| `JsonWhere` | yes |
| `Streaming`, `Returning`, `SchemaDiff` | no |

`Middag\WordPress\Persistence\Query\WpdbConditionCompiler` implements the framework's `ConditionCompilerInterface` for MySQL. Bind it only when a library you use asks for that contract; it takes a `WpdbSqlDialect` built with `$wpdb->prefix`.

## What can go wrong

- **`update() into [...] requires an "id" element.`** `update()` keys on a column named `id`. WordPress core tables use `ID`; write to them through the WordPress APIs or the repositories, not through `update()`.
- **A named parameter is bound to the wrong placeholder.** Placeholders are replaced in the order of the parameter array, first match first. Do not use a name that is the start of another one in the same statement (`:id` and `:id_list`).
- **A `LIKE` query returns nothing.** `$wpdb->prepare()` reads a literal `%` in the SQL string as part of a placeholder. Pass the pattern as a parameter (`'%' . $wpdb->esc_like($term) . '%'`), not inside the SQL string.
- **Column names from user input.** Conditions and table names are not escaped; only values are bound. Never build them from request data.
- **A transaction inside a transaction.** `transaction()` does not nest. MySQL commits the open transaction when it receives a second `START TRANSACTION`, so the outer work can no longer roll back.

## Reference

- [Database ($wpdb)](../../reference/adapters/wordpress/#database-wpdb): the dialect, the capabilities and the schema rules.
- [Database Schema & Migrations](../../reference/database-schema-and-migrations): the framework's schema contracts.
- [Adapter Port Catalog](../../reference/bridge-contracts): every port and its WordPress implementation.
