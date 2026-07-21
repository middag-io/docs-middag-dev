---
title: 'moodle — Navigation Delegation & Rendering-Path Detail'
---

# Navigation Delegation & Rendering-Path Detail

Reference for how the four Moodle navigation callbacks in `middag-io/moodle` delegate to internal mechanisms, how the navigation-registration mechanism is migrating, and which rendering technology each navigation surface actually uses. Backs [MDL-018](https://github.com/middag-io/middag-php-moodle/blob/docs/docs/decisions/MDL-018-moodle-navigation-integration.md).

## Delegation pattern (all four `lib.php` navigation callbacks)

| Step | Responsibility |
|---|---|
| 1. Capability/auth check | Via `capability_interface`/`authentication_interface` — always first; no callback skips it. |
| 2. Resolve navigation items | Via an extension or internal service. |
| 3. Render | Through Moodle's navigation API (`navigation_node`, `pix_icon`, etc.). |

Step 1 is non-negotiable: it is the authorization guarantee for every navigation entry, by construction rather than by convention.

## Registration-mechanism migration

| Mechanism | Role | Status |
|---|---|---|
| `get_quick_access_links()` | Legacy navigation-registration path for extensions | Being progressively replaced |
| `navigation_registry_interface` | Registration path for extensions, introduced by the broader frontend architecture decision (MDL-019 and the `ui` library's decisions record) | Primary path going forward; adoption in progress |

The four `lib.php` callbacks — `local_middag_extend_navigation()`, `local_middag_extend_navigation_course()`, `local_middag_myprofile_navigation()`, `local_middag_render_navbar_output()` — are independent of this migration. They are not candidates for replacement by a native Moodle hook: Moodle's plugin API gives no alternative entry point for global navigation, course navigation, profile navigation, or the navbar dropdown.

A separate hook, `local_middag_extend_block_middag_content()`, lets extensions contribute content into the MIDDAG block.

## Rendering path — verified against real code (2026-07-17)

| Surface | Rendering technology | Notes |
|---|---|---|
| Institutional navigation — navbar dropdown (`src/Output/NavbarService.php`) | Mustache / native Moodle HTML output | Not Inertia. |
| Product pages elsewhere in this package | Inertia (`src/Http/Inertia/InertiaSharedProps.php`, `src/Http/Inertia/MoodleInertiaBootstrap.php`) | Real, active infrastructure that coexists deliberately with the Mustache path above. |

`NavbarService`'s own docblock confirms the boundary discipline directly:

> Uses only moodle/support/ dependencies (deptrac: MoodleInternal layer). Extensibility via hooks is handled by the caller (lib.php) which is outside the framework boundary.

These are two separate, coexisting rendering paths by design: institutional navigation uses Mustache; product pages use Inertia (the frontend architecture decisions in the `ui` library). The coexistence does not change the classification of the delegation pattern above — the callback-to-internal-mechanism pattern is generic Moodle boundary behavior, independent of which rendering technology a given extension chooses internally.

## Related

- [MDL-001 — Consolidate the Moodle Boundary Behind a Physical Whitelist](https://github.com/middag-io/middag-php-moodle/blob/docs/docs/decisions/MDL-001-boundary-consolidation-whitelist.md)
- [MDL-017 — Routing Bridge Coexistence with the Native Moodle Router](https://github.com/middag-io/middag-php-moodle/blob/docs/docs/decisions/MDL-017-routing-bridge-coexistence.md) — a structurally similar dual-path coexistence.
- [MDL-019 — Frontend Moodle Integration: Theme Bridge & AMD Build](https://github.com/middag-io/middag-php-moodle/blob/docs/docs/decisions/MDL-019-frontend-moodle-integration.md)
