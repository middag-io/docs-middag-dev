/**
 * markdown.mjs — small edits to Markdown source text.
 */
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

/**
 * Set a top-level scalar frontmatter key, adding a frontmatter block when the
 * file has none. An existing value for `key` is replaced. Returns new text;
 * the input string is not modified.
 */
export function setFrontmatterKey(markdown, key, value) {
  if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(key)) throw new Error(`invalid frontmatter key: ${key}`)
  const line = `${key}: ${JSON.stringify(value)}`
  const match = markdown.match(FRONTMATTER)
  if (!match) return `---\n${line}\n---\n\n${markdown}`

  const lines = match[1].split(/\r?\n/)
  const at = lines.findIndex((l) => l.startsWith(`${key}:`))
  const next = at === -1 ? [...lines, line] : lines.map((l, i) => (i === at ? line : l))
  return `---\n${next.join('\n')}\n---\n${markdown.slice(match[0].length)}`
}

/** Escape text for use inside a Markdown link label. */
export function escapeLinkText(text) {
  return String(text).replace(/([\\[\]])/g, '\\$1')
}

/** A landing page: an H1, an optional intro and a bullet list of links. */
export function landingPage({ title, intro = '', links }) {
  const items = links.map((l) => `- [${escapeLinkText(l.label)}](${l.href})`).join('\n')
  return `# ${title}\n\n${intro ? `${intro}\n\n` : ''}${items}\n`
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/
const HEADING_ID = /^( {0,3}#{1,6}\s+.*?)\s+\{#([A-Za-z][\w.:-]*)\}\s*$/

/**
 * Convert VitePress explicit heading ids (`## Title {#custom-id}`), which the
 * Nimbus renderer would print as text, into a standalone anchor before the
 * heading: `<a id="custom-id"></a>`, a blank line, then `## Title`. Links to
 * `#custom-id` keep working and the heading also gets its own derived id.
 * Lines inside fenced code blocks are left alone. Returns { text, count }.
 */
export function convertHeadingIds(markdown) {
  const out = []
  let fence = null
  let count = 0
  for (const line of markdown.split('\n')) {
    const marker = line.match(FENCE)?.[1]
    if (fence) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = null
      out.push(line)
      continue
    }
    if (marker) {
      fence = marker
      out.push(line)
      continue
    }
    const heading = line.match(HEADING_ID)
    if (!heading) {
      out.push(line)
      continue
    }
    count += 1
    out.push(`<a id="${heading[2]}"></a>`, '', heading[1])
  }
  return { text: out.join('\n'), count }
}

/**
 * The route slug of a content file, without leading or trailing slash:
 * "middag-react/0.30/guides/forms.md" -> "middag-react/0.30/guides/forms",
 * ".../0.30/index.md" -> ".../0.30".
 */
export function routeSlug(relativePath) {
  const clean = relativePath
    .split(/[\\/]+/)
    .join('/')
    .replace(/\.md$/, '')
  return clean === 'index' ? '' : clean.replace(/\/index$/, '')
}

/**
 * Turn a VitePress home page (`layout: home` with `hero` and `features` in
 * the frontmatter) into plain Markdown: the hero becomes an H1, its text and
 * tagline, and a list of its actions; the features become a list. Nimbus
 * renders every page as a document and would drop that frontmatter, so
 * without this the hero and features would disappear. The remaining
 * frontmatter keys are kept. Returns { text, converted }.
 */
export function convertHomeLayout(markdown) {
  const match = markdown.match(FRONTMATTER)
  if (!match) return { text: markdown, converted: false }
  let data
  try {
    data = parseYaml(match[1])
  } catch {
    return { text: markdown, converted: false }
  }
  if (data?.layout !== 'home') return { text: markdown, converted: false }

  const { layout, hero = {}, features = [], ...rest } = data
  const blocks = []
  const name = hero.name ?? rest.title
  if (name) blocks.push(`# ${name}`)
  if (hero.text) blocks.push(`**${hero.text}**`)
  if (hero.tagline) blocks.push(hero.tagline)
  const actions = (hero.actions ?? []).filter((a) => a?.text && a?.link)
  if (actions.length > 0) {
    blocks.push(actions.map((a) => `- [${escapeLinkText(a.text)}](${a.link})`).join('\n'))
  }
  const items = (Array.isArray(features) ? features : []).filter((f) => f?.title)
  if (items.length > 0) {
    const line = (f) => {
      const title = f.link ? `[${escapeLinkText(f.title)}](${f.link})` : f.title
      return `- **${title}**${f.details ? `: ${f.details}` : ''}`
    }
    blocks.push(items.map(line).join('\n'))
  }

  const frontmatter = Object.keys(rest).length > 0 ? `---\n${stringifyYaml(rest)}---\n\n` : ''
  const body = markdown.slice(match[0].length).replace(/^\s*\n/, '')
  return { text: `${frontmatter}${blocks.join('\n\n')}\n\n${body}`, converted: true }
}
