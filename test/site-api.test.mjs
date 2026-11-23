/**
 * The API reference (xref) on the site: assembly of xref-only repos, the
 * channel "API reference" page, the copy to dist/api/ and its light check,
 * and the link check skipping the copied trees.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { assembleContent } from '../scripts/lib/site/content.mjs'
import { apiPage, checkApiDist, copyApiReference, isApiPath } from '../scripts/lib/site/api.mjs'
import { checkLinks } from '../scripts/lib/site/links.mjs'
import { apiPageOverrides, writeApiPages, writeLandings } from '../scripts/build-site.mjs'

const XREF_HTML = '<!doctype html><html><body><a href="/classes/Missing.html">x</a></body></html>\n'

function tempRoot(t) {
  const root = mkdtempSync(join(tmpdir(), 'site-api-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const put = (path, text) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return { root, put }
}

const channels = (list) => JSON.stringify({ label: 'L', defaultSegment: 'latest', channels: list })

async function fixture(t) {
  const { root, put } = tempRoot(t)
  put('docs/index.md', '# Home\n')
  put('docs/injected/both/latest/index.md', '# Both\n')
  put(
    'docs/injected/both/_channels.json',
    channels([
      { selector: 'latest', segment: 'latest', version: '1.0.0', kinds: ['docs', 'xref'] },
    ]),
  )
  put(
    'docs/injected/only/_channels.json',
    channels([{ selector: 'latest', segment: 'latest', version: '2.0.0', kinds: ['xref'] }]),
  )
  put('.xref/both/latest/index.html', XREF_HTML)
  put('.xref/both/latest/classes/Foo.html', '<html>Foo</html>')
  put('.xref/only/latest/index.html', XREF_HTML)
  const content = join(root, 'site-content')
  const repos = await assembleContent({
    docsDir: join(root, 'docs'),
    injectedDir: join(root, 'docs', 'injected'),
    outDir: content,
  })
  return { root, put, content, repos }
}

test('xref-only repo is assembled without pages; its landing links to the API reference', async (t) => {
  const { content, repos } = await fixture(t)
  const only = repos.find((r) => r.repo === 'only')
  assert.deepEqual(only.channels, [])
  assert.equal(only.allChannels.length, 1)
  assert.equal(existsSync(join(content, 'only', 'latest')), false)
  await writeLandings(content, repos, () => {})
  const landing = readFileSync(join(content, 'only', 'index.md'), 'utf8')
  assert.match(landing, /\[API reference: Latest \(2\.0\.0\)\]\(\/api\/only\/latest\/\)/)
})

test('a docs channel that declares xref gets an API reference page and nav entry', async (t) => {
  const { content, repos } = await fixture(t)
  assert.equal(await writeApiPages(content, repos), 1)
  const page = readFileSync(join(content, 'both', 'latest', 'api-reference.md'), 'utf8')
  assert.match(page, /href="\/api\/both\/latest\/"/)
  assert.deepEqual(apiPageOverrides(repos), {
    'site-content/both/latest/api-reference.md': { label: 'API reference', order: 9999 },
  })
  assert.match(apiPage('X', 'r', { segment: '0.30', version: '0.30.1' }), /X 0\.30\.1/)
})

test('copy to dist/api/ is byte for byte and passes the light index check', async (t) => {
  const { root, repos } = await fixture(t)
  const dist = join(root, 'dist')
  mkdirSync(dist)
  const copied = await copyApiReference({ xrefDir: join(root, '.xref'), distDir: dist, repos })
  assert.equal(copied, 2)
  assert.equal(readFileSync(join(dist, 'api/both/latest/index.html'), 'utf8'), XREF_HTML)
  assert.ok(existsSync(join(dist, 'api/both/latest/classes/Foo.html')))
  assert.deepEqual(await checkApiDist(dist, repos), [])
})

test('light check refuses a missing or non-HTML index; copy refuses an unstaged channel', async (t) => {
  const { root, put, repos } = await fixture(t)
  put('dist/api/both/latest/index.html', 'plain text')
  const violations = await checkApiDist(join(root, 'dist'), repos)
  assert.deepEqual(violations, [
    'dist/api/both/latest/index.html is not an HTML page',
    'dist/api/only/latest/index.html is missing',
  ])
  rmSync(join(root, '.xref', 'only'), { recursive: true })
  await assert.rejects(
    copyApiReference({ xrefDir: join(root, '.xref'), distDir: join(root, 'dist'), repos }),
    /API reference only\/latest was not staged/,
  )
})

test('link check skips the API reference pages but checks links into them', async (t) => {
  const { root, put } = tempRoot(t)
  put(
    'dist/index.html',
    '<a href="/api/r/latest/index.html">api</a><a href="/api/r/0.1/index.html">x</a>',
  )
  put('dist/api/r/latest/index.html', XREF_HTML)
  const result = await checkLinks(join(root, 'dist'), {
    origin: 'https://docs.middag.dev',
    skip: isApiPath,
  })
  assert.equal(result.pages, 1)
  assert.deepEqual(
    result.broken.map((b) => b.href),
    ['/api/r/0.1/index.html'],
  )
})
