import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  assertChannelPublishable,
  assertPublishable,
  assertTreePublishable,
  forbiddenSegment,
} from '../scripts/lib/publish-guard.mjs'

test('forbiddenSegment matches whole path segments, case-insensitive', () => {
  assert.equal(forbiddenSegment('docs/decisions/0001.md'), 'decisions')
  assert.equal(forbiddenSegment('Internal/spec.md'), 'Internal')
  assert.equal(forbiddenSegment('a/ADR/x.md'), 'ADR')
  assert.equal(forbiddenSegment('a\\madr\\x.md'), 'madr')
  assert.equal(forbiddenSegment('docs/1.0.0/guides/usage.md'), null)
  assert.equal(forbiddenSegment('reference/adr-style-guide.md'), null)
  assert.equal(forbiddenSegment('internals/decisions-log.md'), null)
})

test('assertPublishable names the source and the path', () => {
  assert.doesNotThrow(() => assertPublishable('src', 'guides/usage.md'))
  assert.throws(
    () => assertPublishable('hub.config.json repos["x"]', 'docs/1.0.0/decisions/a.md'),
    /hub\.config\.json repos\["x"\] -> "docs\/1\.0\.0\/decisions\/a\.md" is under "decisions\/"/,
  )
})

test('assertChannelPublishable checks the source key and the destination', () => {
  const base = { repo: 'lib', selector: 'latest', version: '1.0.0', segment: 'latest' }
  assert.doesNotThrow(() => assertChannelPublishable({ ...base, files: ['index.md'] }))
  assert.throws(
    () => assertChannelPublishable({ ...base, files: ['index.md', 'MADR/0002.md'] }),
    /channel "latest" \(1\.0\.0\) -> "docs\/1\.0\.0\/MADR\/0002\.md"/,
  )
  // A repo or segment name alone puts the destination under a forbidden segment.
  assert.throws(
    () => assertChannelPublishable({ ...base, repo: 'internal', files: ['index.md'] }),
    /"injected\/internal\/latest\/index\.md" is under "internal\/"/,
  )
})

function makeTree(files) {
  const dir = mkdtempSync(join(tmpdir(), 'publish-guard-'))
  for (const file of files) {
    mkdirSync(dirname(join(dir, file)), { recursive: true })
    writeFileSync(join(dir, file), '# page\n')
  }
  return dir
}

test('local tree: passes without internal paths, fails with one', (t) => {
  const clean = makeTree(['index.md', 'framework/reference/api.md', 'public/logo.svg'])
  const leaky = makeTree(['index.md', 'framework/decisions/0001-x.md'])
  const skipped = makeTree(['index.md', '.vitepress/cache/internal/x.js'])
  t.after(() => [clean, leaky, skipped].forEach((d) => rmSync(d, { recursive: true })))

  assert.doesNotThrow(() => assertTreePublishable(clean, { source: 'docs/' }))
  assert.throws(
    () => assertTreePublishable(leaky, { source: 'docs/' }),
    /docs\/ -> "framework[/\\]decisions" is under "decisions\/"/,
  )
  assert.doesNotThrow(() => assertTreePublishable(skipped, { skip: ['.vitepress'] }))
})
