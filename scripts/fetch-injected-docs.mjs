#!/usr/bin/env node
/**
 * fetch-injected-docs.mjs — hub pre-build step (ADR-016 Build-Time Aggregation).
 *
 * Reads hub.config.json (an ALLOWLIST: nothing is published unless declared)
 * and hands it to `fetchHub` from `@middag-io/docs-proxy-client/hub`, which
 * resolves every declared CHANNEL of every repo against the MIDDAG docs proxy
 * and downloads the artifact KINDS the repo declares:
 *
 *   - `docs` (default) -> docs/injected/{repo}/{segment}/, root-absolute links
 *     in Markdown rewritten to /{repo}/{segment}/…;
 *   - `xref` (API reference HTML) -> .xref/{repo}/{segment}/, byte for byte;
 *     scripts/build-site.mjs copies it to dist/api/{repo}/{segment}/ after the
 *     site build. Never rewritten, never compiled as a page.
 *
 * Both trees are gitignored and rebuilt from scratch on every run. Channel
 * selectors: "latest", a line "0.30.x" (segment "0.30") or an exact pin. Only
 * `docs` and `xref` are accepted in `kinds`; anything else fails the build.
 *
 * Internal decision records are refused before anything is written: every
 * key and destination goes through the client's publish guard (decisions/,
 * internal/, adr/, madr/; docs-middag-ops#66).
 *
 * This is the PUBLIC hub. `assertPublicTarget` fails closed before any request
 * when DOCS_PROXY_TOKEN is set or the base URL is not the public proxy
 * (https://docs-proxy.middag.dev). A loopback origin is also accepted, for the
 * local fake proxy the tests run; a token never is. DOCS_PROXY_BASE_URL,
 * DOCS_HUB_CONFIG, DOCS_INJECTED_DIR and DOCS_XREF_DIR override the defaults.
 */
import {
  DocsProxyClient,
  PUBLIC_PROXY_ORIGIN,
  assertPublicTarget,
} from '@middag-io/docs-proxy-client'
import { fetchHub } from '@middag-io/docs-proxy-client/hub'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { withRetry } from './lib/retry-fetch.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Artifact kinds this public hub publishes. */
export const HUB_KINDS = Object.freeze(['docs', 'xref'])

/** Staging root of the xref payloads, relative to the repo root (gitignored). */
export const XREF_DIR = '.xref'

const LOOPBACK_HOSTS = Object.freeze(['127.0.0.1', 'localhost', '[::1]'])

/** Origins the public target guard accepts for `baseUrl`: the public proxy, plus loopback. */
export function allowedOrigins(baseUrl) {
  try {
    const url = new URL(baseUrl)
    if (url.protocol === 'http:' && LOOPBACK_HOSTS.includes(url.hostname)) {
      return [PUBLIC_PROXY_ORIGIN, url.origin]
    }
  } catch {
    // An invalid URL is reported by assertPublicTarget itself.
  }
  return [PUBLIC_PROXY_ORIGIN]
}

/** Refuse a repo entry whose `kinds` names anything but docs or xref. */
export function assertHubKinds(config) {
  for (const [repo, entry] of Object.entries(config.repos ?? {})) {
    for (const kind of entry?.kinds ?? ['docs']) {
      if (!HUB_KINDS.includes(kind)) {
        throw new Error(
          `hub.config.json repos["${repo}"]: kind "${kind}" is not published by this hub ` +
            `(allowed: ${HUB_KINDS.join(', ')})`,
        )
      }
    }
  }
}

async function main() {
  const baseUrl = process.env.DOCS_PROXY_BASE_URL ?? PUBLIC_PROXY_ORIGIN
  const token = process.env.DOCS_PROXY_TOKEN
  // Fail closed before reading anything else: a public build never carries a token.
  assertPublicTarget({ baseUrl, token, allowedOrigins: allowedOrigins(baseUrl) })

  const configPath = resolve(process.env.DOCS_HUB_CONFIG ?? resolve(ROOT, 'hub.config.json'))
  const config = JSON.parse(await readFile(configPath, 'utf8'))
  assertHubKinds(config)
  if (Object.keys(config.repos ?? {}).length === 0) {
    console.log('[inject] hub.config.json has no repos — nothing to fetch.')
    return
  }

  const outDir = resolve(process.env.DOCS_INJECTED_DIR ?? resolve(ROOT, 'docs', 'injected'))
  const xrefDir = resolve(process.env.DOCS_XREF_DIR ?? resolve(ROOT, XREF_DIR))
  console.log(`[inject] proxy ${baseUrl} (anonymous)`)
  // The client calls the global fetch; transient network errors and 502/503/504
  // are retried instead of failing the deploy (scripts/lib/retry-fetch.mjs).
  globalThis.fetch = withRetry(globalThis.fetch, {
    log: (message) => console.warn(`[inject] ${message}`),
  })
  const result = await fetchHub({
    client: new DocsProxyClient(baseUrl),
    config,
    outDir,
    kindDirs: { xref: xrefDir },
    log: (message) => console.log(`[inject] ${message}`),
  })
  const files = Object.values(result.repos).reduce((sum, repo) => sum + repo.files, 0)
  console.log(`[inject] done: ${Object.keys(result.repos).length} repo(s), ${files} file(s).`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`[inject] FAILED: ${err.message}`)
    process.exitCode = 1
  })
}
