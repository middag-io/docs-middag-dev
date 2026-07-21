---
title: 'moodle — Pluginfile Routing & File Areas Reference'
---

# Pluginfile Routing & File Areas Reference

Reference for how the Moodle adapter (`middag-io/middag-php-moodle`) routes `pluginfile.php` requests to file areas through a typed registry and handler contract, instead of a hardcoded switch/case. Backs [MDL-008](https://github.com/middag-io/middag-php-moodle/blob/docs/docs/decisions/MDL-008-file-areas-pluginfile-routing.md).

## Declaring a file area

```php
new file_area(
    name: 'attachments',
    description: 'File attachments for items',
    context_level: context_level::SYSTEM,
    handler: attachments_file_area_handler::class,
    supports_preview: true,
)
```

Extensions declare file areas via `get_file_area_definitions()`; external plugins add more through the `extend_local_middag_file_areas` hook.

| Field | Type | Purpose |
|---|---|---|
| `name` | `string` | Area identifier — the `{filearea}` segment of the `pluginfile.php` URL. |
| `description` | `string` | Human-readable label, used by admin/debug tooling. |
| `context_level` | `context_level` enum | Moodle context level the file area is scoped to. |
| `handler` | `class-string<file_area_handler_interface>` \| `null` | Handler class; `null` resolves to `default_file_area_handler`. |
| `supports_preview` | `bool` | Whether the file area supports Moodle's built-in file preview UI. |

## Naming convention

Mirrors the capability naming convention used across the adapter's static-generation pipeline:

| Owner | Pattern | Example |
|---|---|---|
| `core` extension | no prefix | `attachments` |
| Other internal extensions | `{slug}_{area}` | `customdocs_templates` |
| External plugins | `{plugin}_{slug}_{area}` | `middagpro_premium_reports_exports` |

## Handler contract

`file_area_handler_interface` is Group A — stable public API:

| Method | Signature | Responsibility |
|---|---|---|
| `can_access` | `can_access(context $context, string $filearea, int $itemid, string $filepath, string $filename): bool` | Authorization — must return `false` for anything the caller can't legitimately reach. |
| `serve` | `serve(stored_file $file, bool $forcedownload): void` | Delivery — must call `send_stored_file()`, never `send_file()`. |

When a `file_area` definition omits `handler`, the framework resolves `default_file_area_handler` in its place.

## Request flow

```
Browser
  -> /pluginfile.php/{contextid}/local_middag/{filearea}/...
  -> local_middag_pluginfile()
  -> resolve handler from the registry (owning extension -> container)
  -> handler::can_access()
  -> handler::serve()
```

The registry lookup happens at request time on every call — it is not build-time generated, unlike `db/services.php` for external services. `build_statics:fileareas` may generate documentation/validation artifacts, but never the routing or resolution itself.

## `file_support` method inventory

| Method | Purpose |
|---|---|
| `get_file` | Fetch a single stored file. |
| `get_area_files` | Fetch all files in a file area. |
| `create_file_from_string` | Create a stored file from raw string content. |
| `create_file_from_pathname` | Create a stored file from a filesystem path. |
| `create_file_from_storedfile` | Copy an existing stored file. |
| `delete_file` | Delete a single stored file. |
| `delete_area_files` | Delete every file in a file area. |
| `get_file_url` | Build a download URL for a stored file. |
| `has_files` | Check whether a file area has any files. |
| `get_area_size` | Total size (bytes) of a file area. |
| `count_area_files` | Count files in a file area. |
| `is_valid_image` | Validate that a stored file is a usable image. |

`url_support::pluginfile(...)` builds the full `pluginfile.php` download URL with the correct signature for a given context/component/filearea/itemid/filepath/filename tuple.

## Anti-patterns

| Anti-pattern | Why it's wrong |
|---|---|
| `can_access()` always returning `true` | Any user can access any file — defeats the purpose of a per-area authorization hook. |
| Business logic inside the handler | Handlers should delegate to the domain layer, not implement business rules themselves. |
| `send_file()` instead of `send_stored_file()` | Bypasses the File API's own headers/cache handling. |
| Not declaring a file area at all | `local_middag_pluginfile()` finds no handler for the area and the request fails. |
