/**
 * git-dates.mjs — "last updated" dates for the own-authored pages.
 *
 * The preset reads a page's date from the git history of its source file, but
 * the site is built from site-content/, a gitignored copy. This module reads
 * the dates of docs/ once from git and stamps them as `lastUpdated`
 * frontmatter on the copies; an explicit `lastUpdated` in the source wins.
 * Without history (shallow clone, no git) nothing is stamped and the preset
 * hides the field.
 */
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { setFrontmatterKey } from './markdown.mjs'

const run = promisify(execFile)
const MARKER = '@@'
const FRONTMATTER_KEY = /^---\r?\n[\s\S]*?^lastUpdated:/m

/**
 * Parse `git log --format=@@%cI --name-only` output into a Map of
 * path (relative to `prefix`) -> ISO date of its newest commit.
 */
export function parseGitLog(output, prefix) {
  const dates = new Map()
  let current = null
  for (const line of output.split('\n')) {
    if (line.startsWith(MARKER)) {
      current = line.slice(MARKER.length).trim()
      continue
    }
    const path = line.trim()
    if (!current || !path.startsWith(prefix) || !path.endsWith('.md')) continue
    const rel = path.slice(prefix.length)
    if (!dates.has(rel)) dates.set(rel, current)
  }
  return dates
}

/** Dates of every Markdown file under `docs/` that git knows; empty without history. */
export async function readDocDates(root, docsPath = 'docs') {
  try {
    const { stdout } = await run(
      'git',
      ['log', `--format=${MARKER}%cI`, '--name-only', '--', docsPath],
      { cwd: root, maxBuffer: 64 * 1024 * 1024 },
    )
    return parseGitLog(stdout, `${docsPath}/`)
  } catch {
    return new Map()
  }
}

/** Stamp `lastUpdated` on the copies in contentDir. Returns the number stamped. */
export async function stampLastUpdated(contentDir, dates) {
  let stamped = 0
  for (const [rel, date] of dates) {
    const path = join(contentDir, rel)
    if (!existsSync(path)) continue
    const text = await readFile(path, 'utf8')
    if (FRONTMATTER_KEY.test(text)) continue
    await writeFile(path, setFrontmatterKey(text, 'lastUpdated', date))
    stamped += 1
  }
  return stamped
}
