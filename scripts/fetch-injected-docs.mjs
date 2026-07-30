#!/usr/bin/env node
/**
 * fetch-injected-docs.mjs — hub pre-build step (ADR-016 Build-Time Aggregation).
 *
 * Reads hub.config.json (an ALLOWLIST: nothing is published unless declared),
 * then for each repo pulls the `docs` artifact of every declared CHANNEL from
 * the MIDDAG docs proxy (the Cloudflare R2 edge gateway) and writes the files
 * under docs/injected/{repo}/{segment}/ so VitePress compiles them into the
 * static multi-version site. The injected/ tree is gitignored — reproduced on
 * every build, never committed.
 *
 * A CHANNEL is a version selector:
 *   "latest" -> resolves to manifest.latest (the newest published in R2)
 *   "0.30.x" -> resolves to the highest retained 0.30.* version
 *   "0.20.0" -> an exact pin
 * Its URL SEGMENT is: "latest" stays "latest"; "0.30.x" -> "0.30"; an exact
 * version stays as-is. Docs are served at /{repo}/{segment}/** (see the
 * VitePress `rewrites`), giving versioned URLs like /middag-react/0.30/forms.
 *
 * Publishing is intentional by design: a version appears ONLY when added to a
 * channel here — that deliberate edit is the operational publish step.
 *
 * Auth: the private proxy needs a bearer token in DOCS_PROXY_TOKEN (a Cloudflare
 * Access service token). The public deployment ignores it. Override the host
 * with DOCS_PROXY_BASE_URL when testing.
 */
import { DocsProxyClient } from '@middag-io/docs-proxy-client'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const HUB_CONFIG = resolve(ROOT, 'hub.config.json')
const INJECTED_DIR = resolve(ROOT, 'docs', 'injected')

const BASE_URL = process.env.DOCS_PROXY_BASE_URL ?? 'https://docs-proxy.middag.dev'
const TOKEN = process.env.DOCS_PROXY_TOKEN // undefined => anonymous (public proxy)
const KIND = 'docs'

const client = new DocsProxyClient(BASE_URL, TOKEN)

/** Parse hub.config.json into [[repo, {label, channels}], ...]. */
async function readHubConfig() {
  const cfg = JSON.parse(await readFile(HUB_CONFIG, 'utf8'))
  return Object.entries(cfg.repos ?? {})
}

async function proxyGet(url) {
  const res = await fetch(url, {
    headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {},
  })
  if (!res.ok) throw new Error(`docs-proxy GET ${url} -> HTTP ${res.status}`)
  return res
}

/** Every object key under a repo (proxy taxonomy: /{repo}/{kind}/{version}/…). */
async function listRepoKeys(repo) {
  const res = await proxyGet(`${BASE_URL}/${repo}?list=true`)
  const keys = await res.json()
  if (!Array.isArray(keys)) throw new Error(`${repo}: ?list=true not an array`)
  return keys
}

/** Retained doc versions for a repo, oldest→newest (numeric-aware). */
function docVersions(keys) {
  const set = new Set()
  for (const k of keys) {
    const m = k.match(/^docs\/([^/]+)\//)
    if (m) set.add(m[1])
  }
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
}

/** URL segment for a channel selector: latest→latest, 0.30.x→0.30, exact→exact. */
function channelSegment(selector) {
  if (selector === 'latest') return 'latest'
  return selector.endsWith('.x') ? selector.slice(0, -2) : selector
}

/** Resolve a channel selector to a concrete retained version, or null. */
function resolveChannel(selector, versions, latest) {
  if (selector === 'latest') return latest ?? versions[versions.length - 1] ?? null
  if (selector.endsWith('.x')) {
    const line = selector.slice(0, -2) // "0.30"
    const hits = versions.filter((v) => v === line || v.startsWith(`${line}.`))
    return hits[hits.length - 1] ?? null
  }
  return versions.includes(selector) ? selector : null // exact pin
}

/**
 * Rewrite root-absolute links inside an injected Markdown file so they carry the
 * package + channel context. Source docs author links as if at the site root
 * (e.g. "/getting-started"); the hub serves them under /{repo}/{segment}/ (see
 * the VitePress `rewrites`) — without this, every in-package link 404s. Covers
 * Markdown links, inline HTML href, and YAML frontmatter `link:` fields.
 * External (http(s):, //), anchor (#) and relative (./) links are untouched.
 */
function rewriteLinks(markdown, repo, segment) {
  const prefix = `/${repo}/${segment}/`
  return markdown
    .replace(/\]\(\/(?!\/)([^)]*)\)/g, `](${prefix}$1)`)
    .replace(/href="\/(?!\/)([^"]*)"/g, `href="${prefix}$1"`)
    .replace(/^---\n[\s\S]*?\n---/, (block) =>
      block.replace(/(\blink:\s*['"]?)\/(?!\/)/g, `$1${prefix}`),
    )
}

/** Download one channel's docs into docs/injected/{repo}/{segment}/. */
async function downloadChannel(repo, version, segment, keys) {
  const outDir = join(INJECTED_DIR, repo, segment)
  await mkdir(outDir, { recursive: true })

  const prefix = `${KIND}/${version}/`
  const files = keys.filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length))
  if (files.length === 0) {
    throw new Error(`${repo}@${version}: no ${KIND} files under ${prefix}`)
  }

  let count = 0
  for (const file of files) {
    const res = await proxyGet(`${BASE_URL}/${repo}/${KIND}/${version}/${file}`)
    const dest = join(outDir, file)
    await mkdir(dirname(dest), { recursive: true })
    if (file.endsWith('.md')) {
      await writeFile(dest, rewriteLinks(await res.text(), repo, segment), 'utf8')
    } else {
      await writeFile(dest, Buffer.from(await res.arrayBuffer()))
    }
    count++
  }
  return count
}

async function main() {
  const repos = await readHubConfig()
  if (repos.length === 0) {
    console.log('[inject] hub.config.json has no repos — nothing to fetch.')
    return
  }

  // Always rebuild injected/ from scratch — reproducible, never committed.
  await rm(INJECTED_DIR, { recursive: true, force: true })
  await mkdir(INJECTED_DIR, { recursive: true })

  console.log(`[inject] proxy ${BASE_URL}${TOKEN ? ' (authenticated)' : ' (anonymous)'}`)

  for (const [repo, meta] of repos) {
    const label = meta?.label ?? repo
    const selectors = meta?.channels ?? []
    if (selectors.length === 0) {
      console.warn(`[inject] ${repo}: no channels declared — skipping.`)
      continue
    }

    const keys = await listRepoKeys(repo)
    const versions = docVersions(keys)
    let latest = null
    try {
      latest = (await client.fetchManifest(repo))?.latest ?? null
    } catch {
      // Manifest optional; fall back to newest retained for "latest".
    }

    const resolved = []
    for (const selector of selectors) {
      const version = resolveChannel(selector, versions, latest)
      const segment = channelSegment(selector)
      if (!version) {
        console.warn(`[inject] ${repo}: channel "${selector}" resolves to nothing — skipping.`)
        continue
      }
      console.log(`[inject] ${repo} ${selector} -> ${version} (/${repo}/${segment}/)`)
      const count = await downloadChannel(repo, version, segment, keys)
      resolved.push({ selector, segment, version })
      console.log(`[inject]   wrote ${count} file(s)`)
    }

    if (resolved.length === 0) {
      console.warn(`[inject] ${repo}: no channels resolved — nothing written.`)
      continue
    }

    // Channel manifest consumed by docs/.vitepress/config.ts to build the nav,
    // sidebars and version switcher. defaultSegment = first declared channel.
    await writeFile(
      join(INJECTED_DIR, repo, '_channels.json'),
      JSON.stringify({ label, defaultSegment: resolved[0].segment, channels: resolved }, null, 2),
      'utf8',
    )
  }

  console.log('[inject] done.')
}

main().catch((err) => {
  console.error(`[inject] FAILED: ${err.message}`)
  process.exitCode = 1
})
