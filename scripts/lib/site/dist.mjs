/**
 * dist.mjs — finishing and checking the built site (dist/).
 *
 * Everything here reads or writes plain files, so the checks run the same
 * locally and in CI, without a server and without the network.
 */
import { readdir, readFile } from 'node:fs/promises'
import { existsSync, statSync } from 'node:fs'
import { join, posix } from 'node:path'

/**
 * Redirect rules the published dist/_redirects must contain (Cloudflare Pages
 * syntax: "<from> <to> <status>"). The file itself is site-public/_redirects,
 * copied to the site root by the preset's `publicDir`. VitePress served the
 * sitemap at /sitemap.xml; the Nimbus build emits /sitemap-index.xml.
 */
export const REDIRECTS = Object.freeze([
  { from: '/sitemap.xml', to: '/sitemap-index.xml', status: 301 },
])

/** Files that must never be published (navigation data, channel manifests). */
export const FORBIDDEN_DIST_FILES = Object.freeze(['nav.json', '_channels.json'])

/** Parse a _redirects file into { from, to, status } rules; comments and blanks skipped. */
export function parseRedirects(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => {
      const [from, to, status = '302'] = line.split(/\s+/)
      return { from, to, status: Number(status) }
    })
}

/** The required rules (REDIRECTS by default) that `rules` lacks. */
export function missingRedirects(rules, required = REDIRECTS) {
  return required.filter(
    (want) =>
      !rules.some((r) => r.from === want.from && r.to === want.to && r.status === want.status),
  )
}

/** Every file under `dir`, relative to it, with POSIX separators. */
export async function listFiles(dir, base = dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await listFiles(abs, base)))
    else out.push(posix.join(...abs.slice(base.length + 1).split(/[\\/]/)))
  }
  return out.sort()
}

/**
 * The dist file a URL path is served from, or null. Mirrors Cloudflare Pages:
 * "/x/" and "/x" are both served by x/index.html (the latter after a 308),
 * and an exact file is served as is.
 */
export function resolveDistPath(distDir, urlPath) {
  let path
  try {
    path = decodeURIComponent(urlPath)
  } catch {
    return null
  }
  const clean = path.replace(/^\/+/, '')
  if (clean.split('/').includes('..')) return null
  const candidates = []
  if (clean === '' || clean.endsWith('/')) candidates.push(`${clean}index.html`)
  else candidates.push(clean, `${clean}/index.html`)
  for (const candidate of candidates) {
    const abs = join(distDir, candidate)
    if (existsSync(abs) && statSync(abs).isFile()) return candidate
  }
  return null
}

/**
 * Structural checks on the built site. Returns a list of violations (empty
 * when the site is fine).
 */
export async function checkDist(distDir, { homeHeading }) {
  const violations = []
  const files = await listFiles(distDir)

  const homePath = join(distDir, 'index.html')
  if (!existsSync(homePath)) {
    violations.push('dist/index.html is missing')
  } else {
    const home = await readFile(homePath, 'utf8')
    if (!homeHeading) {
      violations.push('the home page source has no H1 to check dist/index.html against')
    } else if (!home.includes(homeHeading)) {
      violations.push(`dist/index.html does not come from docs/index.md (no "${homeHeading}")`)
    }
    for (const placeholder of ['href="/welcome', 'href="/getting-started', 'href="/components']) {
      if (home.includes(placeholder))
        violations.push(`dist/index.html links to ${placeholder.slice(6)}`)
    }
  }
  if (existsSync(join(distDir, 'index'))) {
    violations.push('dist/index/ exists: the home page was built as /index/ instead of /')
  }
  if (!files.some((f) => f.startsWith('pagefind/'))) {
    violations.push('dist/pagefind/ is missing: the site has no search index')
  }
  if (!files.includes('_redirects')) {
    violations.push('dist/_redirects is missing: check publicDir in middag-docs.config.ts')
  } else {
    const rules = parseRedirects(await readFile(join(distDir, '_redirects'), 'utf8'))
    for (const rule of missingRedirects(rules)) {
      violations.push(`dist/_redirects lacks "${rule.from} ${rule.to} ${rule.status}"`)
    }
  }
  for (const file of files) {
    if (FORBIDDEN_DIST_FILES.includes(posix.basename(file))) {
      violations.push(`dist/${file} must not be published`)
    }
  }
  return violations
}

/** Does a redirect rule (exact or trailing-slash variant) cover `urlPath`? */
export function redirectCovers(rules, urlPath) {
  const variants = new Set([
    urlPath,
    urlPath.replace(/\/+$/, '') || '/',
    `${urlPath.replace(/\/+$/, '')}/`,
  ])
  return rules.some((r) => variants.has(r.from))
}

/**
 * Map every URL of a sitemap snapshot to the built site: each must be served
 * by a dist file or covered by a _redirects rule whose target is served.
 */
export function mapSitemapUrls(distDir, urls, rules) {
  const unmapped = []
  let pages = 0
  let redirected = 0
  for (const url of urls) {
    const path = new URL(url, 'https://placeholder.invalid').pathname
    if (resolveDistPath(distDir, path)) {
      pages += 1
      continue
    }
    const rule = rules.find((r) => redirectCovers([r], path))
    if (rule && resolveDistPath(distDir, rule.to)) {
      redirected += 1
      continue
    }
    unmapped.push(url)
  }
  return { total: urls.length, pages, redirected, unmapped }
}
