---
title: 'wordpress adapter — Settings and Definitions'
---

# Build a settings page and register definitions

**Goal:** describe your plugin's options as fields, sections and tabs, let the adapter register them with the WordPress Settings API, and register post types, taxonomies, shortcodes and cron schedules from value objects.

**Prerequisites:**

- A plugin with a kernel and a container ([Getting started](../../tutorials/wordpress/getting-started)).
- A user with the `manage_options` capability to open the page.

## 1. Describe the fields

A settings page is a list of `Tab` objects. A tab holds `Section` objects, and a section holds `Field` objects. Each field is one row in `wp_options`, named by the field's `name`:

```php
<?php

declare(strict_types=1);

namespace Acme\Notes\Admin;

use Middag\WordPress\Settings\Enum\FieldType;
use Middag\WordPress\Settings\Field;
use Middag\WordPress\Settings\Section;
use Middag\WordPress\Settings\SettingsPageRegistrar;
use Middag\WordPress\Settings\Tab;
use Middag\WordPress\Support\AdminSupport;

final class SettingsPage
{
    public const string PAGE = 'acme-notes-settings';

    public function __construct(
        private readonly SettingsPageRegistrar $registrar,
    ) {}

    /** @return list<Tab> */
    public function tabs(): array
    {
        return [
            new Tab('general', 'General', [
                new Section('display', 'Display', [
                    new Field('acme_notes_per_page', 'Notes per page', FieldType::Number, 20),
                    new Field('acme_notes_show_closed', 'Show closed notes', FieldType::Checkbox),
                ], 'How notes are listed.'),
            ]),
            new Tab('email', 'Email', [
                new Section('digest', 'Daily digest', [
                    new Field('acme_notes_digest_to', 'Send the digest to', FieldType::Email, description: 'Leave empty to disable the digest.'),
                    new Field('acme_notes_digest_format', 'Format', FieldType::Select, 'html', ['html' => 'HTML', 'text' => 'Plain text']),
                ]),
            ]),
        ];
    }

    /** On admin_init: one option group per tab, so saving one tab never clears another. */
    public function registerSettings(): void
    {
        foreach ($this->tabs() as $tab) {
            $this->registrar->register(self::PAGE, self::PAGE . '-' . $tab->slug, [$tab]);
        }
    }

    /** On admin_menu. */
    public function addMenu(): void
    {
        AdminSupport::addMenuPage('Acme Notes', 'Acme Notes', 'manage_options', self::PAGE, [$this, 'render']);
    }

    public function render(): void
    {
        $tabs = $this->tabs();
        $slugs = array_map(static fn (Tab $tab): string => $tab->slug, $tabs);
        $requested = sanitize_key((string) ($_GET['tab'] ?? ''));
        $current = $tabs[(int) array_search($requested, $slugs, true)];

        echo '<div class="wrap"><h1>Acme Notes</h1><nav class="nav-tab-wrapper">';
        foreach ($tabs as $tab) {
            printf(
                '<a href="%s" class="nav-tab%s">%s</a>',
                esc_url(add_query_arg(['page' => self::PAGE, 'tab' => $tab->slug], admin_url('admin.php'))),
                $tab === $current ? ' nav-tab-active' : '',
                esc_html($tab->title),
            );
        }
        echo '</nav><form method="post" action="options.php">';
        settings_fields(self::PAGE . '-' . $current->slug);
        do_settings_sections($this->registrar->tabPage(self::PAGE, $current));
        submit_button();
        echo '</form></div>';
    }
}
```

`Field` takes, in order: `name`, `title`, `type` (default `FieldType::Text`), `default`, `options` (value => label, for `Select` and `CheckboxList`), `description`, `attributes` (extra HTML attributes), `sanitizer` and `html` (the markup of a `RawHtml` field).

| `FieldType` | Control | Default sanitizer |
| --- | --- | --- |
| `Text`, `Password` | `<input>` | `sanitize_text_field()` |
| `Email` | `<input type="email">` | `sanitize_email()`; an invalid address becomes `''` |
| `Number` | `<input type="number">` | a number, or `0` when the value is not numeric |
| `Textarea` | `<textarea>` | `sanitize_textarea_field()` |
| `Checkbox` | one checkbox | `'1'` or `''` |
| `CheckboxList`, `Select` | checkboxes, `<select>` from `options` | `sanitize_text_field()` on each value |
| `RawHtml` | the field's `html` as is | `wp_kses_post()` |

Pass your own callable as `sanitizer` to replace the default, for example `sanitizer: static fn (mixed $value): int => max(1, min(100, (int) $value))`.

## 2. Wire the page

`SettingsPageRegistrar` needs the adapter's settings registrar as its first constructor argument. Bind both, and your page, in `buildContainer()`:

```php
use Acme\Notes\Admin\SettingsPage;
use Middag\WordPress\Settings\SettingsPageRegistrar;
use Middag\WordPress\Settings\SettingsRegistrar;
use Symfony\Component\DependencyInjection\Reference;

$builder->register(SettingsRegistrar::class);
$builder->register(SettingsPageRegistrar::class)
    ->setArguments([new Reference(SettingsRegistrar::class)])
    ->setPublic(true);
$builder->register(SettingsPage::class)->setAutowired(true)->setPublic(true);
```

::: warning SettingsRegistrar is internal
`Settings\SettingsRegistrar` is tagged `@internal`, but `SettingsPageRegistrar` requires it. Name it only here, to construct `SettingsPageRegistrar`, and do not call it from your own code: it may change in any release.
:::

Hook the page in your kernel's `onBoot()`:

```php
$settings = $container->get(SettingsPage::class);
add_action('admin_menu', [$settings, 'addMenu']);
add_action('admin_init', [$settings, 'registerSettings']);
```

`register($page, $optionGroup, $tabs, $capability = 'manage_options')` adds, for each tab, the sections and fields on the settings page `{page}-{tab slug}`, and registers each field as a setting of `$optionGroup` with its sanitizer. The page renders the form itself: `settings_fields()` with the option group, then `do_settings_sections()` with `tabPage($page, $tab)`.

## 3. Read the values

Each field is a plain option:

```php
use Middag\WordPress\Support\OptionSupport;

$perPage = (int) OptionSupport::get('acme_notes_per_page', 20);
```

Pass the default every time you read: `OptionSupport::get()` hands its own default to `get_option()`, so the field's default is not used when you leave it out.

## 4. Register post types, taxonomies, shortcodes and schedules

The definition value objects describe what WordPress registers, and `DefinitionRegistrar` registers them. Call it on `init`:

```php
use Middag\WordPress\Definition\CronScheduleDefinition;
use Middag\WordPress\Definition\DefinitionRegistrar;
use Middag\WordPress\Definition\PostTypeDefinition;
use Middag\WordPress\Definition\ShortcodeDefinition;
use Middag\WordPress\Definition\TaxonomyDefinition;

add_action('init', static function (): void {
    (new DefinitionRegistrar())->register([
        new PostTypeDefinition('acme_note', 'Note', 'Notes', ['supports' => ['title', 'custom-fields']]),
        new TaxonomyDefinition('acme_label', ['acme_note'], 'Label', 'Labels'),
        new ShortcodeDefinition('acme_note_count', static fn (): string => (string) wp_count_posts('acme_note')->publish),
        new CronScheduleDefinition('acme_weekly', 7 * DAY_IN_SECONDS, 'Once a week'),
    ]);
});
```

- `PostTypeDefinition($slug, $singular, $plural, $args)` builds the labels from the two names and defaults to a private post type with an admin screen (`public => false`, `show_ui => true`, `supports => ['title']`). Keys in `$args` replace the defaults.
- `TaxonomyDefinition($slug, $objectTypes, $singular, $plural, $args)` defaults to a private, flat taxonomy with an admin screen.
- `ShortcodeDefinition($tag, $render)` registers the shortcode; `$render` must be callable.
- `CronScheduleDefinition($slug, $intervalSeconds, $display)` adds a schedule on `cron_schedules`. Use it with `wp_schedule_event()`, as shown in [Cron](./cron#_5-use-a-schedule-of-your-own).

## What can go wrong

- **Saving one tab clears the fields of another.** WordPress's `options.php` writes every option of the posted option group, and sets the options that are not in the form to `null`. Give each tab its own option group, as `registerSettings()` does.
- **A user without `manage_options` gets "Sorry, you are not allowed to manage options for this site".** `options.php` checks `manage_options` for every option group. When you pass another capability to `register()`, also return it from the `option_page_capability_{option group}` filter.
- **A value is not saved.** The sanitizer runs only for a user who has the capability passed to `register()`; for anyone else the stored value is kept.
- **The page shows no fields.** `register()` ran after the page rendered, or `do_settings_sections()` received the plain page slug. Hook `register()` on `admin_init` and pass `tabPage($page, $tab)`.
- **`SettingsRenderException: Invalid HTML attribute name ...`.** A key in a field's `attributes` is not a valid attribute name. Names must match `/^[a-zA-Z][\w:-]*$/`.
- **`Unsupported definition: ...`** or **`Shortcode "..." render must be callable.`** `DefinitionRegistrar` received an object it does not know, or a shortcode whose renderer is not callable.

## Reference

- [Support layer](../../reference/adapters/wordpress/#support-layer): `AdminSupport`, `OptionSupport` and `PostTypeSupport`.
- [Form Lifecycle & Validation](../../reference/form-lifecycle-and-validation): the framework's form model, for screens beyond the Settings API.
