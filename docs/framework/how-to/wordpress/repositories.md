---
title: 'wordpress adapter — Repositories'
---

# Read posts, users and metadata through repositories

**Goal:** query a post type, read and write post and user metadata, and look up and create users, without scattering `WP_Query` and `get_*_meta()` calls through your code.

**Prerequisites:**

- A plugin built on the adapter ([Getting started](../../tutorials/wordpress/getting-started)).
- A registered post type. This guide uses `acme_note`, registered as shown in [Definitions and options](./settings#_1-register-post-types-taxonomies-shortcodes-and-schedules).

The repositories are plain objects over the WordPress APIs. They need no container binding; create them where you need them, or register them as services to inject them.

| Class | Over | Returns |
| --- | --- | --- |
| `Domain\Post\PostRepository` | `WP_Query` through the `Persistence\QueryBuilder` | `WP_Post` objects |
| `Domain\Post\PostMetaRepository` | `get_post_meta()` / `update_post_meta()` | meta values |
| `Domain\User\UserRepository` | `get_user_by()`, `WP_User_Query`, `wp_insert_user()` | `WP_User` objects |
| `Domain\User\UserMeta` | `get_user_meta()` / `update_user_meta()` | meta values |
| `Support\MetaSupport` | the Metadata API for any meta type | meta values |

For a custom table, see [Persistence](./persistence).

## 1. Write a repository for your post type

`PostRepository` is the only repository you extend. Pass your post type to its constructor and build your own queries from `newQuery()`:

```php
<?php

declare(strict_types=1);

namespace Acme\Notes\Domain;

use Middag\WordPress\Domain\Post\PostRepository;
use WP_Post;

final class NoteRepository extends PostRepository
{
    public function __construct()
    {
        parent::__construct('acme_note');
    }

    /** @return list<WP_Post> */
    public function pinnedBy(int $authorId): array
    {
        return $this->newQuery()
            ->author($authorId)
            ->metaWhere('acme_pinned', '1')
            ->orderBy('title')
            ->get();
    }
}
```

The inherited methods:

```php
$notes = new NoteRepository();

$note = $notes->find(42);              // ?WP_Post; null when 42 is not an acme_note
$latest = $notes->first();             // newest published note, or null
$page = $notes->paginate(2, 10);       // ['data' => [...], 'total' => ..., 'per_page' => 10, 'current_page' => 2, 'pages' => ...]
$total = $notes->count();              // published notes
```

`newQuery()` returns a `Persistence\QueryBuilder` already set to your post type. The builder is immutable: every method returns a new builder, so you can keep a base query and derive others from it.

## 2. Build `WP_Query` reads with the query builder

`QueryBuilder` turns method calls into `WP_Query` arguments. Use it directly for any post type:

```php
use Middag\WordPress\Persistence\QueryBuilder;

$query = (new QueryBuilder())
    ->postType('acme_note')
    ->status(['publish', 'draft'])
    ->search('invoice')
    ->limit(5);

$posts = $query->get();   // list of WP_Post
$ids = $query->ids();     // list of post IDs
$args = $query->toArgs(); // the WP_Query arguments, for debugging
```

| Method | `WP_Query` argument |
| --- | --- |
| `postType($type)`, `status($status)` | `post_type`, `post_status` (a string or a list) |
| `author($userId)`, `parent($postId)`, `whereIn($ids)`, `search($term)` | `author`, `post_parent`, `post__in`, `s` |
| `metaWhere($key, $value, $compare = '=', $type = 'CHAR')`, `metaWhereExists($key)`, `metaRelation('OR')` | `meta_query` clauses and relation |
| `orderBy($field, $direction = 'ASC')`, `orderByMeta($key, $direction, $type)` | `orderby`, `order`, `meta_key` |
| `limit($n)`, `offset($n)`, `page($n)` | `posts_per_page`, `offset`, `paged` |
| `noFoundRows()`, `withFoundRows()` | `no_found_rows` |

Terminal methods: `get()`, `first()`, `ids()`, `count()`, `paginate()` and `find($id)`. A new builder starts with `post_type => 'post'`, `post_status => 'publish'`, 20 posts per page, newest first.

## 3. Read and write post metadata

```php
use Middag\WordPress\Domain\Post\PostMetaRepository;

$meta = new PostMetaRepository();

$meta->set($noteId, 'acme_pinned', '1');
$meta->setBatch($noteId, [
    'acme_color' => 'yellow',
    'acme_old' => null,   // null deletes the key
]);

$color = $meta->get($noteId, 'acme_color');            // 'yellow'
$size = $meta->get($noteId, 'acme_size', 'medium');    // default when the key is missing
$all = $meta->getAllForPost($noteId);                  // ['acme_pinned' => '1', 'acme_color' => 'yellow']

$meta->primeCache($noteIds);   // one query for the meta of many posts, before a loop
```

`getAllForPost()` returns the first value of every key and skips protected keys, the ones that start with `_`. `delete()` and `deleteBatch()` remove keys.

## 4. Find, create and query users

```php
use Middag\WordPress\Domain\User\UserRepository;

$users = new UserRepository();

$admin = $users->findByEmail('admin@example.org');   // ?WP_User; also findById(), findByLogin()
$current = $users->getCurrentUser();                 // ?WP_User for the session user

$result = $users->create('jane@example.org', wp_generate_password(), [
    'role' => 'editor',
    'display_name' => 'Jane',
]);
if (is_wp_error($result)) {
    // For example 'existing_user_login' or 'existing_user_email'.
    return;
}

$editors = $users->findByRole('editor');   // list of WP_User
$found = $users->search('jane');           // matches login, email and display name
$total = $users->count(['role' => 'editor']);
```

- `create()` uses the email as `user_login` unless you pass one in the third argument, and gives the `subscriber` role unless you pass another. It returns the new user's ID or a `WP_Error`.
- `update($userId, $data)` calls `wp_update_user()` and also returns the ID or a `WP_Error`.
- `query($args)` takes any `WP_User_Query` argument; it defaults to 20 users, newest first.
- `currentUserCan($capability)` accepts a capability string or a `WpCapability` case.

## 5. Read and write user metadata

```php
use Middag\WordPress\Domain\User\UserMeta;

$userMeta = new UserMeta();

$userMeta->set($userId, 'acme_theme', 'dark');
$theme = $userMeta->get($userId, 'acme_theme', 'light');
$hasTheme = $userMeta->has($userId, 'acme_theme');
$userMeta->setBatch($userId, ['acme_digest' => 'weekly', 'acme_legacy' => null]); // null deletes
```

## 6. Other meta types

`MetaSupport` reads and writes any meta type of the Metadata API, such as `term` and `comment`:

```php
use Middag\WordPress\Support\MetaSupport;

$color = MetaSupport::get('term', $termId, 'acme_color');
MetaSupport::delete('comment', $commentId, 'acme_flag');
```

## What can go wrong

- **`find()` returns `null` for an existing post.** The post belongs to another post type. `find()` checks the post type of the repository.
- **`get()` or `count()` misses drafts.** The builder reads published posts by default. Call `status(['publish', 'draft'])` or `status('any')`.
- **A stored empty string reads as the default.** `PostMetaRepository::get()` and `UserMeta::get()` return the default for a missing key **and** for a stored `''`.
- **`UserMeta::getAll()` still returns WordPress keys.** It skips keys that start with `_` or `wp_`, but not core keys such as `nickname` or `admin_color`, and not keys of a site whose table prefix is not `wp_`. Read the keys you own with `get()`.
- **`count()` is slow on a large site.** `UserRepository::count()` runs `WP_User_Query` with no limit, so it loads every matching user to count them. Pass filters such as `role` to narrow it.

## Reference

- [Database ($wpdb)](../../reference/adapters/wordpress/#database-wpdb): native content and the query builder.
- [Support layer](../../reference/adapters/wordpress/#support-layer): `MetaSupport` and the other `@api` support classes.
- [WooCommerce](../../reference/adapters/wordpress/#woocommerce): the order and product references.
