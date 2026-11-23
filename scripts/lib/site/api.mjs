/**
 * api.mjs — the generated API reference (`xref` kind) on the site.
 *
 * The prebuild stages each declared xref channel, byte for byte, under
 * .xref/{repo}/{segment}/. After the preset build, it is copied to
 * dist/api/{repo}/{segment}/ as the generator produced it: never rewritten,
 * never compiled as a page, never link-checked page by page. The site links
 * to its folder (/api/{repo}/{segment}/, no 308 redirect) from an "API reference" page in each docs channel and
 * from the repo landing, and checkApiDist() makes sure each copied tree has
 * an HTML index.
 */
import { cp, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** dist/ folder the xref trees are copied into; excluded from the page-level checks. */
export const API_DIR = 'api'

/** File name of the generated "API reference" page in a docs channel. */
export const API_PAGE = 'api-reference.md'

/** Kinds of a channel from `_channels.json`; a channel without `kinds` is docs only. */
export const channelKinds = (channel) => channel?.kinds ?? ['docs']

export const hasKind = (channel, kind) => channelKinds(channel).includes(kind)

/** Site URL of a channel's API reference. */
export const apiHref = (repo, segment) => `/${API_DIR}/${repo}/${segment}/`

/** Is a dist-relative path inside the API reference trees? */
export const isApiPath = (file) => file.startsWith(`${API_DIR}/`)

/** Every { repo, segment } with an xref channel, from the assembled repos. */
export function apiChannels(repos) {
  return repos.flatMap((repo) =>
    (repo.allChannels ?? repo.channels)
      .filter((channel) => hasKind(channel, 'xref'))
      .map((channel) => ({ repo: repo.repo, segment: channel.segment, channel })),
  )
}

/** The "API reference" page of one docs channel: a link out to the copied tree. */
export function apiPage(label, repo, channel) {
  const href = apiHref(repo, channel.segment)
  return (
    `---\ntitle: API reference\n---\n\n# API reference\n\n` +
    `Generated API reference of ${label} ${channel.version}, as published by the library.\n\n` +
    `<a href="${href}">Open the API reference</a>\n`
  )
}

/** Copy every staged xref channel to dist/api/{repo}/{segment}/. Returns the count. */
export async function copyApiReference({ xrefDir, distDir, repos }) {
  const targets = apiChannels(repos)
  for (const { repo, segment } of targets) {
    const from = join(xrefDir, repo, segment)
    if (!existsSync(from))
      throw new Error(`API reference ${repo}/${segment} was not staged in ${from}`)
    await cp(from, join(distDir, API_DIR, repo, segment), { recursive: true })
  }
  return targets.length
}

/** Light check of the copied trees: each has an index.html that is HTML. */
export async function checkApiDist(distDir, repos) {
  const violations = []
  for (const { repo, segment } of apiChannels(repos)) {
    const index = join(distDir, API_DIR, repo, segment, 'index.html')
    if (!existsSync(index)) {
      violations.push(`dist/${API_DIR}/${repo}/${segment}/index.html is missing`)
      continue
    }
    const head = (await readFile(index, 'utf8')).slice(0, 2048).toLowerCase()
    if (!head.includes('<html')) {
      violations.push(`dist/${API_DIR}/${repo}/${segment}/index.html is not an HTML page`)
    }
  }
  return violations
}
