---
title: 'wordpress adapter — Hooks'
---

# Register WordPress hooks and host events

**Goal:** keep your `add_action()` and `add_filter()` calls in small hook classes that the adapter discovers and registers, and publish your plugin's own events as WordPress actions under a prefix you choose.

**Prerequisites:**

- A plugin with a kernel and a container ([Getting started](../../tutorials/wordpress/getting-started)).
- A Composer PSR-4 autoload entry for the namespace of your hook classes.

## 1. Write a hook class

A hook class implements `Hook\Contract\HookInterface`. Its `register()` method adds the WordPress hooks it owns:

```php
<?php

declare(strict_types=1);

namespace Acme\Notes\Hooks;

use Middag\WordPress\Hook\Contract\HookInterface;

final class BodyClassHook implements HookInterface
{
    public function register(): void
    {
        add_filter('body_class', [$this, 'addClass']);
    }

    /**
     * @param list<string> $classes
     *
     * @return list<string>
     */
    public function addClass(array $classes): array
    {
        $classes[] = 'acme-notes';

        return $classes;
    }
}
```

A hook class can take constructor dependencies. Then it must be a service in your container, so the registrar gets it from there:

```php
<?php

declare(strict_types=1);

namespace Acme\Notes\Hooks;

use Middag\Framework\Kernel\Contract\HostEventBridgeInterface;
use Middag\WordPress\Hook\Contract\HookInterface;
use WP_Post;

final class NoteOnPublishHook implements HookInterface
{
    public function __construct(
        private readonly HostEventBridgeInterface $events,
    ) {}

    public function register(): void
    {
        add_action('transition_post_status', [$this, 'onTransition'], 10, 3);
    }

    public function onTransition(string $newStatus, string $oldStatus, WP_Post $post): void
    {
        if ($newStatus === 'publish' && $oldStatus !== 'publish' && $post->post_type === 'acme_note') {
            // Fires the WordPress action "acme_notes/note.published" with $post->ID.
            $this->events->dispatch('note.published', [$post->ID]);
        }
    }
}
```

## 2. Let the registrar discover your hooks

`HookRegistrar` scans one or more directories, finds every class that implements `HookInterface`, and calls `register()` on each. Register it, the event bridge and every hook that has constructor arguments in `buildContainer()`:

```php
use Acme\Notes\Hooks\NoteOnPublishHook;
use Middag\Framework\Kernel\Contract\HostEventBridgeInterface;
use Middag\WordPress\Bus\WpHostEventBridge;
use Middag\WordPress\Hook\HookRegistrar;
use Symfony\Component\DependencyInjection\Reference;

$builder->register(HostEventBridgeInterface::class, WpHostEventBridge::class)
    ->setArguments(['acme_notes/'])
    ->setPublic(true);
$builder->register(NoteOnPublishHook::class)->setAutowired(true)->setPublic(true);
$builder->register(HookRegistrar::class)
    ->setArguments([new Reference('service_container'), ['Acme\\Notes\\Hooks\\' => ACME_NOTES_DIR . 'src/Hooks']])
    ->setPublic(true);
```

The second argument maps a namespace to the directory that holds it. A file `src/Hooks/BodyClassHook.php` becomes the class `Acme\Notes\Hooks\BodyClassHook`; subdirectories add namespace segments.

You do not call `register()` yourself. When the container has `HookRegistrar`, the kernel calls its `register()` on WordPress `init` at priority 5. A hook class without constructor arguments, such as `BodyClassHook`, does not need a container entry: the registrar creates it with `new`.

## 3. Publish and listen to your plugin's events

`WpHostEventBridge` implements the framework's `HostEventBridgeInterface` with native WordPress actions. The prefix you pass names the action:

```php
// Fire: do_action('acme_notes/note.published', 42)
$events->dispatch('note.published', [42]);

// Listen: add_action('acme_notes/note.published', $listener, 20)
$events->listen('note.published', static function (int $noteId): void {
    // ...
}, 20);
```

- `dispatch()` passes each element of the payload list as a separate action argument.
- `listen()` accepts every argument the action fires with; you do not pass an argument count.
- Other plugins and themes can listen with plain `add_action('acme_notes/note.published', ...)`. Name the prefix after your plugin, because two plugins that keep the neutral default `middaglib/` share every event name.

## What can go wrong

- **No hook runs, and there is no error.** Check the path pair. The namespace must end with `\\` and the directory must not end with `/`. `plugin_dir_path()` returns a trailing slash, so write `ACME_NOTES_DIR . 'src/Hooks'`, not `ACME_NOTES_DIR . 'src/Hooks/'`. The class must also be loadable through your autoloader.
- **`HookRegistrar requires at least one namespace => directory pair.`** or **`... received a non-existing directory ...`.** The constructor validates the map. The second error names the namespace and the path it could not find.
- **`... requires constructor arguments but is not registered in the container.`** A discovered hook has a constructor with required arguments and is not a container service. Register it as a public service, as in step 2.
- **Your callback never fires.** The registrar runs on `init` at priority 5. A hook class that adds a callback to an action that already fired, such as `plugins_loaded` or `init` at a priority before 5, is too late. Hook those from your main plugin file or your kernel's `onBoot()` instead.
- **`Error: Unknown named parameter $id`.** The payload of `dispatch()` is spread into arguments, so its string keys become named arguments. Pass a list (`[$orderId, $total]`), not an associative array.

## Reference

- [Bridges are native first](../../reference/adapters/wordpress/#bridges-are-native-first): the event bridge and the hookfile loader.
- [Configuration & Identity](../../reference/adapters/wordpress/configuration#the-consumer-kernel): when the kernel calls the registrar.
- [Hooks — Public Surface & Naming](../../reference/hooks-public-surface): the framework's hook model.
