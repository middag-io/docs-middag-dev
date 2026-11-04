---
title: 'Moodle Adapter — File Areas & Pluginfile Routing'
---

# File Areas & Pluginfile Routing

Reference for declaring file areas and serving `pluginfile.php` requests through a typed definition and a handler contract instead of a hard-coded `switch`. Verified against `middag-php-moodle` `main@6aae04d` on 2026-11-04.

## Who does what

| Piece                                                                     | Where                          |
| ------------------------------------------------------------------------- | ------------------------------ |
| `Definition\FileAreaDefinition` (typed declaration, `@api`)               | This adapter                   |
| `Domain\File\Contract\FileAreaHandlerInterface` (handler contract, `@api`) | This adapter                   |
| `FileSupport`, `UrlSupport::pluginfile()` (File API wrappers)             | This adapter                   |
| The `{component}_pluginfile()` callback in `lib.php`, the registry that maps an area to its handler, and the default handler | The consumer plugin            |

## Declaring a file area

Extensions declare file areas through `getFileAreaDefinitions()`:

```php
new FileAreaDefinition(
    name: 'attachments',
    context_level: ContextLevel::System,
    handler: AttachmentsFileAreaHandler::class,
    supports_preview: true,
    description: 'File attachments for items',
)
```

| Field                      | Type                                                  | Purpose                                                                        |
| -------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| `name`                     | `string`                                              | Area name without extension prefix; the `{filearea}` segment of the URL        |
| `context_level`            | `ContextLevel` (default `System`)                     | Moodle context level the area is scoped to                                     |
| `handler`                  | `?string` (class implementing `FileAreaHandlerInterface`) | Handler class; `null` means the consumer's default handler                 |
| `supports_preview`         | `bool` (default `false`)                              | Whether the area supports Moodle's file preview and thumbnails                 |
| `description`              | `string`                                              | Human-readable label for admin and debug tooling                               |
| `min_moodle`, `max_moodle` | `?string`                                             | Version range (`isCompatible()`)                                               |

File-area definitions are not generated into a static file: they are read at request time. Build tooling may emit documentation or validation from them, never the routing itself.

## Naming

`FileAreaDefinition::getQualifiedName($extension)`:

| Owner                      | Pattern                    | Example                               |
| -------------------------- | -------------------------- | ------------------------------------- |
| `core` extension (or none) | `{name}`                   | `attachments`                         |
| Other internal extensions  | `{extension}_{name}`       | `customdocs_templates`                |
| External plugins           | `{plugin}_{extension}_{name}` (consumer convention) | `middagpro_premium_reports_exports` |

## Handler contract

| Method      | Signature                                                                                         | Responsibility                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `canAccess` | `canAccess(context $context, string $filearea, int $itemid, string $filepath, string $filename): bool` | Authorization: return `false` for anything the caller cannot legitimately reach |
| `serve`     | `serve(stored_file $file, bool $forcedownload = false): void`                                     | Delivery: call `send_stored_file()`, never `send_file()`                       |

## Request flow (consumer callback)

```
Browser
  -> /pluginfile.php/{contextid}/{component}/{filearea}/{itemid}/{path}
  -> {component}_pluginfile()             (consumer lib.php)
  -> resolve the handler for {filearea}   (consumer registry: owning extension -> container)
  -> handler->canAccess()                 (deny -> send_file_not_found / exception)
  -> handler->serve()
```

The registry lookup happens on every request; it is not generated at build time, unlike `db/services.php`.

::: warning Security requirement for consumers
The callback must call `canAccess()` and stop on `false` **before** it serves anything. A callback that falls back to serving a file without a handler decision (for example a generic `send_file()` path for undeclared areas) exposes every file in the area to any user who can guess the URL.
:::

External plugins add their own areas through a hook the consumer exposes (the MIDDAG product uses `extend_local_middag_file_areas`).

## `FileSupport` methods

| Method                                                       | Purpose                                                     |
| ------------------------------------------------------------ | ----------------------------------------------------------- |
| `getStorage()`                                               | Moodle's `file_storage`                                     |
| `getFile()`, `getFileByPath()`, `getFileById()`              | Fetch one stored file                                       |
| `getAreaFiles()`, `getAreaFilesTyped()`                      | All files in an area (raw or as `Domain\File\StoredFile`)   |
| `getFileEntity()`                                            | One file as `Domain\File\StoredFile`                        |
| `createFileFromString()`, `createFileFromPathname()`, `createFileFromStored()` | Create a stored file                       |
| `deleteFile()`, `deleteFileById()`, `deleteAreaFiles()`      | Delete one file or a whole area                             |
| `getFileUrl()`                                               | Download URL for a stored file                              |
| `hasFiles()`, `countAreaFiles()`, `getAreaSize()`            | Area inspection                                             |
| `isValidImage()`                                             | Check that a stored file is a usable image                  |
| `getContent()`, `getContentFileHandle()`                     | Read file content                                           |

`UrlSupport::pluginfile(...)` builds the `pluginfile.php` URL for a context, component, file area, item id, path and file name.

## Anti-patterns

| Anti-pattern                              | Why it is wrong                                                             |
| ----------------------------------------- | --------------------------------------------------------------------------- |
| `canAccess()` always returning `true`     | Any user can read any file; the per-area authorization hook is defeated     |
| Serving without calling `canAccess()`     | Same exposure, from the callback side                                       |
| Business logic inside a handler           | A handler delegates to the domain; it does not implement rules              |
| `send_file()` instead of `send_stored_file()` | Bypasses the File API's own headers and cache handling                  |
| An undeclared file area                   | The callback finds no handler and the request fails                         |

---

Decision records: MDL-008 and MDL-016 in [`middag-php-moodle/docs/decisions`](https://github.com/middag-io/middag-php-moodle/tree/main/docs/decisions).
