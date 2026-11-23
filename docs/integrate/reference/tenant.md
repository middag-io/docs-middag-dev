---
title: 'Tenant'
---

# Tenant

`middag-io/core` defines a tenant boundary and a query scope that limits item queries run through the query engine (`ItemQueryServiceInterface`, `Executor`) to the current tenant. `ItemServiceInterface::find()`, `getMetadata()` and `findByType()` are not filtered by `TenantScope`. Core never resolves a tenant itself and binds no provider: the product decides how a tenant is resolved and whether the scope is registered. `middag-io/core` is on its pre-stable `1.x` line; only the curated `@api` types are meant for integrators, and an open enum may gain values, so handle values you do not know. See [Integrating with MIDDAG](/integrate/explanation/overview).

## Types

| Type | Role |
|---|---|
| `Middag\Core\Tenant\TenantContext` | The current tenant: `primaryId`, `primarySlug`, `grants`, `parentId`, `environment`. Immutable. |
| `Middag\Core\Tenant\Contract\TenantContextProviderInterface` | Supplies the context: `current(): ?TenantContext` and `withTenant(TenantContext $context, callable $callback): mixed`. |
| `Middag\Core\Tenant\MissingTenantContextException` | A tenant-scoped query ran with no context while one is required. Extends `LogicException`. |
| `Middag\Core\Tenant\TenantScope` | Global query scope with the identifier `tenant` (`TenantScope::IDENTIFIER`). |
| `Middag\Core\Tenant\TenantScopeMode` | What the scope does with no context: `RequireContext` (default) or `AllowUnscoped`. |

## `TenantContext`

- `TenantContext::single(string $id, string $slug)` builds a context with one grant on `$id` that includes its descendants.
- `grants` is a list of `Middag\Core\Tenant\TenantGrant` (`@api`, outside the curated list). Each grant names one node and whether it covers that node's descendants.
- `isRoot()` is `true` when `parentId` is `null`.
- `cacheKeyPrefix()` returns a stable cache-key fragment, for example `middag.prod.acme`.

## Run work under a tenant

This applies where the product has bound a provider and registered `TenantScope`. Work without a request, such as a scheduled task or a queue worker, sets the tenant explicitly:

```php
use Middag\Core\Tenant\TenantContext;

$count = $this->tenants->withTenant(
    TenantContext::single('42', 'acme'),
    fn (): int => $this->query->queryRaw($criteria, $meta)->total(),
);
```

`withTenant()` restores the previous context when the callback returns or throws. Finish all tenant work inside the callback. The default provider (`Middag\Core\Tenant\DefaultTenantContextProvider`, `@api`) throws `LogicException` when the callback returns a generator.

## Scope behaviour

| Context | `RequireContext` | `AllowUnscoped` |
|---|---|---|
| Set | The query is limited by the product's tenant filter to the context's grants. | The query is limited by the product's tenant filter to the context's grants. |
| Not set | `MissingTenantContextException` | The query runs without the tenant filter. |

The filter is a product-supplied `Middag\Core\Tenant\Contract\TenantFilterInterface` (`@api`, outside the curated list); core does not fix the predicate. The scope applies only in `Executor::execute()`, which serves `ItemQueryServiceInterface` and `MiddagItemQueryBuilder`. Reads through `ItemServiceInterface::find()`, `getMetadata()` and `findByType()` are not filtered by `TenantScope`.

A query that must cross tenants on purpose excludes the scope with `withoutGlobalScope('tenant')` on `Middag\Core\Persistence\QueryEngine\MiddagItemQueryBuilder`. Query types are described in [Items and metadata](/integrate/reference/items-and-metadata); exceptions in [Errors](/integrate/reference/errors).
