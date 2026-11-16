---
title: 'Demo Application — demo-standalone'
---

# Demo Application — demo-standalone

`middag-io/demo-standalone` ([middag-php-demo-standalone](https://github.com/middag-io/middag-php-demo-standalone)) is a runnable help-desk application that boots `middag-io/framework` and `middag-io/ui` with no host and no proprietary code. It is a demonstration, not a library: read it to see how the published packages wire together in a real application. It exercises the `@api` areas of `ui` and `framework` and proves each one with a test.

::: info Status: in progress
This page states the `2.x` line of the library family. The demo stays on `0.x` until the family cut and joins the family at `2.0.0` ([Versioning and compatibility](/libraries/reference/versioning-and-compatibility#lifecycle)).
:::

## Who it is for

- Developers evaluating the framework, who want a complete application instead of isolated snippets.
- Developers of `framework` and `ui`, who use the demo and its tests as proof that the OSS stack runs on its own.

Its place in the architecture is in [OSS and internal libraries](../../explanation/architecture#oss-and-internal-libraries): the demo sits with Pillar 1, outside the dependency rings. The Moodle and WordPress adapters are outside its scope.

## What it shows

- **Kernel and DI:** the `ContainerFactory` composition root, `ServiceProvider` suffix discovery, the module lifecycle and the hook facade.
- **Command bus:** sync handlers, async commands routed to a transport and drained by a console worker, and declarative scheduling ([Dispatch, Handlers & Scheduling](../command-bus)).
- **HTTP and Inertia:** the PSR-15 kernel, controllers, session auth with the `#[Auth]` gate, the middleware pipeline, CSRF, flash and Inertia responses ([Inertia Protocol](../inertia-protocol)).
- **Request validation, two ways.** The same create path is shown with a declarative `rules()`-array `AbstractFormRequest` (`POST /api/tickets`) and with a typed DTO marked `#[ValidatedDto]` (`POST /api/tickets/dto`): the two equivalent validation styles of [Form Lifecycle & Validation](../form-lifecycle-and-validation), side by side.
- **Two persistence paradigms, one engine.** Active Record and Data Mapper over the same SQLite connection; the `/parity` page runs them side by side ([Active Record (Eloquent Compatibility)](../active-record-eloquent-compatibility), [Repository Persistence Families](../repository-persistence-families)).
- **Forms, schema and logging:** a multi-step form wizard, descriptor-driven schema with forward-only migrations, and Monolog-backed logging.
- **ui contracts:** the full page contract and a partial fragment as JSON, the payload a React client consumes ([UI Wire Contract](../ui/wire-contract)).

The demo ships no JavaScript bundle: the Inertia HTML shell embeds the page payload. Rendering the contract is a separate, downstream concern.

## Requirements

| Item                | Value                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| PHP                 | `^8.3`: 8.3, 8.4 and 8.5, with the `pdo` and `pdo_sqlite` extensions                                       |
| Symfony             | `^7.4 \|\| ^8.1` for every Symfony component it requires; the `composer.lock` its Docker image ships resolves Symfony 7.4 |
| Sibling libraries   | `middag-io/framework` and `middag-io/ui`, on the family MAJOR (`^2.0` on `2.x`)                             |
| Host                | none                                                                                                        |
| Database            | SQLite, in a file or in memory                                                                              |

The platform rules behind these values are in [Platform](/libraries/reference/platform), which also gives the demo's CI recipe.

## Run it

The demo is an application, so it is cloned, not required as a dependency:

```bash
git clone https://github.com/middag-io/middag-php-demo-standalone
cd middag-php-demo-standalone
composer install
composer install:db         # create and seed the SQLite schema
composer serve              # http://localhost:8080
composer test               # PHPUnit against the real stack, in-memory SQLite
```

The repository [README](https://github.com/middag-io/middag-php-demo-standalone/blob/main/README.md) lists the full route map, the console commands and the seeded login. [`DOCKER.md`](https://github.com/middag-io/middag-php-demo-standalone/blob/main/DOCKER.md) runs the same application in a container.

## Public surface

The demo has no public PHP surface. The rule "no tag means `@internal`" applies to it ([Supported surface](/libraries/reference/versioning-and-compatibility#supported-surface)): nothing in it is meant to be imported by another package. What it documents is coverage, not API:

- [`COVERAGE.md`](https://github.com/middag-io/middag-php-demo-standalone/blob/main/COVERAGE.md) maps each `@api` area of `framework` and `ui` to the demo artifact that exercises it and the test that proves it, and states the boundary with the internal libraries.

## Changelog and help

- [`CHANGELOG.md`](https://github.com/middag-io/middag-php-demo-standalone/blob/main/CHANGELOG.md) records every release; [Releases](https://github.com/middag-io/middag-php-demo-standalone/releases) carry the tags.
- Questions and bugs: [issues of `middag-php-demo-standalone`](https://github.com/middag-io/middag-php-demo-standalone/issues). Security reports: [`SECURITY.md`](https://github.com/middag-io/middag-php-demo-standalone/blob/main/SECURITY.md); do not open a public issue for a vulnerability.
- Contributions: [`CONTRIBUTING.md`](https://github.com/middag-io/middag-php-demo-standalone/blob/main/CONTRIBUTING.md).
