#!/usr/bin/env node
/**
 * build-site.mjs — builds docs.middag.dev with @middag-io/nimbus-preset.
 *
 * Steps, in order:
 *   1. prebuild: fetch the injected channels (scripts/fetch-injected-docs.mjs),
 *      unless --no-fetch is given and docs/injected/ is reused as is;
 *   2. assemble docs/ and docs/injected/{repo}/{segment}/ into site-content/;
 *   3. publish guard over the assembled tree (decisions/, internal/, adr/, madr/);
 *   4. generated landing pages where a directory has none (/{repo}/,
 *      /libraries/reference/);
 *   5. `searchable: false` on every page of a non-default channel, so search
 *      lists each page once; dotted channel routes pinned; VitePress-only
 *      syntax (`{#id}` headings, `layout: home`) turned into Markdown;
 *   6. navigation overrides (site-navigation.json) from nav.json and the
 *      channel manifests;
 *   7. the preset build, in strict mode: any warning fails it;
 *   8. post-build: dist/_redirects, structural checks, offline link check with
 *      anchors, and the sitemap snapshot mapping.
 *
 * Usage: node scripts/build-site.mjs [--no-fetch]
 */
import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs, promisify } from 'node:util'

import { assertTreePublishable } from './lib/publish-guard.mjs'
import { assembleContent, writeIfMissing } from './lib/site/content.mjs'
import { checkDist, mapSitemapUrls, parseRedirects, writeRedirects } from './lib/site/dist.mjs'
import { checkLinks } from './lib/site/links.mjs'
import {
  convertHeadingIds,
  convertHomeLayout,
  landingPage,
  routeSlug,
  setFrontmatterKey,
} from './lib/site/markdown.mjs'
import {
  axisOverrides,
  channelLabel,
  channelOverrides,
  navLeaves,
  sectionOverrides,
} from './lib/site/navigation.mjs'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const CONTENT_PATH = 'site-content'
export const NAVIGATION_FILE = 'site-navigation.json'
export const SITE_ORIGIN = 'https://docs.middag.dev'
export const SITEMAP_SNAPSHOT = 'test/fixtures/live-sitemap-urls.txt'

/**
 * Link-check exceptions, exact page and href. The theme's 404 page has a
 * skip link to #main-content but no element with that id.
 */
export const LINK_CHECK_IGNORE = Object.freeze([{ page: '/404.html', href: '#main-content' }])

const run = promisify(execFile)

/** Every .md file under `dir`, relative to it. */
async function markdownFiles(dir, base = dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await markdownFiles(abs, base)))
    else if (entry.name.endsWith('.md')) out.push(abs.slice(base.length + 1))
  }
  return out
}

/** The first `# ` heading of a Markdown file, or null. */
export function firstHeading(markdown) {
  return markdown.match(/^#\s+(.+?)\s*$/m)?.[1] ?? null
}

/** Landing pages for repos and directories that have no index.md of their own. */
export async function writeLandings(contentDir, repos, log) {
  for (const repo of repos) {
    const written = await writeIfMissing(
      join(contentDir, repo.repo, 'index.md'),
      landingPage({
        title: repo.label,
        intro: 'Published documentation channels:',
        // Root-absolute: a relative link would be rewritten to the slugified
        // route, and channel routes keep their dots (see prepareChannels).
        links: repo.channels.map((c) => ({
          label: channelLabel(c),
          href: `/${repo.repo}/${c.segment}/`,
        })),
      }),
    )
    if (written) log(`landing: /${repo.repo}/`)
  }

  const librariesNav = join(contentDir, 'libraries', 'nav.json')
  if (existsSync(join(contentDir, 'libraries', 'reference')) && existsSync(librariesNav)) {
    const spec = JSON.parse(await readFile(librariesNav, 'utf8'))
    const links = navLeaves(spec)
      .filter((l) => l.file.startsWith('reference/'))
      .map((l) => ({ label: l.label, href: `./${l.file.slice('reference/'.length)}.md` }))
    const written = await writeIfMissing(
      join(contentDir, 'libraries', 'reference', 'index.md'),
      landingPage({ title: 'Reference', intro: 'Policy shared by the PHP library family:', links }),
    )
    if (written) log('landing: /libraries/reference/')
  }
}

/** A path segment that the content layer would route unchanged. */
export const isSlugSafe = (segment) => /^[a-z0-9_-]+$/.test(segment)

/**
 * Per-channel frontmatter:
 * - `searchable: false` on every page of a non-default channel, so search lists
 *   each page once (the default channel is the first declared one);
 * - `slug` pinned to the file path when the channel segment is not slug-safe:
 *   the content layer strips dots, which would move /middag-react/0.30/x to
 *   /middag-react/030/x. The pinned slug keeps the published URL. The
 *   generated social image of such a page cannot be emitted at its dotted
 *   path, so the page reuses the repo landing's image (`socialImage`).
 * Returns { hidden, pinned } page counts.
 */
export async function prepareChannels(contentDir, repos) {
  let hidden = 0
  let pinned = 0
  for (const repo of repos) {
    for (const channel of repo.channels) {
      const isOld = channel.segment !== repo.defaultSegment
      const needsSlug = !isSlugSafe(channel.segment)
      if (!isOld && !needsSlug) continue
      const dir = join(contentDir, repo.repo, channel.segment)
      for (const file of await markdownFiles(dir)) {
        const path = join(dir, file)
        let text = await readFile(path, 'utf8')
        if (isOld) {
          text = setFrontmatterKey(text, 'searchable', false)
          hidden += 1
        }
        if (needsSlug) {
          text = setFrontmatterKey(
            text,
            'slug',
            routeSlug(`${repo.repo}/${channel.segment}/${file}`),
          )
          text = setFrontmatterKey(text, 'socialImage', `/og/${repo.repo}.png`)
          pinned += 1
        }
        await writeFile(path, text)
      }
    }
  }
  return { hidden, pinned }
}

/**
 * VitePress-only syntax in every page: `{#id}` heading suffixes become
 * anchors, and `layout: home` pages become plain Markdown. Returns the counts.
 */
export async function convertVitepressSyntax(contentDir) {
  let headingIds = 0
  let homePages = 0
  for (const file of await markdownFiles(contentDir)) {
    const path = join(contentDir, file)
    const original = await readFile(path, 'utf8')
    const home = convertHomeLayout(original)
    const headings = convertHeadingIds(home.text)
    if (home.converted) homePages += 1
    headingIds += headings.count
    if (headings.text !== original) await writeFile(path, headings.text)
  }
  return { headingIds, homePages }
}

/** Build the navigation overrides for the assembled tree. */
export async function buildNavigation(contentDir, repos) {
  const existing = (relativePath) => existsSync(join(contentDir, relativePath))
  let overrides = channelOverrides({ contentPath: CONTENT_PATH, repos })
  for (const entry of await readdir(contentDir, { withFileTypes: true })) {
    const navFile = join(contentDir, entry.name, 'nav.json')
    if (!entry.isDirectory() || !existsSync(navFile)) continue
    const spec = JSON.parse(await readFile(navFile, 'utf8'))
    overrides = {
      ...overrides,
      ...axisOverrides({ contentPath: CONTENT_PATH, axis: entry.name, spec, existing }),
    }
  }
  return sectionOverrides({ contentPath: CONTENT_PATH, existing, base: overrides })
}

/** Run the preset in this process; any non-info diagnostic fails the build. */
async function runPreset(root, log) {
  const { build, loadConfig } = await import('@middag-io/nimbus-preset')
  const config = await loadConfig(root)
  const result = await build(config)
  const problems = result.diagnostics.filter((d) => d.severity !== 'info')
  for (const d of problems) log(`${d.severity}: ${d.file ? `${d.file}: ` : ''}${d.message}`)
  if (problems.length > 0) throw new Error(`the preset reported ${problems.length} problem(s)`)
  if (!result.searchIndexed) throw new Error('the preset built no search index')
  log(`preset: ${result.pageCount} page(s) in ${result.buildSeconds.toFixed(1)}s`)
  return result
}

/** Post-build: _redirects, structural checks, link check, sitemap mapping. */
export async function finishDist({ root, log }) {
  const distDir = join(root, 'dist')
  await writeRedirects(distDir)
  const rules = parseRedirects(await readFile(join(distDir, '_redirects'), 'utf8'))

  const homeHeading = firstHeading(await readFile(join(root, 'docs', 'index.md'), 'utf8'))
  const violations = await checkDist(distDir, { homeHeading })
  if (violations.length > 0) throw new Error(`dist/ was refused:\n- ${violations.join('\n- ')}`)

  const links = await checkLinks(distDir, {
    origin: SITE_ORIGIN,
    rules,
    ignore: LINK_CHECK_IGNORE,
  })
  log(
    `links: ${links.pages} page(s), ${links.links} internal link(s), ${links.anchors} anchor(s) checked`,
  )
  if (links.broken.length > 0) {
    const lines = links.broken.map((b) => `${b.page}: ${b.href} (${b.reason})`)
    throw new Error(`${links.broken.length} broken link(s):\n- ${lines.join('\n- ')}`)
  }

  const urls = readFileSync(join(root, SITEMAP_SNAPSHOT), 'utf8').split('\n').filter(Boolean)
  const mapping = mapSitemapUrls(distDir, urls, rules)
  log(
    `sitemap: ${mapping.total} URL(s), ${mapping.pages} page(s), ${mapping.redirected} redirect(s)`,
  )
  if (mapping.unmapped.length > 0) {
    throw new Error(
      `${mapping.unmapped.length} live URL(s) have no page:\n- ${mapping.unmapped.join('\n- ')}`,
    )
  }
  return { links, mapping }
}

export async function buildSite({ root = ROOT, fetch = true, log = () => {} } = {}) {
  if (fetch) {
    const { stdout } = await run(
      process.execPath,
      [join(root, 'scripts', 'fetch-injected-docs.mjs')],
      {
        cwd: root,
      },
    )
    log(stdout.trimEnd())
  }

  const contentDir = join(root, CONTENT_PATH)
  const repos = await assembleContent({
    docsDir: join(root, 'docs'),
    injectedDir: join(root, 'docs', 'injected'),
    outDir: contentDir,
  })
  assertTreePublishable(contentDir, { source: `${CONTENT_PATH}/ (assembled tree)` })

  await writeLandings(contentDir, repos, log)
  const { hidden, pinned } = await prepareChannels(contentDir, repos)
  log(`channels: ${hidden} page(s) kept out of search, ${pinned} route(s) pinned`)
  const syntax = await convertVitepressSyntax(contentDir)
  log(`syntax: ${syntax.headingIds} heading id(s), ${syntax.homePages} home page(s) converted`)

  const navigation = await buildNavigation(contentDir, repos)
  await writeFile(join(root, NAVIGATION_FILE), `${JSON.stringify(navigation, null, 2)}\n`)
  log(`navigation: ${Object.keys(navigation).length} override(s)`)

  const result = await runPreset(root, log)
  const checks = await finishDist({ root, log })
  return { pages: result.pageCount, ...checks }
}

async function main(argv) {
  const { values } = parseArgs({ args: argv, options: { 'no-fetch': { type: 'boolean' } } })
  await buildSite({ fetch: !values['no-fetch'], log: (m) => process.stdout.write(`${m}\n`) })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`[site] FAILED: ${error.message}\n`)
    process.exitCode = 1
  })
}
