---
title: 'Integrating with MIDDAG'
---

# Integrating with MIDDAG

This section is for developers who build extensions for MIDDAG products. Today that means extensions for MIDDAG for Moodle: the Moodle plugin `local_middag`, built on `middag-io/core`, the proprietary MIDDAG core library. An extension codes against a small, curated set of types and is loaded by the plugin.

## The zones of the surface

Every type in `middag-io/core` carries a class-level stability tag. The tag decides whether you may depend on it.

| Zone | What it holds | Can you depend on it? |
|---|---|---|
| Curated `@api` types of `middag-io/core` | The extension contract, signals, items and their metadata, jobs and operations, tenant, routing, capabilities, shortcodes, widgets and the core errors. These are the types this section documents. | Yes. They are meant for integrators. |
| Other `@api` types of `middag-io/core` | The rest of the tagged public surface. | Covered by the versioning policy, but not meant for integrators and not documented here. |
| What the Moodle plugin offers extension authors | The `local_middag\hook\extend_extensions` hook and the `local_middag\base\extension\abstract_extension` base class. These are the plugin types meant for extension authors and documented here. | Yes. |
| `@internal` types, and types with no tag | Loaders, discovery, boot policies, stores and everything else that is implementation detail. | No. They may change or disappear in any release, including a patch. A type with no tag counts as `@internal`. |

The open-source libraries under `middag-io/core` (`middag-io/framework`, `middag-io/ui`, `middag-io/moodle`, `middag-io/wordpress`) have their own documentation in [MIDDAG Framework](/framework/).

## Stability: `1.x` is pre-stable

`middag-io/core` is on its `1.x` line. That line is pre-stable and unsupported:

- its `@api` surface may still change in a `1.x` minor release;
- it gets no backports and no security fixes;
- there is no deprecation cycle and no upgrade guide.

`middag-io/core` is not part of the open-source version family. The support terms of a stable line of `middag-io/core` are not published yet; until they are, treat every `1.x` minor as a possible break of the curated types.

In practice, on `1.x`:

- depend only on the curated `@api` types;
- pin `middag-io/core` to the minor you tested, and read the changelog before you move to the next one;
- never call, extend or catch an `@internal` type, even if it is reachable.

## Open enums

An open enum is an `@api` enum to which a minor release may add a case. Adding a case is not a break. Each open enum says so in its docblock.

Handle an open enum in one of two ways:

- match it with a `default` arm, never by listing every case;
- or read its predicates (`isTerminal()`, `isResumable()` and the like), which keep their meaning for new cases.

```php
<?php

declare(strict_types=1);

use Middag\Core\Automation\Workflow\Model\Enum\RunStatus;

function describeRun(RunStatus $status): string
{
    return match ($status) {
        RunStatus::Succeeded => 'succeeded',
        RunStatus::Failed => 'failed',
        default => $status->isTerminal() ? 'ended' : 'in progress',
    };
}
```

The open enums of `middag-io/core` all belong to workflows and connections:

| Enum | Predicates |
|---|---|
| `Middag\Core\Automation\Workflow\Model\Enum\RunStatus` | `isTerminal()`, `isResumable()`, `isCancellable()` |
| `Middag\Core\Automation\Workflow\Model\Enum\ParkReason` | `hasResumeTime()`, `needsConfirmation()` |
| `Middag\Core\Automation\Workflow\Model\Enum\NodeRunStatus` | `isTerminal()`, `isReusableOnReprocess()` |
| `Middag\Core\Automation\Workflow\Model\Enum\RunOrigin` | `isManual()`, `isTriggered()` |
| `Middag\Core\Automation\Workflow\Model\Enum\EffectKind` | `isReadOnly()` |
| `Middag\Core\Automation\Workflow\Model\Enum\EffectMode` | `isReal()` |
| `Middag\Core\Automation\Workflow\Model\Enum\ReprocessMode` | `startsNewEpoch()`, `reusesSucceededNodes()` |
| `Middag\Core\Automation\Workflow\Model\Enum\NodeExecMode` | `isRequired()` |
| `Middag\Core\Automation\Workflow\Model\Enum\EffectVerdict` | `allowsExecution()`, `needsConfirmation()`, `isBlocking()` |
| `Middag\Core\Automation\Workflow\Model\Enum\ReferenceVerdict` | `allowsExecution()`, `parksTheRun()`, `skipsTheNode()`, `failsTheNode()` |
| `Middag\Core\Automation\Workflow\Model\Enum\NodeCategory` | `isTrigger()`, `isAction()`, `isLogic()`, `isKnown()`, `isRegistrable()` |
| `Middag\Core\Automation\Workflow\Model\Enum\WorkflowStatus` | `isObserving()`, `isEditable()` |
| `Middag\Core\Automation\Workflow\Model\Enum\ExecutionMode` | `isInline()` |
| `Middag\Core\Automation\Workflow\Model\Enum\UnresolvedToken` | None. It is a sentinel: compare it by identity, never match it. |
| `Middag\Core\Automation\Connection\ConnectionCardinality` | `allowsTenantBindings()` |
| `Middag\Core\Automation\Connection\ConnectionUse` | `isListing()` |

Workflow nodes and connections are not covered by this section yet. The table is here so that code which meets these enums handles them correctly.

## How the pages fit together

- [Extension contract](/integrate/reference/extension-contract): the interface, the base classes, the constants an extension declares and how the Moodle plugin discovers it. Start here.
- [Distribute an extension as a Composer package](/integrate/how-to/distribute-as-composer-package): ship an extension without a Moodle plugin of its own.
- [Signals and hooks](/integrate/reference/signals-and-hooks): react to what happens in the core.
- [Items and metadata](/integrate/reference/items-and-metadata): declare item types and their metadata, and query them.
- [Tenant](/integrate/reference/tenant): the tenant context and how queries are scoped to it.
- [Jobs and operations](/integrate/reference/jobs-and-operations): background jobs, imports, exports and clones.
- [Routes, capabilities, shortcodes and widgets](/integrate/how-to/routes-capabilities-shortcodes-widgets): expose pages, permissions and output.
- [Errors](/integrate/reference/errors): the core exceptions you may catch.

A generated reference of every `@api` type is not covered yet.
