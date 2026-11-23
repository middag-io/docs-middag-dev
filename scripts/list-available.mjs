#!/usr/bin/env node
/**
 * list-available.mjs — discovery tool (read-only, via the public docs proxy).
 *
 * Answers "what can I publish, and what is already published?" without any R2
 * credentials. Repos come from the root listing; versions come, per kind, from
 * a listing scoped to `{kind}/` (never a whole-repo listing: xref payloads
 * would push it past the proxy's key cap), plus `manifest.json` for `latest`.
 * Everything else (channel resolution, version parsing) is the shared client
 * logic `fetchHub` uses at build time, so this report and the build agree.
 *
 * It diffs the result against hub.config.json and prints, per repo, the newest
 * version, the retained versions of each kind, and the channels and kinds the
 * hub publishes. It never edits hub.config.json. Like the prebuild, it reads
 * the public proxy anonymously and refuses DOCS_PROXY_TOKEN.
 */
import {
  DocsProxyClient,
  DocsProxyError,
  PUBLIC_PROXY_ORIGIN,
  assertPublicTarget,
  reposFromKeys,
  resolveChannel,
  versionsFromKeys,
} from '@middag-io/docs-proxy-client'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { HUB_KINDS, allowedOrigins } from './fetch-injected-docs.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const HUB_CONFIG = resolve(ROOT, 'hub.config.json')

async function readAllowlist() {
  try {
    return JSON.parse(await readFile(HUB_CONFIG, 'utf8')).repos ?? {}
  } catch {
    return {}
  }
}

async function manifestLatest(client, repo) {
  try {
    return (await client.fetchManifest(repo))?.latest ?? null
  } catch (error) {
    if (error instanceof DocsProxyError && error.status === 404) return null
    throw error
  }
}

/** Retained versions of each hub kind, from listings scoped to `{kind}/`. */
async function versionsByKind(client, repo) {
  const out = {}
  for (const kind of HUB_KINDS) {
    const keys = await client.listRepo(repo, { prefix: `${kind}/` })
    out[kind] = versionsFromKeys(keys, kind)
  }
  return out
}

function printPublished(meta, versions, latest) {
  const kinds = meta?.kinds ?? ['docs']
  const channels = meta?.channels ?? []
  const primary = versions[kinds[0]] ?? []
  const resolved = channels.map(
    (sel) => `${sel}→${resolveChannel(sel, primary, latest) ?? 'UNRESOLVED'}`,
  )
  console.log(`  label: ${meta?.label ?? '(repo name)'}`)
  console.log(`  kinds: ${kinds.join(', ')}`)
  console.log(`  channels: ${resolved.join(', ') || '(none)'}`)
  if (latest && !channels.includes('latest')) {
    console.log(`  note: newest (${latest}) is NOT on a "latest" channel here.`)
  }
}

async function main() {
  const baseUrl = process.env.DOCS_PROXY_BASE_URL ?? PUBLIC_PROXY_ORIGIN
  assertPublicTarget({
    baseUrl,
    token: process.env.DOCS_PROXY_TOKEN,
    allowedOrigins: allowedOrigins(baseUrl),
  })
  const client = new DocsProxyClient(baseUrl)
  const allow = await readAllowlist()
  const repos = reposFromKeys(await client.listRepo(''))

  console.log(`docs proxy: ${baseUrl} (anonymous)`)
  console.log(
    `repos in bucket: ${repos.length} | published in hub.config.json: ${Object.keys(allow).length}\n`,
  )

  for (const repo of repos) {
    const versions = await versionsByKind(client, repo)
    const latest = await manifestLatest(client, repo)
    const published = repo in allow
    console.log(`${repo}  —  ${published ? '● PUBLISHED' : '○ available (not in hub.config.json)'}`)
    console.log(`  latest: ${latest ?? '(no manifest)'}`)
    for (const kind of HUB_KINDS) {
      const list = versions[kind]
      if (list.length > 0) console.log(`  ${kind} (${list.length}): ${list.join(', ')}`)
    }
    if (published) {
      printPublished(allow[repo], versions, latest)
    } else {
      const kinds = HUB_KINDS.filter((k) => versions[k].length > 0)
      console.log(
        `  to publish: add "${repo}": { "label": "…", "channels": ["latest"], "kinds": ${JSON.stringify(kinds)} } to hub.config.json`,
      )
    }
    console.log('')
  }
}

main().catch((err) => {
  console.error(`[available] FAILED: ${err.message}`)
  process.exitCode = 1
})
