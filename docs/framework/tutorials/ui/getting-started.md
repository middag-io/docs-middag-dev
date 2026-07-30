---
title: 'ui — Getting Started'
---

# Getting Started with ui

Requires PHP `^8.2`. Install via Composer:

```bash
composer require middag-io/ui
```

Compose a form layout from immutable value objects — the result serializes to a JSON contract a renderer consumes:

```php
use Middag\Ui\Block\Section;
use Middag\Ui\Form\Group;

$section = Section::of('personal')
    ->label('Personal details')
    ->fields(
        $nameField,
        $emailField,
        Group::of('phone')->fields($countryField, $numberField),
    );
```

That's the whole idea: you never write markup, you compose value objects — the same contract renders standalone, inside a Moodle plugin, or inside WordPress, by swapping the renderer downstream.

## Where it's consumed

| Consumer | How |
|---|---|
| `middag-io/framework` | Maps the contracts to its Inertia renderer and form pipeline. |
| Host adapters (Moodle, WordPress) | Render the contract through the host's UI, via the framework. |
| `@middag-io/react` (NPM) | Consumes the emitted JSON page contract on the client. |

## Next

- [Architecture](../../explanation/ui/architecture) — the PageContract system, the composition levels, the concern-first layout, and why nothing here renders.
- [Composition Levels, Block Catalog & Capabilities](../../reference/ui/composition-levels-and-capabilities) — the L1-L4 API table and the full block/capability reference.
