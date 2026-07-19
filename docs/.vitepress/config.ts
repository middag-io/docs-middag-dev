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
function channelSidebar(
  repo: string,
  segment: string,
  header: string,
): DefaultTheme.SidebarItem[] {
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
    const files = markdownFiles(join(base, group)).sort((a, b) =>
      a.slug.localeCompare(b.slug),
    )
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

const nav: DefaultTheme.NavItem[] = [
  { text: 'Home', link: '/' },
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
