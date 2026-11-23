---
title: 'wordpress adapter — Definitions and Options'
---

# Register definitions, read options and add a settings page

**Goal:** register post types, taxonomies, shortcodes and cron schedules from value objects, read your plugin's options, and build a tabbed settings page that saves them.

**Prerequisites:**

- A plugin with a kernel and a container ([Getting started](../../tutorials/wordpress/getting-started)).

## 1. Register post types, taxonomies, shortcodes and schedules

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

## 2. Read option values

Each option is a plain row in `wp_options`:

```php
use Middag\WordPress\Support\OptionSupport;

$perPage = (int) OptionSupport::get('acme_notes_per_page', 20);
```

Pass the default every time you read: `OptionSupport::get()` hands its own default to `get_option()`, so a default stored elsewhere is not used when you leave it out.

## 3. Add a settings page

`Settings\SettingsPageRegistrar` turns a tree of value objects (tabs, then sections, then fields) into WordPress Settings API calls: `add_settings_section()` for each section, and `register_setting()` with a sanitizer and `add_settings_field()` for each field. It does not add the menu entry or print the page. You do both, with the WordPress functions. Its constructor needs no argument: every parameter has a default.

### Describe the tabs

Keep the tree in one place, because both the registration and the page callback use it:

```php
<?php

declare(strict_types=1);

namespace Acme\Notes\Admin;

use Middag\WordPress\Settings\Enum\FieldType;
use Middag\WordPress\Settings\Field;
use Middag\WordPress\Settings\Section;
use Middag\WordPress\Settings\Tab;

final class NotesSettings
{
    public const string PAGE = 'acme-notes';

    /**
     * @return list<Tab>
     */
    public static function tabs(): array
    {
        return [
            new Tab('general', 'General', [
                new Section('acme_notes_display', 'Display', [
                    new Field(
                        'acme_notes_per_page',
                        'Notes per page',
                        FieldType::Number,
                        20,
                        attributes: ['min' => '1', 'max' => '100'],
                        sanitizer: static fn (mixed $value): int => max(1, min(100, (int) $value)),
                    ),
                    new Field('acme_notes_show_author', 'Show the author', FieldType::Checkbox, '1'),
                ], description: 'How the note list looks.'),
            ]),
            new Tab('mail', 'Mail', [
                new Section('acme_notes_digest', 'Digest', [
                    new Field('acme_notes_digest_to', 'Send the digest to', FieldType::Email, description: 'Leave empty to send no digest.'),
                    new Field(
                        'acme_notes_digest_format',
                        'Format',
                        FieldType::Select,
                        'text',
                        options: ['text' => 'Plain text', 'html' => 'HTML'],
                        sanitizer: static fn (mixed $value): string => \in_array($value, ['text', 'html'], true) ? $value : 'text',
                    ),
                ]),
            ]),
        ];
    }

    public static function optionGroup(Tab $tab): string
    {
        return 'acme_notes_' . $tab->slug;
    }
}
```

- `Tab($slug, $title, $sections)`: the registrar registers the tab's sections under the page slug `{page}-{slug}`, here `acme-notes-general` and `acme-notes-mail`. `tabPage($page, $tab)` returns that slug.
- `Section($id, $title, $fields, $description)`: one WordPress settings section. The description is printed, escaped, above the fields.
- `Field($name, $title, $type, $default, $options, $description, $attributes, $sanitizer, $html)`: `$name` is the option name, so each field is its own row in `wp_options`. `$options` holds the choices (`value => label`) of a `Select` or a `CheckboxList`. `$attributes` adds HTML attributes to the control, with string values. A `CheckboxList` and a `RawHtml` field ignore it.
- `FieldType` is a closed enum: `Text`, `Textarea`, `Number`, `Checkbox`, `CheckboxList`, `Select`, `Password`, `Email` and `RawHtml`. `RawHtml` prints the markup you pass in `$html` as it is, and not the stored value.

### Register the tabs

Register on `admin_init`. `add_settings_section()` and `add_settings_field()` exist only in the admin, and the registrar skips them without an error when they are missing.

```php
use Acme\Notes\Admin\NotesSettings;
use Middag\WordPress\Settings\SettingsPageRegistrar;

add_action('admin_init', static function (): void {
    foreach (NotesSettings::tabs() as $tab) {
        (new SettingsPageRegistrar())->register(NotesSettings::PAGE, NotesSettings::optionGroup($tab), [$tab]);
    }
});
```

`register($page, $optionGroup, $tabs, $capability = 'manage_options')` registers every field of `$tabs` under one option group. Use one option group per tab: call `register()` once per tab, each with its own `$optionGroup`, as the sample does. Use a new registrar for each call: a second `register()` call on the same registrar registers the tabs of the first call again. On save, WordPress writes every option of the submitted group, and an option that is not in the form is saved as an empty value (`''`, `0` or `[]` with the default sanitizers). With one group for all tabs, saving one tab would clear the fields of the others.

### Add the menu entry and the page

The page callback prints the tab links and a form that posts to `options.php`. `settings_fields()` prints the group and the nonce, and `do_settings_sections()` prints the active tab:

```php
use Acme\Notes\Admin\NotesSettings;
use Middag\WordPress\Settings\SettingsPageRegistrar;

add_action('admin_menu', static function (): void {
    add_options_page('Acme Notes', 'Acme Notes', 'manage_options', NotesSettings::PAGE, static function (): void {
        $tabs = NotesSettings::tabs();
        $requested = isset($_GET['tab']) ? sanitize_key(wp_unslash($_GET['tab'])) : '';
        $active = $tabs[0];

        foreach ($tabs as $tab) {
            if ($tab->slug === $requested) {
                $active = $tab;
            }
        }

        echo '<div class="wrap"><h1>' . esc_html(get_admin_page_title()) . '</h1><nav class="nav-tab-wrapper">';
        foreach ($tabs as $tab) {
            printf(
                '<a href="%s" class="nav-tab%s">%s</a>',
                esc_url(add_query_arg(['page' => NotesSettings::PAGE, 'tab' => $tab->slug], admin_url('options-general.php'))),
                $tab->slug === $active->slug ? ' nav-tab-active' : '',
                esc_html($tab->title),
            );
        }
        echo '</nav><form method="post" action="options.php">';
        settings_fields(NotesSettings::optionGroup($active));
        do_settings_sections((new SettingsPageRegistrar())->tabPage(NotesSettings::PAGE, $active));
        submit_button();
        echo '</form></div>';
    });
});
```

The registrar does not use the tab title: the tab links are yours. After the save, WordPress returns to the same URL, with the tab, and a page under **Settings** shows the "Settings saved." notice. A page added with `add_menu_page()` must call `settings_errors()` itself to show it.

### What happens on save

`options.php` checks the nonce and the capability of the group (`manage_options` by default). Then, for each field, the registrar's sanitizer runs:

1. If the current user does not have the capability given to `register()`, it keeps the stored value.
2. Else it runs the field's `$sanitizer`, or the default of its type:

| Type | Stored value |
| --- | --- |
| `Text`, `Password`, `Select` | `sanitize_text_field()` |
| `Textarea` | `sanitize_textarea_field()` |
| `Email` | `sanitize_email()` |
| `Number` | the number, or `0` when the value is not numeric |
| `Checkbox` | `'1'` when checked, else `''` |
| `CheckboxList` | the checked values, each through `sanitize_text_field()` |
| `RawHtml` | `wp_kses_post()` |

Read the values as in section 2, with the same default as the field:

```php
use Middag\WordPress\Support\OptionSupport;

$perPage = (int) OptionSupport::get('acme_notes_per_page', 20);
$showAuthor = OptionSupport::get('acme_notes_show_author', '1') === '1';
```

The registered default (`$default` of the field) applies only in the requests where `register()` ran, which are admin requests. Pass the default when you read.

## What can go wrong

- **`Unsupported definition: ...`** or **`Shortcode "..." render must be callable.`** `DefinitionRegistrar` received an object it does not know, or a shortcode whose renderer is not callable.
- **The post type or the schedule does not exist yet.** The definitions exist only after the `init` callback ran. Code that uses them earlier, or on `init` at a priority below 10, does not find them.
- **Saving one tab clears the fields of another tab.** The tabs share one option group. Give each tab its own group, as in [Add a settings page](#_3-add-a-settings-page).
- **The page shows no fields, or saving fails with `The ... options page is not in the allowed options list.`** `register()` did not run on that request, or it ran before the admin loaded `add_settings_section()` (on `init`, for example), so the registrar skipped the sections and fields without an error. Call it on `admin_init`, which also runs on the `options.php` save request.
- **A user who can open the page gets "Sorry, you are not allowed to manage options for this site."** `options.php` requires `manage_options` for the group whatever capability you pass to `register()`. To let another capability save, filter `option_page_capability_{group}`, for example `add_filter('option_page_capability_acme_notes_general', static fn (): string => 'edit_posts')`, and use the same capability in `register()` and in the menu entry.
- **A save keeps the old value, without an error.** The current user does not have the capability given to `register()`. The same check applies to `update_option()` calls in every request where `register()` ran, including `admin-ajax.php` and `admin-post.php` requests with no logged-in user.
- **`Invalid HTML attribute name "..." on field "..."`** (`SettingsRenderException`). A key of `$attributes` is not a valid attribute name. The error comes when the page prints the field, not when you register it.
- **A value outside the choices or the limits is saved.** The default sanitizers do not check a `Select` value against `$options`, and `min` and `max` only limit the browser. Pass a `$sanitizer`, as for `acme_notes_per_page` and `acme_notes_digest_format`.
- **The stored password is in the page source.** A `Password` field prints the stored value in its `value` attribute.

## Reference

- [Support layer](../../reference/adapters/wordpress/#support-layer): `OptionSupport` and `PostTypeSupport`.
- [Public surface](/framework/reference/adapters/wordpress/#public-surface): the `Settings` builders are part of the adapter's `@api` surface.
