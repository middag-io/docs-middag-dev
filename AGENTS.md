# AGENTS.md — docs-middag-dev

MIDDAG's developer documentation hub: a static site built with the Nimbus preset (`@middag-io/nimbus-preset`) and published to Cloudflare Pages at <https://docs.middag.dev>. It serves **two content layers**:

- **Own-authored (versionless).** Diataxis content this repo authors and owns, in `docs/<axis>/{tutorials,how-to,reference,explanation}/`. It covers the open-source MIDDAG PHP libraries (the MIDDAG Framework, its host adapters, `middag-php-ui` and the demo application) and the library policy in `docs/libraries/`. Those subjects interleave too much to document one repository at a time, so they live here in a single tree.
- **Aggregated (versioned).** Libraries that keep their own documentation site (for example `middag-react`) publish a versioned docs payload to the docs proxy; `docs:prebuild` pulls and injects them under `docs/injected/` at build time.

The README describes the build, the content tree and the deployment.

**What this repo is NOT:**

- Decision records are never hosted here: every library keeps its own `docs/decisions/`.
- The source of the aggregated layer: that content is authored in the source repository's `docs/` and never edited here.
- Product end-user documentation.

## Git

- Conventional Commits; **never** `Co-Authored-By`.
- Base branch: `main`. Change by pull request: `pr-checks.yml` must be green. A push to `main` deploys production (`deploy.yml`).

## Language

Docs, commits, pull requests and issues in English (public repository).

## Quality gates

Green before delivering: `npm test`, `npm run docs:build` (fetch, assemble, strict Nimbus build and the `dist/` checks) and `npm run format:check` (Prettier).

## Public repository rules

- No link or reference to a private repository, no internal decision identifier, no person name and no secret, in files, commits, pull requests or issues.
- Document only what is merged on a library's `main` or in a published release.

## NOT in scope / do not do without permission

- Adding a new own-authored axis.
- Editing content of the aggregated layer here: it belongs in the source repository's `docs/`.
- Editing anything under `docs/injected/`, `site-content/` or `dist/`: generated and gitignored.
- Deploy or Cloudflare Pages configuration changes.

## Gotchas — READ before touching

1. Own-authored navigation is curated data in `docs/<axis>/nav.json` — adding or removing a page means updating that file in the same change. `scripts/build-site.mjs` turns it into `site-navigation.json` for the preset.
2. Multi-version channels come from the `hub.config.json` allowlist — adding a repo or version happens there.
3. `npm run docs:build:nofetch` skips the proxy fetch — use it offline or when iterating on own-authored content only.
4. The build fails on any preset warning, on a broken internal link or anchor, and on a URL of `test/fixtures/live-sitemap-urls.txt` that has no page or redirect. Moving a page means adding a redirect in `site-public/_redirects`.
5. Headings whose id changed with the move to Nimbus keep their previous id as an extra anchor (`scripts/lib/site/anchors.mjs`); do not remove it, external deep links depend on it.
