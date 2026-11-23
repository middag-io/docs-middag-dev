/**
 * navigation.mjs — turns the curated nav.json of an own-authored axis, and the
 * channel manifests of the injected repos, into nimbus-preset navigation
 * overrides ({ order, label }) keyed by source-relative path.
 *
 * The preset derives the sidebar from folders, so a nav.json section that
 * spans folders (Moodle, WordPress, UI) cannot become its own group. What
 * survives is the curated ORDER of the pages and their LABELS; the folder
 * hierarchy provides the groups.
 *
 * Keys carry the content source path as prefix ("site-content/framework/x.md"),
 * which is how the preset matches overrides. A leaf that points at an
 * `index` page is keyed by its directory: the preset hangs a directory's
 * label and order on the directory, and a file key for its index.md would
 * leave the directory override with nowhere to land.
 */

/** Top-level order of the site sections; unlisted folders follow, alphabetically. */
export const SECTION_ORDER = Object.freeze([
  'framework',
  'libraries',
  'integrate',
  'middag-react',
  'middag-php-wordpress',
  'infra-terraform',
  'about.md',
])

/** Order of the Diataxis type folders inside an axis. */
export const DIATAXIS_ORDER = Object.freeze(['tutorials', 'how-to', 'reference', 'explanation'])

const byOrder = (groups) => [...groups].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

const humanize = (slug) => slug.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

/**
 * Every leaf of a nav.json, as [{ file, label, section? }], in reading order:
 * tutorials, how-to, reference groups (by `order`) and UI, adapters,
 * companions, explanation. That is the order the VitePress sidebar showed.
 * Leaves of a named section (an adapter or a companion) carry its name.
 */
export function navLeaves(spec) {
  const leaves = []
  const section = (s) => [...(s?.items ?? []), ...(s?.ui ?? [])]
  const cluster = (g) =>
    g.files.map((file) => ({
      file,
      label: g.labels?.find((l) => l.file === file)?.label ?? humanize(file.split('/').pop()),
    }))

  leaves.push(...section(spec.tutorials))
  leaves.push(...(spec.howTo?.items ?? []))
  leaves.push(...byOrder(spec.reference?.groups ?? []).flatMap(cluster))
  leaves.push(...(spec.reference?.ui ?? []))
  for (const named of [...(spec.adapters ?? []), ...(spec.companions ?? [])]) {
    leaves.push(
      ...byOrder(named.groups ?? []).flatMap((g) =>
        cluster(g).map((l) => ({ ...l, section: named.name })),
      ),
    )
  }
  leaves.push(...section(spec.explanation))
  return leaves
}

/** The override key for a nav leaf of `axis`: index pages are keyed by their directory. */
export function leafKey(contentPath, axis, file) {
  const clean = file.replace(/\.md$/, '')
  if (clean === 'index') return `${contentPath}/${axis}`
  if (clean.endsWith('/index')) return `${contentPath}/${axis}/${clean.slice(0, -'/index'.length)}`
  return `${contentPath}/${axis}/${clean}.md`
}

/**
 * Overrides for one own-authored axis. `existing(relativePath)` says whether a
 * path exists in the assembled content (so a nav.json entry for a removed page
 * fails loudly instead of becoming a dangling override).
 */
export function axisOverrides({ contentPath, axis, spec, existing }) {
  const overrides = {}
  if (spec.label) overrides[`${contentPath}/${axis}`] = { label: spec.label }

  DIATAXIS_ORDER.forEach((dir, index) => {
    if (existing(`${axis}/${dir}/index.md`))
      overrides[`${contentPath}/${axis}/${dir}`] = { order: index + 1 }
  })

  const missing = []
  navLeaves(spec).forEach((leaf, index) => {
    const clean = leaf.file.replace(/\.md$/, '')
    if (!existing(`${axis}/${clean}.md`)) {
      missing.push(leaf.file)
      return
    }
    const key = leafKey(contentPath, axis, leaf.file)
    // The index page of a named section labels its directory, which becomes
    // the sidebar group: "Moodle Adapter", not the page's own title.
    const isSectionIndex = leaf.section && /(^|\/)index$/.test(clean)
    const label = isSectionIndex ? leaf.section : leaf.label
    overrides[key] = { ...overrides[key], label, order: index + 1 }
  })
  if (missing.length > 0) {
    throw new Error(`${axis}/nav.json lists pages that do not exist: ${missing.join(', ')}`)
  }
  return overrides
}

/** "latest" -> "Latest (0.46.1)"; "0.30.x" -> "0.30.x (0.30.0)". */
export function channelLabel(channel) {
  const name = channel.selector === 'latest' ? 'Latest' : channel.selector
  return `${name} (${channel.version})`
}

/** Overrides for the injected repos: repo label, then one entry per channel in declared order. */
export function channelOverrides({ contentPath, repos }) {
  const overrides = {}
  for (const repo of repos) {
    overrides[`${contentPath}/${repo.repo}`] = { label: repo.label }
    repo.channels.forEach((channel, index) => {
      overrides[`${contentPath}/${repo.repo}/${channel.segment}`] = {
        label: channelLabel(channel),
        order: index + 1,
      }
    })
  }
  return overrides
}

/** Order of the top-level sections, merged over what the other overrides set. */
export function sectionOverrides({ contentPath, existing, base = {} }) {
  const overrides = { ...base }
  SECTION_ORDER.forEach((name, index) => {
    const isFile = name.endsWith('.md')
    if (!existing(isFile ? name : `${name}/index.md`)) return
    const key = `${contentPath}/${name}`
    overrides[key] = { ...overrides[key], order: index + 1 }
  })
  return overrides
}
