---
title: 'framework — Pre-PR Boundary Checklist'
---

# Pre-PR Boundary Checklist

Run through this before opening a pull request against `middag-php-framework`, `middag-php-ui`, or any OSS adapter in the MIDDAG PHP ecosystem. It verifies the change respects the boundaries laid out in [Architecture](../explanation/architecture) — none of these checks are automated yet in this repository, so treat them as a manual pre-flight.

## 1. Check for host leakage

Search the diff for any of `use Moodle\`, `global $DB`, `add_action()`, `Illuminate\` inside `middag-php-framework` or `middag-php-ui`. Any match is a boundary violation — that code belongs in an adapter, not in an OSS lib. Expect **zero** hits.

## 2. Check for a `core` import

Confirm no OSS library (`middag-php-framework`, `middag-php-ui`, or an adapter) imports `middag-io/core`, `middag-io/licensing`, or `middag-io/dev-tools`. If new code needs governed pub/sub, async jobs, EAV or multi-tenancy, that need itself is the signal the code is in the wrong repository — see [Architecture § The boundary invariant](../explanation/architecture#the-boundary-invariant).

## 3. Confirm `middag-php-ui` stays agnostic

If the diff touches `middag-php-ui`, confirm it imports none of `Database`, `Bus`, `PDO`, or any HTTP kernel. See [Architecture § The UI-agnostic guardrail](../explanation/architecture#the-ui-agnostic-guardrail) for the reasoning and the one-directional data flow this protects.

## 4. Put new interfaces in the right place

A new interface always lives in `<Concern>/Contract/`, carries the `*Interface` suffix, and every consumer depends on the interface — never directly on the implementation. See the [Module Layout Convention](../reference/module-layout-convention) for the full rule.

## 5. Create the seam from the first file

Don't "promote later." If the change introduces a new extension point (a role a consumer can plug into), give it a named subfolder from its very first file — moving a file into a subfolder afterwards changes its PSR-4 namespace and ripples across every repo that imports it. For persistence specifically: Active Record / query-builder code belongs only in infrastructure; the domain layer holds only plain POPOs. See [Module Layout Convention](../reference/module-layout-convention) and [Active Record ↔ Eloquent Compatibility](../reference/active-record-eloquent-compatibility).

## 6. Update the Eloquent-compatibility matrix if you touched Active Record surface

If the diff adds public surface to the Active-Record layer (`Persistence/Model.php`, `Persistence/Query/QueryBuilder.php`), update the [Active Record ↔ Eloquent Compatibility](../reference/active-record-eloquent-compatibility) matrix in the same PR, and be able to justify why the addition stays host-agnostic.
