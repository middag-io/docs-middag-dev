import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { parseGitLog, stampLastUpdated } from '../scripts/lib/site/git-dates.mjs'

test('parseGitLog keeps the newest date per docs/ Markdown file', () => {
  const log = [
    '@@2026-11-23T10:00:00-03:00',
    '',
    'docs/a.md',
    'README.md',
    '@@2026-11-20T10:00:00-03:00',
    '',
    'docs/a.md',
    'docs/sub/b.md',
    'docs/nav.json',
  ].join('\n')
  const dates = parseGitLog(log, 'docs/')
  assert.deepEqual(
    [...dates],
    [
      ['a.md', '2026-11-23T10:00:00-03:00'],
      ['sub/b.md', '2026-11-20T10:00:00-03:00'],
    ],
  )
})

test('stampLastUpdated adds the date and keeps an explicit lastUpdated', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'git-dates-'))
  writeFileSync(join(dir, 'a.md'), "---\ntitle: 'A'\n---\n\n# A\n")
  writeFileSync(join(dir, 'b.md'), "---\ntitle: 'B'\nlastUpdated: '2020-01-01'\n---\n\n# B\n")
  const dates = new Map([
    ['a.md', '2026-11-23T10:00:00-03:00'],
    ['b.md', '2026-11-23T10:00:00-03:00'],
    ['gone.md', '2026-11-23T10:00:00-03:00'],
  ])
  assert.equal(await stampLastUpdated(dir, dates), 1)
  assert.match(readFileSync(join(dir, 'a.md'), 'utf8'), /lastUpdated: "2026-11-23T10:00:00-03:00"/)
  assert.match(readFileSync(join(dir, 'b.md'), 'utf8'), /lastUpdated: '2020-01-01'/)
})
