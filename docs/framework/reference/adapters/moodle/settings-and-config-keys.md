---
title: 'Moodle Adapter — Settings & Config Keys'
---

# Settings & Config Keys

Reference for admin settings in `middag-io/moodle`: the typed settings DSL, `SettingsResolver` as the only bridge to Moodle's `admin_setting_*` API, the naming policy that produces config keys, typed runtime access, and the lifecycle rules. Verified against `middag-php-moodle` `main@6aae04d` on 2026-11-04.

## Settings as code

Extensions declare settings as typed objects; they never instantiate `admin_setting_*` classes. The DSL lives in `src/Settings/` (all `@api`):

| Class                             | Role                                                                                                     |
| --------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `Page`                            | Groups settings into one admin page (`name`, optional `id`, optional `label`, `settings`)               |
| `AbstractSetting`                 | Base of every setting (`name`, `default`, `label`, `description`)                                        |
| `Type/*` (22 classes)             | One class per Moodle `admin_setting_*` type (`Text`, `Checkbox`, `Select`, `EncryptedPassword`, …)        |
| `Enum/SettingType`                | The 22 types; `storesValue()` is `false` for the three display-only types                               |
| `SettingsNamingPolicy`            | Produces config keys (`{prefix}{extension}_{name}`)                                                      |
| `SettingsResolver`                | Converts declared pages into `admin_settingpage` objects                                                 |

`SettingsResolver::resolveExtensionPages(string $extension_name, array $settings, string $plugin_name)` turns each `Page` into an `admin_settingpage`, hands the resolver's naming policy to each child setting (`AbstractSetting::useNamingPolicy()`), and adds the setting's `toMoodleSetting()` result. The consumer's `settings.php` adds the returned pages under its own admin category.

### Declaration modes (consumer convention)

The consumer kernel decides how an extension hands its pages over. The MIDDAG product uses two modes, chosen by complexity:

| Mode           | When                                                    | Mechanism                                                                    |
| -------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Inline         | Few settings (up to about 10)                           | A settings-pages method on the extension class                               |
| Dedicated file | Many settings, several pages, conditional logic         | `{slug}_settings.php` in the extension's directory, auto-detected and preferred over the inline method |

## Naming

| Artifact                   | Convention (code)                                                                                   | Example (`local_example`, extension `shop`)         |
| -------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Config key                 | `{prefix}{extension}_{name}` (`SettingsNamingPolicy::configKey()`; a name already prefixed passes through) | `mdglib_shop_apikey` under the default policy |
| Admin page id              | `{plugin short name}_{extension}_{page}` unless `Page::$id` is set (`Page::resolveId()`)            | `example_shop_general`                              |
| Page label string          | `settings_page_{page}` for `core`, else `settings_page_{extension}_{page}` (`Page::resolveLabel()`) | `settings_page_shop_general`                        |
| Setting label string       | `setting_{name}` for `core`, else `setting_{extension}_{name}` (`AbstractSetting::resolveLabel()`)  | `setting_shop_apikey`                               |
| Setting description string | `{label}_desc` when that string exists, else none (`AbstractSetting::resolveDescription()`)         | `setting_shop_apikey_desc`                          |

## The naming policy

`SettingsNamingPolicy::DEFAULT_PREFIX` is `mdglib_`, a neutral library value that only marks a key as "produced by a consumer that configured no prefix". It never identifies a product. Every real product injects its own prefix at its composition root (MIDDAG's products inject `mdg_`); a third-party plugin on the same Moodle site injects its own (`new SettingsNamingPolicy('clientx_')`) so keys never collide.

Injection points (each takes an optional policy; `null` means the default):

| Where                                                                 | How                                                     |
| --------------------------------------------------------------------- | ------------------------------------------------------- |
| `SettingsResolver::__construct(SettingsNamingPolicy $policy)`         | Pages and settings materialised through this resolver   |
| `AbstractSetting::useNamingPolicy()`                                  | Set by the resolver before `toMoodleSetting()`          |
| `SettingsSupport::get()`, `set()`, `unset()`                          | Typed runtime access                                    |
| `ThemeSupport::isInheritanceEnabled()`, `getCssInjection()`, `buildTheme()` | The theme-inheritance flag (`{prefix}core_inherit_theme_colors`) |

History: the default was `mdg_` (the MIDDAG brand) until the adapter changed it to `mdglib_`, released as a marked breaking change under the family's `1.x` policy. (Before that, the legacy plugin had migrated its unprefixed keys to `mdg_` in `db/upgrade.php` version `2026040900`.) A consumer that relied on the silent default must now pass its prefix explicitly; any component that builds its own reader or support call without the policy silently reads `mdglib_*` keys and misses values written under the product prefix.

## Typed runtime access

Runtime reads and writes go through `SettingsSupport` (or `ConfigSupport` for raw keys), never `get_config()` directly.

```php
SettingsSupport::get(ShopConfig::ApiKey, $policy);          // read
SettingsSupport::set(ShopConfig::ApiKey, 'secret', $policy); // write
SettingsSupport::unset(ShopConfig::ApiKey, $policy);         // remove
```

The key argument is a string-backed enum whose short class name follows `{slug}_config`: the slug becomes the extension, the case value becomes the setting name. PascalCase names are normalised first (`ShopConfig` → `shop_config` → `shop`). An enum whose name cannot be mapped onto `{slug}_config` throws `InvalidArgumentException` instead of resolving a dead key. Subclasses can remap legacy slugs through `extensionAliases()`.

Each extension with settings keeps one such enum as the source of truth for its keys. A richer schema contract over the enum (type, default, static options, and an `isLazy()` marker for options that need services) is defined downstream; see [Config Schema Inventory](./config-schema-inventory).

## Lifecycle rules

- Settings are **not** generated by the static pipeline. They use the same typed-definition pattern and resolve at runtime (see [Static Generation](./statics-generation)).
- Settings register during Moodle's admin-tree build (the settings phase), which is separate from the extension register/boot/compile lifecycle. An extension author must not assume settings exist during boot.
- Options that need services (lazy options) are resolved only when the admin page renders, inside the page-building code, never during `register()` or `compile()`.

## DSL type coverage

`SettingType` has 22 cases: 19 store a value and 3 are display-only (`Heading`, `Description`, `Link`). `src/Settings/Type/` has a DSL class for each. The legacy plugin (April 2026) had 8 of them; the remaining 14 were added during the OSS extraction.

| Setting type                                                                                                                      | Legacy plugin | This adapter |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------ |
| `Text`, `Checkbox`, `Select`, `Password`, `Textarea`, `Heading`, `Description`, `Link`                                            | implemented   | implemented  |
| `Autocomplete`, `EncryptedPassword`, `Htmleditor`, `Colourpicker`, `Duration`, `Time`, `Multicheckbox`, `Multiselect`, `Storedfile`, `Filepath`, `Directory`, `Executable`, `Iplist`, `Portlist` | reserved      | implemented  |
| **Total**                                                                                                                         | **8 / 22**    | **22 / 22**  |

`Settings/Type/` class names follow Moodle's `admin_setting_*` casing (`Storedfile`, `Htmleditor`), not PascalCase word splits.

## Anti-patterns

| Anti-pattern                                                  | Why it is wrong                                                                   |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Instantiating `admin_setting_*` in an extension               | Bypasses the DSL, the naming policy and the resolver                              |
| `get_config()` for a declared setting                         | Bypasses the typed key; use `SettingsSupport` or `ConfigSupport`                  |
| Relying on the default prefix in a product                    | The default is the neutral `mdglib_`; inject the product prefix explicitly        |
| A config key with no matching enum case                       | A "ghost" key that never appears in the schema                                    |
| Resolving lazy options during `register()` or `compile()`     | Services are not available at that phase                                          |

## Known drift

`SettingsResolver::resolveConfigKey()` (static) always uses the default policy, not the policy injected into a resolver instance. Policy-aware callers must use the instance method `configKey()`.

## Enforcement state

| Clause                                                         | Verification                                                                                                           | State       |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------- |
| `DEFAULT_PREFIX` is the neutral `mdglib_`                       | `tests/Settings/SettingsNamingPolicyTest.php` (`defaultPolicyProducesTheNeutralLibraryKeys`)                            | **coded**   |
| A custom policy works without affecting the default            | same file (`clientPolicyProducesClientKeysWithoutAffectingTheDefault`, `resolverInstanceResolvesKeysUnderItsInjectedPolicy`, `settingAdoptsTheInjectedPolicyForItsConfigName`); `tests/Settings/AbstractSettingCoverageTest.php` (`useNamingPolicyOverridesTheDefaultPolicyUsedByResolveConfigName`) | **coded**   |
| Extensions never instantiate `admin_setting_*`                 | No static-analysis rule                                                                                                | **planned** |
| Runtime reads never call `get_config()` directly               | No static-analysis rule                                                                                                | **planned** |
| Lazy options resolve only at render time                       | Code review                                                                                                            | **planned** |

---

Decision records: MDL-011, MDL-012 and MDL-021 in [`middag-php-moodle/docs/decisions`](https://github.com/middag-io/middag-php-moodle/tree/main/docs/decisions).
