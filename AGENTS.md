# AGENTS.md — docs-middag-dev

MIDDAG's unified developer documentation hub — a VitePress static site that AGGREGATES library docs at build time (ADR-016) and publishes to Cloudflare Pages at <https://docs.middag.dev>. This repo owns NO library documentation content: each library publishes a versioned docs payload to the docs proxy (Worker + R2); the prebuild pulls and injects them.

**What this repo is NOT:**

- Library docs are authored in each library repo's `docs/` — never here.
- The proxy/edge layer lives in `worker-ts-middag-docs-proxy` (aggregator doctrine in its README); the doctrine-search MCP in `worker-ts-middag-docs-mcp`.
- Client-facing product docs are `docs-middag-io`; ops doctrine is `docs-middag-ops`.

## Git

- Conventional Commits; **never** `Co-Authored-By`.
- Base branch: `main` trunk-based — push to `main` deploys via GitHub Actions + wrangler-action.

## Language

Docs and commits in EN (public repo).

## Quality gates

Green before delivering: `npm run docs:build` (runs `docs:prebuild` fetch+inject first).

## Inherited rules (pointers, do not copy)

- ADR-016 (build-time aggregation via edge storage) + the aggregator doctrine in `worker-ts-middag-docs-proxy`.
- Org doctrine via docs-MCP (alias `ops`) or `docs-middag-ops`; planning/backlog in `tool-middag-planning`.

## NOT in scope / do not do without permission

- Authoring or editing library documentation content here — it belongs in the source repo's `docs/`.
- Editing anything under `docs/injected/` — generated at prebuild and gitignored.
- Deploy/Cloudflare Pages config changes.

## Gotchas — READ before touching

1. Nav/sidebar is generated dynamically from the injected tree — don't hardcode entries.
2. Multi-version channels come from the `hub.config.json` allowlist — adding a repo/version happens there, not in VitePress config.
3. `npm run docs:dev:nofetch` skips the proxy fetch — use it when offline or iterating on theme only.
