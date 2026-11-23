/**
 * anchors.mjs — keep the heading anchors of the VitePress site working.
 *
 * VitePress and Nimbus slugify headings differently ("1. Check" is
 * `#_1-check` in VitePress and `#1-check` in Nimbus; "DI & Events" is
 * `#di-events` and `#di--events`). Links from outside the site still point at
 * the VitePress ids, so after the preset build every h2-h6 whose VitePress id
 * is not already on the page gets an empty `<a id>` right before it. The
 * VitePress id is computed from the rendered heading text, the same input
 * VitePress slugifies.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { listFiles } from './dist.mjs'

// VitePress default slugify (vitepress src/node/markdown/plugins/slugify.ts).
const CONTROL = /[\u0000-\u001f]/g
const SPECIAL = /[\s~`!@#$%^&*()\-_+=[\]{}|\\;:"'“”‘’<>,.?/]+/g
const COMBINING = /[̀-ͯ]/g

/** The id VitePress gives a heading with this text (before de-duplication). */
export function vitepressSlug(text) {
  return text
    .normalize('NFKD')
    .replace(COMBINING, '')
    .replace(CONTROL, '')
    .replace(SPECIAL, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^(\d)/, '_$1')
    .toLowerCase()
}

const ENTITIES = Object.freeze({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })

/** `html` with every tag removed, repeated until nothing changes (no `<scr<b>ipt` left over). */
function stripTags(html) {
  let previous
  let text = html
  do {
    previous = text
    text = text.replace(/<[^>]*>/g, '')
  } while (text !== previous)
  return text
}

/**
 * The text of a heading's inner HTML: tags dropped, entities decoded. Only
 * used as slug input, never written back as HTML.
 */
export function headingText(innerHtml) {
  return stripTags(innerHtml)
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name) => {
      if (name[0] !== '#') return ENTITIES[name.toLowerCase()] ?? entity
      const code =
        name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : Number(name.slice(1))
      return Number.isFinite(code) ? String.fromCodePoint(code) : entity
    })
    .trim()
}

const HEADING = /<h([2-6])\b[^>]*>([\s\S]*?)<\/h\1>/g
const ID_ATTR = /\sid="([^"]*)"/g

/**
 * Add the missing VitePress anchors to one HTML page. Duplicate slugs get the
 * VitePress suffixes (`-1`, `-2`, ...) in document order. Returns
 * { html, added }; the input string is not modified.
 */
export function addLegacyAnchors(html) {
  const ids = new Set([...html.matchAll(ID_ATTR)].map((m) => m[1]))
  const seen = new Map()
  let added = 0
  const out = html.replace(HEADING, (heading, _level, inner) => {
    const base = vitepressSlug(headingText(inner))
    if (base === '') return heading
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    const slug = count === 0 ? base : `${base}-${count}`
    if (ids.has(slug)) return heading
    ids.add(slug)
    added += 1
    return `<a id="${slug}"></a>${heading}`
  })
  return { html: out, added }
}

/** Add the missing VitePress anchors to every HTML page of `distDir`. */
export async function preserveLegacyAnchors(distDir) {
  let pages = 0
  let anchors = 0
  for (const file of await listFiles(distDir)) {
    if (!file.endsWith('.html')) continue
    const path = join(distDir, file)
    const result = addLegacyAnchors(await readFile(path, 'utf8'))
    if (result.added === 0) continue
    await writeFile(path, result.html)
    pages += 1
    anchors += result.added
  }
  return { pages, anchors }
}
