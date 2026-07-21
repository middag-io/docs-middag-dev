import { defineConfig, type DefaultTheme } from 'vitepress'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// ADR-016 §4 — the hub's presentation layer is meant to come from
// @middag-io/docs-theme. That package is still scaffolding (it currently
// exports only `name`, no VitePress preset), so the options below are defined
// locally. When the theme ships a config export, replace the inline options
// with it, e.g.:
//   import { defineHubConfig } from '@middag-io/docs-theme'
//   export default defineHubConfig({ /* hub overrides */ })

// ---------------------------------------------------------------------------
// Dynamic, MULTI-VERSION nav + sidebar generation.
//
// `npm run docs:prebuild` (scripts/fetch-injected-docs.mjs) reads the
// hub.config.json allowlist and writes, per repo, one folder per published
// channel:  docs/injected/{repo}/{segment}/**  plus  docs/injected/{repo}/
// _channels.json  ( { label, defaultSegment, channels:[{selector,segment,
// version}] } ). Those are served at versioned URLs /{repo}/{segment}/** via
// the `rewrites` below.
//
// This config, loaded AFTER prebuild, derives everything from that tree:
//   - a nav dropdown per repo = the version switcher (one entry per channel);
//   - a sidebar per /{repo}/{segment}/ built from that channel's file tree.
// Nothing is hardcoded to a repo, version or channel — edit hub.config.json and
// it all follows.
//
// Requirement on injected content: plain Markdown. A page label comes from its
// frontmatter `title:`, else its first `# H1`, else a humanized filename. The
// folder structure (guides/, reference/, …) becomes sidebar groups.
// ---------------------------------------------------------------------------

const DOCS_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const INJECTED_DIR = join(DOCS_DIR, 'injected')

// Root-level pages surface in this order; anything unlisted falls after, alpha.
const ROOT_ORDER = ['getting-started', 'authentication', 'cli']
// These sink to the bottom of the root list.
const ROOT_LAST = ['changelog']
// Group folders surface in this order; unlisted folders follow, alpha.
const GROUP_ORDER = ['guides', 'reference']

type Channel = { selector: string; segment: string; version: string }
type RepoMeta = { repo: string; label: string; defaultSegment: string; channels: Channel[] }

function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}

/** Humanize a slug: "getting-started" -> "Getting Started". */
function humanize(slug: string): string {
  return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Page label: frontmatter `title:`, else first `# H1`, else humanized name. */
function pageTitle(absFile: string, fallbackSlug: string): string {
  let text = ''
  try {
    text = readFileSync(absFile, 'utf8')
  } catch {
    return humanize(fallbackSlug)
  }
  const fm = text.match(/^---\n([\s\S]*?)\n---/)
  if (fm) {
    const t = fm[1].match(/^\s*title:\s*['"]?(.+?)['"]?\s*$/m)
    if (t) return t[1].trim()
  }
  const h1 = text.match(/^#\s+(.+?)\s*$/m)
  if (h1) return h1[1].trim()
  return humanize(fallbackSlug)
}

/** `.md` files (minus index) directly inside a dir, as {slug, abs}. */
function markdownFiles(dir: string): { slug: string; abs: string }[] {
  return safeReaddir(dir)
    .filter((f) => f.endsWith('.md') && f !== 'index.md')
    .map((f) => ({ slug: f.replace(/\.md$/, ''), abs: join(dir, f) }))
}

function orderBy(slug: string, order: string[], last: string[] = []): number {
  const i = order.indexOf(slug)
  if (i !== -1) return i
  const l = last.indexOf(slug)
  if (l !== -1) return order.length + 1000 + l
  return order.length // unlisted: after ordered, before `last`
}

/** Build the sidebar item list for one repo channel (base = {repo}/{segment}). */
function channelSidebar(repo: string, segment: string, header: string): DefaultTheme.SidebarItem[] {
  const base = join(INJECTED_DIR, repo, segment)
  const items: DefaultTheme.SidebarItem[] = []

  // Root-level pages (excluding index.md, which is the /{repo}/{segment}/ landing).
  const roots = markdownFiles(base).sort((a, b) => {
    const oa = orderBy(a.slug, ROOT_ORDER, ROOT_LAST)
    const ob = orderBy(b.slug, ROOT_ORDER, ROOT_LAST)
    return oa !== ob ? oa - ob : a.slug.localeCompare(b.slug)
  })
  if (roots.length) {
    items.push({
      text: header,
      items: roots.map((f) => ({
        text: pageTitle(f.abs, f.slug),
        link: `/${repo}/${segment}/${f.slug}`,
      })),
    })
  }

  // Subdirectories become collapsible groups.
  const groups = safeReaddir(base)
    .filter((d) => isDir(join(base, d)))
    .sort((a, b) => {
      const oa = orderBy(a, GROUP_ORDER)
      const ob = orderBy(b, GROUP_ORDER)
      return oa !== ob ? oa - ob : a.localeCompare(b)
    })
  for (const group of groups) {
    const files = markdownFiles(join(base, group)).sort((a, b) => a.slug.localeCompare(b.slug))
    if (!files.length) continue
    items.push({
      text: humanize(group),
      collapsed: false,
      items: files.map((f) => ({
        text: pageTitle(f.abs, f.slug),
        link: `/${repo}/${segment}/${group}/${f.slug}`,
      })),
    })
  }

  return items
}

// ---------------------------------------------------------------------------
// Own-authored content: docs this hub writes directly (ADR-016 amendment,
// see decisions/ADR-CANDIDATE-docs-middag-dev-diataxis-ownership-DRAFT.md in
// tool-middag-planning) instead of aggregating from a library's `docs/`.
// No version segment yet — add one if/when a 2.x line needs it. Walked
// recursively so nested concern folders (adapters/moodle/, ui/) drill down
// as collapsible sub-groups instead of a flat list.
//
// Which repo is "owned" is discovered, not hardcoded (see discoverOwnedRepos
// below) — no repo name/slug lives in this file. Adding `core/` later means
// dropping a `docs/core/` folder (+ optional `nav.json`) on disk, nothing
// in config.ts to touch.
// ---------------------------------------------------------------------------
const RESERVED_DOC_DIRS = new Set(['injected', '.vitepress', 'public'])

const OWNED_TYPE_ORDER = ['tutorials', 'how-to', 'reference', 'explanation']

/** Recursively build sidebar items for an own-authored doc tree. */
function ownedSidebarItems(
  absDir: string,
  urlBase: string,
  depth: number,
): DefaultTheme.SidebarItem[] {
  const items: DefaultTheme.SidebarItem[] = markdownFiles(absDir)
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((f) => ({
      text: pageTitle(f.abs, f.slug),
      link: `${urlBase}/${f.slug}`,
    }))

  const subdirs = safeReaddir(absDir)
    .filter((d) => isDir(join(absDir, d)))
    .sort((a, b) => {
      const order = depth === 0 ? OWNED_TYPE_ORDER : []
      const oa = orderBy(a, order)
      const ob = orderBy(b, order)
      return oa !== ob ? oa - ob : a.localeCompare(b)
    })

  for (const dir of subdirs) {
    const nested = ownedSidebarItems(join(absDir, dir), `${urlBase}/${dir}`, depth + 1)
    if (!nested.length) continue
    items.push({
      text: humanize(dir),
      // Top-level Diataxis-type groups (tutorials/reference/…) open by
      // default; nested concern groups (ui/, adapters/moodle/) start
      // collapsed so a reader drills down deliberately.
      collapsed: depth > 0,
      items: nested,
    })
  }

  return items
}

// ---------------------------------------------------------------------------
// Curated nav for own-authored repos: labels + topic-cluster order chosen by
// reading every doc's full content (not derived from filenames/frontmatter —
// that produced a flat, redundant-prefixed sidebar). See the nav-redesign
// workflow in tool-middag-planning session history for how this was built:
// 3 read-and-propose passes -> synthesis -> adversarial completeness + IA
// review -> one repair pass, then flattened to match laravel.com/docs'
// actual sidebar shape (verified 2026-07-21: Section -> Page, two levels
// max, never deeper — not even for closely-related pairs like Database /
// Eloquent ORM, which are two flat sibling sections, not nested).
//
// Data lives in `docs/<repo>/nav.json`, kept out of this file on purpose so
// editing the nav doesn't mean touching TypeScript. Plain data, no runtime
// drift-check: whoever adds/removes a doc updates nav.json in the same
// change (same as hand-maintaining Laravel's own doc sidebar). A repo with
// no nav.json falls back to `ownedSidebarItems()` (mechanical, uncurated).
// ---------------------------------------------------------------------------
type NavLeaf = { file: string; label: string }
type NavGroup = { label: string; order?: number; files: string[]; labels?: NavLeaf[] }
type NavSection = { items?: NavLeaf[]; ui?: NavLeaf[] }
/**
 * Every field is optional except `label` (which itself defaults to the dir
 * name) — a repo only declares the sections it actually has. `core/` won't
 * need `tutorials`/`howTo` (Surface API is reference-only) but will likely
 * need 2 adapters (Moodle + WordPress, per the ADR-CANDIDATE draft in
 * tool-middag-planning) instead of framework's 1 — hence `adapters` being a
 * named array rather than a single hardcoded `adaptersMoodleGroups` field.
 */
type OwnedNav = {
  label?: string
  tutorials?: NavSection
  howTo?: NavSection
  explanation?: NavSection
  reference?: { groups?: NavGroup[]; ui?: NavLeaf[] }
  adapters?: { name: string; groups: NavGroup[] }[]
}

function readNavJson(absDir: string): OwnedNav | null {
  const file = join(absDir, 'nav.json')
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as OwnedNav
  } catch (err) {
    console.warn(`[docs-middag-dev] failed to parse ${file}: ${(err as Error).message}`)
    return null
  }
}

/** Every top-level `docs/<dir>/` that isn't reserved infra — no repo name hardcoded here. */
function discoverOwnedRepos(): { dir: string; label: string }[] {
  return safeReaddir(DOCS_DIR)
    .filter((d) => isDir(join(DOCS_DIR, d)) && !RESERVED_DOC_DIRS.has(d))
    .map((dir) => ({ dir, label: readNavJson(join(DOCS_DIR, dir))?.label ?? humanize(dir) }))
    .sort((a, b) => a.dir.localeCompare(b.dir))
}

function ownedLeaf(urlBase: string, l: NavLeaf): DefaultTheme.SidebarItem {
  return { text: l.label, link: `${urlBase}/${l.file}` }
}

/** Leaves of one topic cluster, flattened (no nested group node) — see curatedOwnedSidebar. */
function clusterLeaves(urlBase: string, g: NavGroup): DefaultTheme.SidebarItem[] {
  const labelFor = (file: string) =>
    g.labels?.find((x) => x.file === file)?.label ?? humanize(file.split('/').pop() ?? file)
  return g.files.map((file) => ({ text: labelFor(file), link: `${urlBase}/${file}` }))
}

function uiLeaf(urlBase: string, l: NavLeaf): DefaultTheme.SidebarItem {
  return ownedLeaf(urlBase, { file: l.file, label: `UI: ${l.label}` })
}

/**
 * Curated (semantic, hand-labeled) sidebar built from a repo's `nav.json`.
 * Flat Section -> Page, two levels max, matching how laravel.com/docs
 * actually structures its own sidebar (11 sections, up to 21 items each,
 * verified 2026-07-21: never a 3rd nesting level, not even for closely-
 * related pairs like Database/Eloquent ORM — those are two flat sibling
 * sections, not one nested under the other). The topic clusters in
 * nav.json still drive item ORDER (foundational first, legacy last) and
 * disambiguating labels; they just don't become their own
 * clickable/collapsible tree nodes anymore. Moodle's reference docs get
 * their own top-level section (mirrors Eloquent ORM living next to
 * Database) instead of being buried under Reference > Adapters > Moodle.
 */
function curatedOwnedSidebar(urlBase: string, spec: OwnedNav): DefaultTheme.SidebarItem[] {
  const byOrder = (gs: NavGroup[]) => [...gs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const sectionItems = (s?: NavSection) => [
    ...(s?.items ?? []).map((l) => ownedLeaf(urlBase, l)),
    ...(s?.ui ?? []).map((l) => uiLeaf(urlBase, l)),
  ]

  const sections: DefaultTheme.SidebarItem[] = []

  const tutorials = sectionItems(spec.tutorials)
  if (tutorials.length) sections.push({ text: 'Tutorials', items: tutorials })

  const howTo = (spec.howTo?.items ?? []).map((l) => ownedLeaf(urlBase, l))
  if (howTo.length) sections.push({ text: 'How-to', items: howTo })

  const reference = [
    ...byOrder(spec.reference?.groups ?? []).flatMap((g) => clusterLeaves(urlBase, g)),
    ...(spec.reference?.ui ?? []).map((l) => uiLeaf(urlBase, l)),
  ]
  if (reference.length) sections.push({ text: 'Reference', items: reference })

  // Each adapter (Moodle, WordPress, …) is its own top-level sibling
  // section — mirrors laravel.com/docs keeping Eloquent ORM next to
  // Database rather than nesting one inside the other.
  for (const adapter of spec.adapters ?? []) {
    const items = byOrder(adapter.groups).flatMap((g) => clusterLeaves(urlBase, g))
    if (items.length) sections.push({ text: adapter.name, items })
  }

  const explanation = sectionItems(spec.explanation)
  if (explanation.length) sections.push({ text: 'Explanation', items: explanation })

  return sections
}

/** Read every repo's _channels.json produced by the prebuild step. */
function injectedRepos(): RepoMeta[] {
  return safeReaddir(INJECTED_DIR)
    .filter((r) => isDir(join(INJECTED_DIR, r)))
    .map((repo) => {
      const metaFile = join(INJECTED_DIR, repo, '_channels.json')
      if (!existsSync(metaFile)) return null
      try {
        const meta = JSON.parse(readFileSync(metaFile, 'utf8'))
        return {
          repo,
          label: meta.label ?? repo,
          defaultSegment: meta.defaultSegment,
          channels: meta.channels ?? [],
        } as RepoMeta
      } catch {
        return null
      }
    })
    .filter((x): x is RepoMeta => x !== null && x.channels.length > 0)
    .sort((a, b) => a.repo.localeCompare(b.repo))
}

/** "latest" -> "Latest (0.38.0)"; "0.30.x" -> "0.30.x (0.30.0)". */
function channelLabel(c: Channel): string {
  const name = c.selector === 'latest' ? 'Latest' : c.selector
  return `${name} (${c.version})`
}

const repos = injectedRepos()
const ownedRepos = discoverOwnedRepos()

const nav: DefaultTheme.NavItem[] = [
  { text: 'Home', link: '/' },
  { text: 'About', link: '/about' },
  ...ownedRepos.map((r) => ({ text: r.label, link: `/${r.dir}/` })),
  ...repos.map((r) => ({
    // Repo dropdown = version switcher.
    text: r.label,
    items: r.channels.map((c) => ({
      text: channelLabel(c),
      link: `/${r.repo}/${c.segment}/`,
    })),
  })),
]

const sidebar: DefaultTheme.SidebarMulti = {}
for (const r of ownedRepos) {
  const urlBase = `/${r.dir}`
  const absDir = join(DOCS_DIR, r.dir)
  const ownedNav = readNavJson(absDir)
  sidebar[`${urlBase}/`] = ownedNav
    ? curatedOwnedSidebar(urlBase, ownedNav)
    : ownedSidebarItems(absDir, urlBase, 0)
}
for (const r of repos) {
  for (const c of r.channels) {
    sidebar[`/${r.repo}/${c.segment}/`] = channelSidebar(
      r.repo,
      c.segment,
      `${r.label} ${c.version}`,
    )
  }
}

export default defineConfig({
  title: 'MIDDAG Docs',
  description:
    'Unified documentation hub for MIDDAG libraries — build-time aggregated via edge storage (ADR-016).',
  lang: 'en',
  cleanUrls: true,
  lastUpdated: true,

  sitemap: { hostname: 'https://docs.middag.dev' },

  // Serve injected library docs at versioned URLs:
  //   docs/injected/{repo}/{segment}/**  ->  /{repo}/{segment}/**
  // The prebuild step already lays the tree out as {repo}/{segment}/…, so the
  // rewrite only strips the injected/ prefix. Function form avoids VitePress's
  // path-to-regexp object-form URL-encoding of multi-segment captures.
  rewrites(id) {
    const m = id.match(/^injected\/(.+)$/)
    return m ? m[1] : id
  },

  // In-package absolute links are rewritten to /{repo}/{segment}/… at prebuild
  // time (scripts/fetch-injected-docs.mjs). Dead-link checking stays off:
  // injected payloads may still link to targets outside their own doc set.
  ignoreDeadLinks: true,

  head: [
    ['meta', { name: 'theme-color', content: '#0F172A' }],
    ['meta', { property: 'og:site_name', content: 'MIDDAG Docs' }],
  ],

  themeConfig: {
    siteTitle: 'MIDDAG Docs',
    nav,
    sidebar,
    outline: { level: [2, 3] },
    socialLinks: [{ icon: 'github', link: 'https://github.com/middag-io' }],
    footer: { message: 'MIDDAG &copy; 2015-2026' },
    search: { provider: 'local' },
  },
})
