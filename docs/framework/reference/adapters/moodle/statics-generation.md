---
title: 'Moodle Adapter — Static Generation: Definitions, Naming & Exclusions'
---

# Static Generation: Definitions, Naming & Exclusions

Reference for how the static files a Moodle plugin needs (`db/access.php`, `db/caches.php`, `db/services.php`, `db/messages.php`, `db/hooks.php`, `db/events.php` and the generated event classes, `db/tasks.php`) are produced from typed definitions. Verified against `middag-php-moodle` `main@6aae04d` on 2026-11-04.

## Who does what

| Piece                                                                 | Where                                     |
| --------------------------------------------------------------------- | ----------------------------------------- |
| Typed definition classes (`@api`, `final readonly`)                   | This adapter, `src/Definition/`           |
| Declaring definitions                                                 | The consumer's extensions (modules)       |
| Collecting, rendering and writing the files                           | Build tooling outside this package        |

Every definition implements `Definition\Contract\DefinitionInterface`:

| Method                                   | Purpose                                                                       |
| ---------------------------------------- | ----------------------------------------------------------------------------- |
| `toMoodleArray(string $plugin_name)`     | The entry exactly as Moodle expects it in the generated file                  |
| `isCompatible(string $moodle_version)`   | Applies the definition's `min_moodle` / `max_moodle` range                    |
| `getName()`                              | The key the entry is written under                                            |

## Definition classes

| Definition             | Target                                         | Declared by the extension through | Main fields                                                                                                                   |
| ---------------------- | ---------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `CacheDefinition`      | `db/caches.php`                                | `getCacheDefinitions()`           | `name`, `mode` (`CacheMode`, default application), `simple_keys`, `simple_data`                                               |
| `CapabilityDefinition` | `db/access.php`                                | `getCapabilities()`               | `name`, `archetypes`, `type` (`CapabilityType`), `context` (`ContextLevel`), `risk` (`CapabilityRisk`), `clone_from`          |
| `ServiceDefinition`    | `db/services.php` (`$functions`)               | `getServiceDefinitions()`         | `name`, `classname`, `type` (`read`/`write`), `method`, `description`, `ajax`, `services`, `capabilities`                       |
| `WebServiceDefinition` | `db/services.php` (`$services`)                | `getWebServiceDefinitions()`      | `name`, `shortname`, `functions`, `enabled`, `restricted_users`                                                               |
| `MessageDefinition`    | `db/messages.php`                              | `getMessageDefinitions()`         | `name`, `popup`, `email` (`MessagePermission`)                                                                                 |
| `HookDefinition`       | `db/hooks.php`                                 | `getHookDefinitions()`            | `hook_class`, `callback`, `priority`; `min_moodle` defaults to `'4.3'`                                                        |
| `EventDefinition`      | `db/events.php` and `classes/event/*`          | `getEventDefinitions()`           | `name`, `crud`, `edulevel` (`EventEdulevel`), `objecttable`, `description`                                                    |
| `FileAreaDefinition`   | Not generated; read at request time            | `getFileAreaDefinitions()`        | `name`, `context_level`, `handler`, `supports_preview`, `description`; see [File Areas](./file-areas-pluginfile-routing)       |
| `CheckDefinition`      | Not generated; collected at runtime for `lib.php` callbacks | (consumer-defined)      | `name`, `classname`, `type` (`CheckType`)                                                                                     |
| `LangDefinition`       | A managed block inside `lang/<locale>/<plugin>.php` | Passed explicitly to the generator (framework-layer catalogs, not extensions) | `key`, `strings` (locale ⇒ string, `en` required)                                       |

Every definition also carries `min_moodle` / `max_moodle`.

### Tasks

Scheduled tasks are declared with the framework's `#[Schedule]` attribute (`Middag\Framework\Bus\Attribute\Schedule`) on the task class. `Support\TaskDefinitionBuilder::build()` is the canonical statement of how a `Schedule` maps onto a `db/tasks.php` row; tooling that cannot require this package re-implements the mapping and pins parity against it. The legacy plugin also accepted a `get_task_definitions()` method as a compatibility path.

## Naming

Capabilities and file areas share one convention, implemented by `getQualifiedName()`:

| Extension      | Capability                                                         | File area                                        |
| -------------- | ------------------------------------------------------------------ | ------------------------------------------------ |
| `core` or none | `{plugin}:{name}` (for example `local/example:manage`)             | `{name}` (for example `attachments`)             |
| Any other      | `{plugin}:{extension}_{name}` (for example `local/example:ecommerce_manage`) | `{extension}_{name}` (for example `customdocs_templates`) |

Here `{plugin}` is the frankenstyle name with `_` replaced by `/`. External functions are named `{plugin_name}_{name}` (`ServiceDefinition::getQualifiedName()`). Generated event classes are `\{plugin_name}\event\{extension}_{name}`, with no extension prefix for `core` (`EventDefinition::getEventClassname()`); see [Event Observation](./event-observation-detail).

## Generation

The generator sorts entries by name, so diffs stay predictable and a file that changes for an unrelated reason is easy to spot, and it writes idempotently (unchanged input leaves files untouched). It is not part of this package. The legacy plugin drove it through one consolidated entry point, `php cli/build.php --statics [target] [--basedir=.] [--dry-run]`, which replaced the per-target scripts `build_tasks.php` and `build_events.php` (removed without a compatibility shim).

## Outside the pipeline

| Path                                       | How it is maintained                                                                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `db/install.xml`                           | By hand (XMLDB)                                                                                                                            |
| `db/upgrade*.php`, `db/install.php`        | By hand, delegating to the adapter (`Persistence\UpgradeHelper`, `Database\Schema\XmldbSchemaAdapter`); the consumer may offer before/after install hooks to its extensions (the legacy plugin exposed `extend_local_middag_install_before` / `_after`) |
| `lang/`                                    | By hand, except the managed block rendered from `LangDefinition` catalogs; hand-written strings outside the block are preserved            |
| Admin settings                             | Not generated: the same typed-definition pattern, resolved at runtime by `SettingsResolver`; see [Settings & Config Keys](./settings-and-config-keys) |
| File-area routing                          | Not generated: resolved at request time; see [File Areas](./file-areas-pluginfile-routing)                                                  |

## Enforcement state

| Clause                                                         | State                                                                 |
| -------------------------------------------------------------- | --------------------------------------------------------------------- |
| One typed definition per static kind                           | **coded** — the `Definition/` classes; review decides new kinds       |
| Generated files are never edited by hand                       | **planned** — no check in this package                                |
| Capability and file-area naming                                | **coded** — `getQualifiedName()` on the definitions                   |
| Settings and file-area routing stay out of generation          | **planned** — architectural choice, no check                          |

---

Decision record: MDL-016 in [`middag-php-moodle/docs/decisions`](https://github.com/middag-io/middag-php-moodle/tree/main/docs/decisions).
