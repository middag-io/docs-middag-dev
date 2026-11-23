/**
 * links.mjs — offline link check over the built HTML, anchors included.
 *
 * Every internal link in every page (`<a href>`, root-relative, page-relative
 * or on the site's own origin) must resolve to a file in dist/ or to a
 * _redirects rule, and a `#fragment` must match an `id` (or a legacy `name`)
 * on the target page. External links are not fetched.
 */
import { readFile } from 'node:fs/promises'
import { join, posix } from 'node:path'
import { listFiles, redirectCovers, resolveDistPath } from './dist.mjs'

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'" }

export function decodeEntities(text) {
  return text.replace(/&(amp|lt|gt|quot|#39|apos);/g, (_, name) => ENTITIES[name])
}

/** The href values of every <a> element in an HTML document. */
export function extractHrefs(html) {
  const hrefs = []
  for (const match of html.matchAll(/<a\b[^>]*?\shref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    hrefs.push(decodeEntities(match[1] ?? match[2]))
  }
  return hrefs
}

/** The og:image URLs of an HTML document. */
export function extractOgImages(html) {
  const urls = []
  for (const match of html.matchAll(
    /<meta\b[^>]*\sproperty="og:image"[^>]*\scontent="([^"]*)"/gi,
  )) {
    urls.push(decodeEntities(match[1]))
  }
  return urls
}

/** Every id (and name on <a>) declared in an HTML document. */
export function extractIds(html) {
  const ids = new Set()
  for (const match of html.matchAll(/\sid\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    ids.add(decodeEntities(match[1] ?? match[2]))
  }
  for (const match of html.matchAll(/<a\b[^>]*\sname\s*=\s*"([^"]*)"/gi))
    ids.add(decodeEntities(match[1]))
  return ids
}

/**
 * Classify an href found on the page served from `pageUrl` ("/x/y/"). Returns
 * null for links that are not checked (external, mailto:, javascript:, data:),
 * else { path, fragment } with an absolute URL path.
 */
export function internalTarget(href, pageUrl, origin) {
  const trimmed = href.trim()
  if (trimmed === '') return null
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith('//')) {
    if (
      !origin ||
      !(trimmed === origin || trimmed.startsWith(`${origin}/`) || trimmed.startsWith(`${origin}#`))
    ) {
      return null
    }
  }
  const url = new URL(trimmed, `${origin ?? 'https://placeholder.invalid'}${pageUrl}`)
  let fragment = null
  if (url.hash) {
    try {
      fragment = decodeURIComponent(url.hash.slice(1))
    } catch {
      fragment = url.hash.slice(1)
    }
  }
  return { path: url.pathname, fragment }
}

/** The URL a dist HTML file is served at: "a/b/index.html" -> "/a/b/". */
export function pageUrlFor(file) {
  if (file === 'index.html') return '/'
  if (file.endsWith('/index.html')) return `/${file.slice(0, -'index.html'.length)}`
  return `/${file}`
}

/**
 * Check every HTML page in dist. `ignore` lists exact { page, href } pairs
 * that are known and accepted. Returns { pages, links, anchors, broken:
 * [{ page, href, reason }] }.
 */
export async function checkLinks(distDir, { origin, rules = [], ignore = [] } = {}) {
  const isIgnored = (page, href) => ignore.some((i) => i.page === page && i.href === href)
  const files = (await listFiles(distDir)).filter((f) => f.endsWith('.html'))
  const idCache = new Map()
  const idsOf = async (file) => {
    if (!idCache.has(file))
      idCache.set(file, extractIds(await readFile(join(distDir, file), 'utf8')))
    return idCache.get(file)
  }

  const broken = []
  let links = 0
  let anchors = 0
  for (const file of files) {
    const html = await readFile(join(distDir, file), 'utf8')
    const pageUrl = pageUrlFor(file)
    for (const image of extractOgImages(html)) {
      const target = internalTarget(image, pageUrl, origin)
      if (!target) continue
      links += 1
      if (!resolveDistPath(distDir, target.path)) {
        broken.push({ page: pageUrl, href: image, reason: 'og:image not built' })
      }
    }
    for (const href of new Set(extractHrefs(html))) {
      const target = internalTarget(href, pageUrl, origin)
      if (!target || isIgnored(pageUrl, href)) continue
      links += 1
      const served = resolveDistPath(distDir, target.path)
      if (!served) {
        if (!redirectCovers(rules, target.path))
          broken.push({ page: pageUrl, href, reason: 'no such page' })
        continue
      }
      if (target.fragment === null || target.fragment === '') continue
      if (posix.extname(served) !== '.html') continue
      anchors += 1
      if (!(await idsOf(served)).has(target.fragment)) {
        broken.push({
          page: pageUrl,
          href,
          reason: `no #${target.fragment} on ${pageUrlFor(served)}`,
        })
      }
    }
  }
  return { pages: files.length, links, anchors, broken }
}
