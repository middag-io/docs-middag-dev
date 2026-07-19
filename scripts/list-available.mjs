#!/usr/bin/env node
/**
 * list-available.mjs — discovery tool (read-only, via the docs proxy).
 *
 * Answers "what can I publish, and what is already published?" WITHOUT any R2 /
 * S3 credentials — everything comes from the proxy's public discovery endpoints:
 *   GET /?list=true          -> every key; repo = first path segment
 *   GET /{repo}?list=true    -> every key; versions from docs/{version}/
 *   GET /{repo}/manifest.json -> { latest }
 *
 * It then diffs that against hub.config.json (the publish allowlist) and prints,
 * per repo: the newest version, retained versions, and which channels this hub
 * currently publishes (resolved to concrete versions). Repos present in R2 but
 * absent from hub.config.json are flagged as available-but-unpublished.
 *
 * Publishing stays a deliberate act: this tool only REPORTS — it never edits
 * hub.config.json. Override the proxy host with DOCS_PROXY_BASE_URL; set
 * DOCS_PROXY_TOKEN to read the private deployment.
 */
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const HUB_CONFIG = resolve(ROOT, 'hub.config.json')
const BASE_URL = process.env.DOCS_PROXY_BASE_URL ?? 'https://docs-proxy.middag.dev'
const TOKEN = process.env.DOCS_PROXY_TOKEN
const KIND = 'docs'

async function proxyGet(url) {
  const res = await fetch(url, {
    headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {},
  })
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`)
  return res
}

async function listKeys(path = '') {
  const res = await proxyGet(`${BASE_URL}/${path}?list=true`)
  const keys = await res.json()
  if (!Array.isArray(keys)) throw new Error(`${path || '/'}: ?list=true not an array`)
  return keys
}

/** Repos present in the bucket = unique first path segment across all keys. */
function reposFromKeys(keys) {
  const set = new Set()
  for (const k of keys) {
    const seg = k.split('/')[0]
    if (seg) set.add(seg)
  }
  return [...set].sort()
}

/** Retained doc versions for a repo, oldest→newest. */
function versionsFromKeys(keys) {
  const set = new Set()
  for (const k of keys) {
    const m = k.match(new RegExp(`^${KIND}/([^/]+)/`))
    if (m) set.add(m[1])
  }
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
}

async function manifestLatest(repo) {
  try {
    const res = await proxyGet(`${BASE_URL}/${repo}/manifest.json`)
    return (await res.json())?.latest ?? null
  } catch {
    return null
  }
}

/** Resolve a channel selector against retained versions (mirror of prebuild). */
function resolveChannel(selector, versions, latest) {
  if (selector === 'latest') return latest ?? versions[versions.length - 1] ?? null
  if (selector.endsWith('.x')) {
    const line = selector.slice(0, -2)
    const hits = versions.filter((v) => v === line || v.startsWith(`${line}.`))
    return hits[hits.length - 1] ?? null
  }
  return versions.includes(selector) ? selector : null
}

async function readAllowlist() {
  try {
    const cfg = JSON.parse(await readFile(HUB_CONFIG, 'utf8'))
    return cfg.repos ?? {}
  } catch {
    return {}
  }
}

async function main() {
  const allow = await readAllowlist()
  const rootKeys = await listKeys()
  const repos = reposFromKeys(rootKeys)

  console.log(`docs proxy: ${BASE_URL}${TOKEN ? ' (authenticated)' : ' (anonymous)'}`)
  console.log(`repos in bucket: ${repos.length} | published in hub.config.json: ${Object.keys(allow).length}\n`)

  for (const repo of repos) {
    const keys = await listKeys(repo)
    const versions = versionsFromKeys(keys)
    const latest = await manifestLatest(repo)
    const published = repo in allow

    const head = published ? '● PUBLISHED' : '○ available (not in hub.config.json)'
    console.log(`${repo}  —  ${head}`)
    console.log(`  latest: ${latest ?? '(no manifest)'}`)
    console.log(`  retained (${versions.length}): ${versions.join(', ')}`)

    if (published) {
      const meta = allow[repo]
      const label = meta?.label ?? repo
      const channels = meta?.channels ?? []
      const resolved = channels.map((sel) => {
        const v = resolveChannel(sel, versions, latest)
        return `${sel}→${v ?? 'UNRESOLVED'}`
      })
      console.log(`  label: ${label}`)
      console.log(`  channels: ${resolved.join(', ') || '(none)'}`)
      if (latest && !channels.includes('latest')) {
        console.log(`  note: newest (${latest}) is NOT on a "latest" channel here.`)
      }
    } else {
      console.log(`  to publish: add "${repo}": { "label": "…", "channels": ["latest"] } to hub.config.json`)
    }
    console.log('')
  }
}

main().catch((err) => {
  console.error(`[available] FAILED: ${err.message}`)
  process.exitCode = 1
})
