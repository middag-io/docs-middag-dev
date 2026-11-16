---
title: 'middag-php-dev-tools public surface'
---

# Public surface

The curated public surface of `middag-php-dev-tools`: the gates, the generators and their configuration, and the PHPStan rules a consumer uses. Every command runs as `vendor/bin/middag-dev-tools <command>`; `vendor/bin/middag-dev-tools list` is the full catalog and `--help` gives the options of each command. Options, internal design and the commands not listed here are in the [repository](https://github.com/middag-io/middag-php-dev-tools#readme). Related: [middag-php-dev-tools](./), [Guards](../guards).

## Rules for every gate

- A gate only reads. It never changes the files it checks.
- A gate fails closed. A target that is missing, empty or unreadable is a configuration error, never a pass. A gate never reports a skip as a success.
- The gates on this page share one exit-code convention:

| Code | Meaning                                                        |
| ---- | -------------------------------------------------------------- |
| `0`  | No violations                                                  |
| `1`  | Invalid configuration: a missing option, target or source tree |
| `2`  | Violations found                                               |

## Gates for the library family

| Command              | Checks                                                                                              |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| `check:oss-purity`   | No OSS library source references a proprietary or product namespace                                 |
| `check:oss-manifest` | No OSS library requires a proprietary package in the `require` section of its `composer.json`       |
| `check:api-tags`     | Every type carries exactly one stability tag, `@api` or `@internal`, and `API-STABILITY.md` lists the live `@api` surface |

`check:oss-purity`:

- It scans the `src/` tree of each target. Every target must have that tree with at least one `.php` file.
- It scans code lines only. Comment lines and docblocks are not scanned, so a docblock may name a host or a product as an example.
- `--auto` scans every one of the five public OSS libraries (`ui`, `framework`, `moodle`, `wordpress` and `demo-standalone`) under `<root>/libs/middag-php-<name>`. If one of them is missing, the command lists it and exits `1`: a partial checkout never passes.
- The deny list lives only in `dev-tools`. It covers the proprietary namespaces and the product namespaces, and it matches them case-insensitively, as PHP resolves namespaces.
- The purity job runs it in the CI of `dev-tools`, as [Guards](../guards#oss-purity) describes. No OSS library runs it or copies its deny list.

`check:oss-manifest` reads only the production `require` section. A missing or unreadable `composer.json` exits `1`.

`check:api-tags` runs in the CI of a library that has `dev-tools` as a development dependency, against that library's own source.

## Gates for a product

| Command         | Checks                                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `check:facades` | The `@method static` list of each facade matches its `@mixin` source. `--classes-root` and `--namespace-root` are required; a missing facade directory exits `1` |
| `check:lang`    | The language-string keys of every locale match the `en` locale. Any drift exits `2`                                          |

## Architecture rules

Each library owns the architecture tests of its own boundaries in its `tests/Architecture/` suite ([Guards](../guards#what-is-guarded)). `dev-tools` adds two things on top:

- the proprietary-import rule of the OSS libraries, which only `check:oss-purity` checks, from outside;
- PHPStan rules that an internal library or a product includes in its PHPStan configuration.

The host-neutral ruleset is `vendor/middag-io/dev-tools/src/PHPStan/rules.neon`:

- **Namespace boundary.** `middagNamespaceBoundaries` lists boundaries as data. Code under `namespace` must not import anything under a `forbidden` prefix. Every key is required; `allowPaths` lists file paths exempted from the boundary and is `[]` when there is none.
- **Enum case style.** Enum cases are PascalCase. `middagEnumCasePascalCaseIgnoredEnums` exempts named enums.

```neon
includes:
  - vendor/middag-io/dev-tools/src/PHPStan/rules.neon

parameters:
  middagNamespaceBoundaries:
    - namespace: Acme\Billing
      forbidden: [Acme\Reporting]
      allowPaths: []
```

A Moodle product also includes `vendor/middag-io/dev-tools/src/Adapter/Moodle/PHPStan/rules.neon`. It blocks extension imports of `@internal` framework classes, direct coupling to forbidden framework families, and host form imports outside the configured adapter paths. The product owns the policy file, the namespace, the root path and the allowed paths the ruleset reads.

## Generated files and the marker

`generate:statics --adapter=moodle` writes the Moodle `db/*.php` files, the event classes and the managed block of the language file from the definitions of a product. The `@api` writer is `Adapter\Moodle\Statics\StaticsWriter` (namespace root `Middag\DevTools`), built with the generated-file marker of the product.

- **A whole generated file** (`db/<target>.php`, `classes/event/*.php`) is overwritten only when the file on disk carries the marker. The marker is a line comment placed before the first declaration of the file; the open tag, `declare`, `namespace`, the host guard line and a license docblock may come before it. A marker inside a docblock, a string or after the first declaration does not count.
- **A file without the marker is refused.** The writer leaves it as it is, logs a warning and returns `WriteOutcome::RefusedUnmanaged`. A hand-written file is never overwritten.
- **The language file** keeps every string outside the managed block byte for byte. A file whose begin and end block markers do not balance is refused the same way. A missing language file is created with the block.
- A file whose content already matches is not written, so its modification time and the version-control diff stay clean (`WriteOutcome::Unchanged`). A write returns `WriteOutcome::Written`.
- A dry run reports the same refusals as a real run.
- Content to write that does not carry the marker itself is a generator error and throws `InvalidArgumentException`.

## Extensions generator: `extensions.base_types`

`build:extensions` generates the extension, model, DTO, service and value-object classes of a product from its LinkML schemas. It reads `ddd-config.yaml` once and validates it before it writes anything. A missing file, invalid YAML or a missing required key throws: there are no product defaults to fall back to.

The generated classes extend the base layer of the product, never a fixed product namespace. `extensions.base_types` maps each role to the fully qualified class or interface name the product declares:

| Role               | Base of the generated                    |
| ------------------ | ---------------------------------------- |
| `item`             | item models                              |
| `item_dto`         | item DTOs (EAV entities)                 |
| `item_service`     | item services                            |
| `dto`              | plain DTOs                               |
| `value_object`     | value objects                            |
| `extension`        | `{domain}_extension` classes             |
| `service`          | standalone domain services               |
| `entity_interface` | entity contracts (an interface they extend) |

Every role is required, and each value must be a namespaced fully qualified name. The generated code imports the name and refers to its short form. The `@api` type that reads the map is `Adapter\Moodle\Linkml\MoodleBaseTypes`.

```yaml
extensions:
  base_types:
    item: Acme\Plugin\Base\Item
    item_dto: Acme\Plugin\Base\ItemDto
    item_service: Acme\Plugin\Base\ItemService
    dto: Acme\Plugin\Base\Dto
    value_object: Acme\Plugin\Base\ValueObject
    extension: Acme\Plugin\Base\Extension
    service: Acme\Plugin\Base\Service
    entity_interface: Acme\Plugin\Base\EntityInterface
```

## Glossary pages

`build:docs:terms` builds the public glossary, the hierarchy tree and the assertions page of a product from its canonical terms catalog.

- The output is neutral Markdown. It renders the same on GitHub and in VitePress, and it uses no site-specific markup.
- The front matter carries only `title` and `description`. A generated-file header comment opens each page; do not edit a generated page by hand.
- Each term heading follows its own anchor line, so existing links to a term keep resolving. A deprecated or removed term opens with a blockquote that says so.
