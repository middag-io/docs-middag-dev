/**
 * publish-guard.mjs — refuses internal decision records in the aggregate
 * (docs-middag-ops#66).
 *
 * ADRs/MADRs and other internal material stay in each source repo's
 * `docs/decisions/` or `internal/` tree; this hub never publishes them, in
 * either layer (ADR-020). The guard matches by PATH SEGMENT, case-insensitive:
 * any path with a segment equal to one of FORBIDDEN_SEGMENTS is refused, both
 * where a file comes from (proxy key, local file) and where it would land.
 * "adr-guide.md" or "internals/" do not match; "ADR/" or "x/Decisions/y" do.
 *
 * A refusal throws: the build stops with the source (allowlist entry or local
 * tree) and the offending path in the message. Nothing is skipped silently.
 */
import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

export const FORBIDDEN_SEGMENTS = Object.freeze(['decisions', 'internal', 'adr', 'madr'])

/** The first forbidden segment of a path (as written), or null. */
export function forbiddenSegment(path) {
  const segments = String(path).split(/[/\\]+/)
  return segments.find((s) => FORBIDDEN_SEGMENTS.includes(s.toLowerCase())) ?? null
}

/** Throw if `path` has a forbidden segment; `source` names where it came from. */
export function assertPublishable(source, path) {
  const segment = forbiddenSegment(path)
  if (segment === null) return
  throw new Error(
    `publish guard: ${source} -> "${path}" is under "${segment}/". ` +
      `Paths under ${FORBIDDEN_SEGMENTS.map((s) => `${s}/`).join(', ')} are never ` +
      'aggregated (docs-middag-ops#66). Remove it from the source payload or the allowlist.',
  )
}

/**
 * Check one remote channel before anything is downloaded: every proxy key it
 * would read (`docs/{version}/{file}`) and every destination it would write
 * (`injected/{repo}/{segment}/{file}`).
 */
export function assertChannelPublishable({ repo, selector, version, segment, files }) {
  const source = `hub.config.json repos["${repo}"] channel "${selector}" (${version})`
  for (const file of files) {
    assertPublishable(source, `docs/${version}/${file}`)
    assertPublishable(source, `injected/${repo}/${segment}/${file}`)
  }
}

/** Every file and directory under `dir`, relative to it; skips `skip` names at the top level. */
function walk(dir, skip, base = dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (dir === base && skip.includes(entry.name)) continue
    const abs = join(dir, entry.name)
    out.push(relative(base, abs))
    if (entry.isDirectory()) out.push(...walk(abs, skip, base))
  }
  return out
}

/**
 * Check a local tree VitePress will compile (own-authored axes, public/,
 * injected/). `skip` lists top-level entries that are not content.
 */
export function assertTreePublishable(dir, { source = dir, skip = [] } = {}) {
  for (const path of walk(dir, skip)) assertPublishable(source, path)
}
