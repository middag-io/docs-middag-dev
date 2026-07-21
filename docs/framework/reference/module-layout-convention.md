---
title: 'framework — Module Layout Convention (3-Tier Rule)'
---

# Module Layout Convention (3-Tier Rule)

Where a new interface, enum, extension point, or entry point physically lives inside `src/` of any OSS lib in the MIDDAG PHP ecosystem (`middag-php-framework`, `middag-php-ui`, and their adapters). See [Architecture](../explanation/architecture) for the wider ecosystem this convention sits inside.

## Concern-first at the root

The layout is **concern-first** at the root of `src/`: each responsibility gets its own top-level directory (`Bus/`, `Database/`, `Http/`, `Form/`, `Persistence/`, …). There is no generic `Infrastructure/`, `Service/` or `Helper/` at the root — the directory name is the *what*, never the *layer*.

## The three tiers, inside each concern

```
src/<Concern>/
├── Contract/                    # TIER-TYPE — interfaces only, *Interface suffix, zero impl
│   └── ReportRendererInterface.php
├── Enum/                        # TIER-TYPE — backed, immutable enums
├── Attribute/                   # TIER-TYPE — PHP 8 metadata (#[Attribute])
├── Renderer/                    # TIER-SEAM — extension point named by role,
│   ├── HtmlReportRenderer.php   #             created from the first file
│   └── RendererRegistry.php
├── Report.php                   # TIER-ROOT — concern entry point / active-record base
└── ReportFactory.php            # TIER-ROOT — factory / orchestrator of the concern
```

| Tier | What it is | Sub-namespace |
|---|---|---|
| **TIER-TYPE** | `Contract/`, `Enum/`, `Attribute/` — never empty when they exist | inside the concern |
| **TIER-SEAM** | A subfolder by role/extension point (`Renderer/`, `Field/`, `Transport/`) | inside the concern |
| **TIER-ROOT** | Entry points + active-record bases | concern root |

The rule that decides whether something gets a subfolder is **boundary-based**, not a file-count threshold: a subfolder marks *where consumers extend the concern*, not "a place with two or more files." A seam with exactly one file in it today is still a seam, and stays in its own subfolder.

## Rules to apply when adding a new file

1. **Create the seam from the first file — never "promote later."** PSR-4 ties namespace to path; moving `Foo.php` → `Renderer/Foo.php` after the fact ripples the namespace change across every repo that imports it.
2. **TIER-TYPE is absolute for the whole ecosystem.** Every interface, in every lib, lives in `<Concern>/Contract/` — no exceptions (for example `Page/Contract/PageInterface.php`, `Bus/Contract/MessageBusInterface.php`). No interface lives at the concern root, and the `*Interface` suffix is mandatory.
3. **Each concern owns its own `Contract/`.** There is no global, cross-concern `Contract/` directory anywhere in the ecosystem.

## Quick lookup

| You're adding… | It goes in… |
|---|---|
| A new interface for concern `Foo` | `Foo/Contract/FooSomethingInterface.php` |
| A backed enum for concern `Foo` | `Foo/Enum/` |
| A PHP 8 attribute for concern `Foo` | `Foo/Attribute/` |
| A new extension point (a role a consumer can plug into) | Its own named subfolder under the concern, from the first file (`Foo/Renderer/`, `Foo/Field/`, `Foo/Transport/`, …) |
| The concern's main entry point, factory, or orchestrator | Concern root (`Foo/Foo.php`, `Foo/FooFactory.php`) |
