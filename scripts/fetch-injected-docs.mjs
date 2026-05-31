#!/usr/bin/env node
/**
 * fetch-injected-docs.mjs — hub pre-build step (ADR-016 Build-Time Aggregation).
 *
 * Reads hub.config.json, then for each documentation dependency pulls its
 * `docs` artifact from the MIDDAG docs proxy (the Cloudflare R2 edge gateway)
 * and writes the files under docs/injected/{repo}/{version}/ so VitePress can
 * compile them into the static site. The injected/ tree is gitignored — it is
 * reproduced on every build and never committed.
 *
 * Auth: the private proxy deployment requires a bearer token. Export it as
 * DOCS_PROXY_TOKEN (a Cloudflare Access service token). The public deployment
 * ignores it. Override the proxy host with DOCS_PROXY_BASE_URL when testing.
 *
 * Discovery: the doc set is enumerated dynamically via the proxy's
 * `?list=true` endpoint, exposed by @middag-io/docs-proxy-client@0.2.0 as
 * client.listArtifacts(repo, version, kind). No filenames are hardcoded — the
 * proxy returns every key under {repo}/{kind}/{version}/, including
 * subdirectories (e.g. "guides/forms.md", "reference/api.md").
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

/** Parse hub.config.json into [[repo, version], ...]. */
async function readHubConfig() {
  const cfg = JSON.parse(await readFile(HUB_CONFIG, 'utf8'))
  return Object.entries(cfg.dependencies ?? {})
}

/** A single object key in the proxy taxonomy: /{repo}/{kind}/{version}/{path}. */
function artifactUrl(repo, version, path = '') {
  const clean = path.replace(/^\/+/, '')
  return `${BASE_URL}/${repo}/${KIND}/${version}${clean ? `/${clean}` : ''}`
}

async function proxyGet(url) {
  const res = await fetch(url, {
    headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {},
  })
  if (!res.ok) throw new Error(`docs-proxy GET ${url} -> HTTP ${res.status}`)
  return res
}

/** Confirm the package/version is published, using the real client method. */
async function verifyVersion(repo, version) {
  const manifest = await client.fetchManifest(repo)
  // The live /{repo}/manifest.json payload is { package, latest, versions:{...} }
  // (see middag-react prepare-docs-payload.mjs). The client's TS Manifest type
  // ({ sources }) does not match it yet — tolerate both shapes.
  const versions = manifest?.versions
  if (versions && !versions[version]) {
    const known = Object.keys(versions).join(', ') || '(none)'
    throw new Error(`${repo}@${version} not found in proxy manifest. Published: ${known}`)
  }
}

/**
 * Download every file of the docs artifact into docs/injected/{repo}/{version}/.
 * The file set is discovered at runtime via listArtifacts (proxy ?list=true);
 * returned keys may include subdirectories, so each file's parent dir is created
 * before writing.
 */
async function downloadDocs(repo, version) {
  const outDir = join(INJECTED_DIR, repo, version)
  await mkdir(outDir, { recursive: true })

  const filesToFetch = await client.listArtifacts(repo, version, KIND)
  if (!Array.isArray(filesToFetch) || filesToFetch.length === 0) {
    throw new Error(`${repo}@${version}: listArtifacts returned no files`)
  }

  let count = 0
  for (const file of filesToFetch) {
    console.log(`[Proxy] Downloading ${repo}/${KIND}/${version}/${file}...`)
    const res = await proxyGet(artifactUrl(repo, version, file))
    const dest = join(outDir, file)
    await mkdir(dirname(dest), { recursive: true })
    await writeFile(dest, Buffer.from(await res.arrayBuffer()))
    count++
  }
  return { outDir, count }
}

async function main() {
  const deps = await readHubConfig()
  if (deps.length === 0) {
    console.log('[inject] hub.config.json has no dependencies — nothing to fetch.')
    return
  }

  // Always rebuild injected/ from scratch — it is reproducible and never committed.
  await rm(INJECTED_DIR, { recursive: true, force: true })
  await mkdir(INJECTED_DIR, { recursive: true })

  console.log(`[inject] proxy ${BASE_URL}${TOKEN ? ' (authenticated)' : ' (anonymous)'}`)
  for (const [repo, version] of deps) {
    console.log(`[inject] ${repo}@${version} — verifying manifest…`)
    await verifyVersion(repo, version)
    console.log(`[inject] ${repo}@${version} — downloading ${KIND}…`)
    const { outDir, count } = await downloadDocs(repo, version)
    console.log(`[inject] ${repo}@${version} — wrote ${count} file(s) -> ${outDir}`)
  }
  console.log('[inject] done.')
}

main().catch((err) => {
  console.error(`[inject] FAILED: ${err.message}`)
  process.exitCode = 1
})
