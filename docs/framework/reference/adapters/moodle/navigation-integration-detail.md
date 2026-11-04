---
title: 'Moodle Adapter — Navigation Delegation & Rendering Paths'
---

# Navigation Delegation & Rendering Paths

Reference for how a consumer plugin's Moodle navigation callbacks delegate to the adapter, how extensions register navigation items, and which rendering technology each navigation surface uses. Verified against `middag-php-moodle` `main@6aae04d` on 2026-11-04.

## The callbacks are the consumer's, and stay thin

Moodle exposes navigation extension points only as procedural callbacks in the consumer plugin's `lib.php`:

| Callback                                   | Moodle hook point  | Typical use                    |
| ------------------------------------------ | ------------------ | ------------------------------ |
| `{component}_extend_navigation()`          | Global navigation  | Main menu entry                |
| `{component}_extend_navigation_course()`   | Course navigation  | Per-course items               |
| `{component}_myprofile_navigation()`       | User profile       | A section on the profile page  |
| `{component}_render_navbar_output()`       | Navbar             | A dropdown on the top bar      |

Moodle offers no hook-based alternative for these four surfaces, so the callbacks are permanent scaffolding. They are not phased out as registry-based registration grows. Each follows the same delegation pattern and never carries business logic:

| Step | Responsibility                                                                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | Check capability or authentication first: through `Security\Contract\CapabilityInterface` / `AuthenticationInterface` where DI is available, or the static `CapabilitySupport` / `AuthSupport` fallback in procedural code. No callback skips this step, so a navigation entry can never bypass authorization |
| 2    | Resolve the items through an extension or a service                                                                                                   |
| 3    | Render through Moodle's navigation API (`navigation_node`, `pix_icon`, …) or an adapter renderer                                                       |

A product may add further hooks of its own around these callbacks; the MIDDAG product, for example, lets extensions contribute content to its block through `local_middag_extend_block_middag_content()`.

## Adapter pieces

| Piece                                                 | Role                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Output\NavbarService::render($extra_items, $health_badge, $url_generator)` (`@internal`, called from the consumer's `render_navbar_output` callback) | Returns `''` unless the user has `moodle/site:config` in the system context; merges default items with the caller's extra items (items support `icon`, `separator`, `badge`, `badge_color`); drops invalid items; renders the `{component}/navbar-usernavigation` Mustache template with Bootstrap 5 attributes on Moodle 5.0+ and Bootstrap 4 attributes below |
| `Http\Inertia\InertiaSharedProps::buildNavigation()`  | Builds the three-level navigation tree (`tree`, `activeKey`, `footer`) for SPA pages from the `NavigationRegistryInterface` service (from `middag-io/ui`) bound in the container, marking the current route as active                                                     |

`NavbarService` uses only wrappers from `Support/`; extensibility through hooks stays with its caller in `lib.php`, which sits outside the adapter.

## Registering navigation items

| Mechanism                                       | Role                                                                                         | Status                       |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------- |
| A quick-access-links method on the extension (legacy plugin `get_quick_access_links()`) | Legacy registration path                                                                     | Being replaced progressively |
| `NavigationRegistryInterface` (`middag-io/ui`)  | Extensions register items during `boot()`; the adapter reads the registry for SPA navigation | Primary path going forward   |

The four `lib.php` callbacks are independent of this migration.

## Rendering paths

| Surface                                   | Technology                                     | Code                                                                                               |
| ----------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Navbar dropdown (institutional navigation) | Mustache, native Moodle output                 | `src/Output/NavbarService.php`                                                                     |
| SPA product pages                         | Inertia                                        | `src/Http/Inertia/InertiaSharedProps.php`, `src/Http/Inertia/MoodleInertiaBootstrap.php`           |

The two paths coexist by design. The delegation pattern above is generic Moodle boundary behavior and does not depend on which technology a page uses.

## Enforcement state

| Clause                                                       | State                                       |
| ------------------------------------------------------------ | ------------------------------------------- |
| Every navigation callback checks capability or auth first    | **planned** — code review in the consumer   |
| Callbacks only delegate                                      | **planned** — code review in the consumer   |
| The four callbacks stay regardless of registry adoption      | **planned** — code review                   |

## Related

- [Boundary & Whitelist](./boundary-whitelist)
- [Routing Bridge](./routing-bridge-maturity): a similar coexistence of a framework-owned primary mechanism with Moodle-mandated entry points.
- [Frontend Build & Theme Bridge](./frontend-build-detail)

---

Decision records: MDL-001 and MDL-018 in [`middag-php-moodle/docs/decisions`](https://github.com/middag-io/middag-php-moodle/tree/main/docs/decisions).
