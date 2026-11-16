---
title: 'Demo Application — demo-standalone'
---

# Demo Application — demo-standalone

`middag-io/demo-standalone` ([middag-php-demo-standalone](https://github.com/middag-io/middag-php-demo-standalone)) is a runnable help-desk application that boots `middag-io/framework` and `middag-io/ui` with no host and no proprietary code. It is a demonstration, not a library: read it to see how the published packages wire together in a real application. Its coverage ledger lists every `@api` symbol of `ui` and `framework` and how a test proves it.

::: info Status
This page states the `2.x` line of the library family. The demo joins the family at `2.0.0`, and support starts there; its `0.x` releases are pre-stable and unsupported ([Versioning and compatibility](/libraries/reference/versioning-and-compatibility#lifecycle)).
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

The demo ships a React bundle built from `ui/`:

- **What builds it:** Vite with `@vitejs/plugin-react`. `npm ci && npm run build:host` (`vite.config.custom.ts`) writes the app entry (`app.js`, `style.css` and hashed chunks) to `public/build`.
- **What it uses:** React 19, the Inertia React client and the OSS renderer `@middag-io/react` (`^0.45.0`); `ui/src/app/register.ts` registers its shells, layouts and blocks plus the demo's own extensions.
- **From source:** `composer serve` runs the PHP built-in server on `public/`, so it serves `/build/app.js` and `/build/style.css` once the bundle is built.
- **The Docker image** builds the bundle in a Node stage and copies it into `public/build`, so a bare `docker run` serves the complete, styled application.

## Requirements

| Item                | Value                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| PHP                 | `^8.3`: 8.3, 8.4 and 8.5, with the `pdo` and `pdo_sqlite` extensions                                       |
| Symfony             | `^7.4 \|\| ^8.1` for every Symfony component it requires; the `composer.lock` its Docker image ships resolves Symfony 7.4 |
| Sibling libraries   | `middag-io/framework` `^1.20` and `middag-io/ui` `^1.8` (`composer.json`)                                  |
| Renderer            | `@middag-io/react` `^0.45.0` (`ui/package.json`)                                                            |
| Host                | none: no Moodle and no WordPress; the host ranges of the adapters do not apply                                                                                                        |
| Database            | SQLite, in a file or in memory                                                                              |

The platform rules behind these values are in [Platform](/libraries/reference/platform), which also gives the demo's CI recipe.

## Install and run

The demo is an application, so it is cloned or run as an image, never required as a dependency.

From source:

```bash
git clone https://github.com/middag-io/middag-php-demo-standalone
cd middag-php-demo-standalone
composer install
composer install:db         # create and seed the SQLite schema
composer serve              # http://localhost:8080
composer test               # PHPUnit against the real stack, in-memory SQLite
```

From the published image: each release from `2.0.0` publishes `middagtec/middag-demo-standalone` on Docker Hub for `linux/amd64` and `linux/arm64`, tagged with the release version and `latest`. The image runs PHP 8.4. Each container either serves the application or runs the worker. The `serve` container creates and seeds a SQLite file under `/app/var` on first boot; the `worker` container waits for that file and never creates it, so run both with the same `/app/var` volume.

```bash
docker run --rm -p 8080:8080 -v "$PWD/var:/app/var" middagtec/middag-demo-standalone:latest          # serve
docker run --rm -v "$PWD/var:/app/var" middagtec/middag-demo-standalone:latest worker                 # worker
```

The repository [README](https://github.com/middag-io/middag-php-demo-standalone/blob/main/README.md) lists the full route map, the console commands and the seeded login. [`DOCKER.md`](https://github.com/middag-io/middag-php-demo-standalone/blob/main/DOCKER.md) builds the image locally and runs it with Docker Compose.

## Public surface

The demo is an example application, not a library, and has no public surface ([Supported surface](/libraries/reference/versioning-and-compatibility#supported-surface)). Nothing in it is meant to be imported by another package, it keeps no `API-STABILITY.md` and no reference is generated for it. What it documents is coverage, not API:

- [`COVERAGE.md`](https://github.com/middag-io/middag-php-demo-standalone/blob/main/COVERAGE.md) lists every `@api` symbol of the installed `framework` and `ui` as covered by a demo test or E2E spec, proved by the host adapters, or a gap with its reason, and states the boundary with the internal libraries.
- The surface the demo exercises is the public surface of its siblings: the [`API-STABILITY.md` of `framework`](https://github.com/middag-io/middag-php-framework/blob/main/API-STABILITY.md), the [`API-STABILITY.md` of `ui`](https://github.com/middag-io/middag-php-ui/blob/main/API-STABILITY.md) and the reference pages of this section.

## Changelog and help

- [`CHANGELOG.md`](https://github.com/middag-io/middag-php-demo-standalone/blob/main/CHANGELOG.md) records every release and continues across the `2.0.0` cut; [Releases](https://github.com/middag-io/middag-php-demo-standalone/releases) carry the tags. The release version is also the tag of the Docker image.
- Questions and bugs: [issues of `middag-php-demo-standalone`](https://github.com/middag-io/middag-php-demo-standalone/issues). Security reports: [`SECURITY.md`](https://github.com/middag-io/middag-php-demo-standalone/blob/main/SECURITY.md); do not open a public issue for a vulnerability.
- Contributions: [`CONTRIBUTING.md`](https://github.com/middag-io/middag-php-demo-standalone/blob/main/CONTRIBUTING.md).
