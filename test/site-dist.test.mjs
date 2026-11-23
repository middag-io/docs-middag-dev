import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  REDIRECTS,
  checkDist,
  mapSitemapUrls,
  parseRedirects,
  redirectCovers,
  renderRedirects,
  resolveDistPath,
} from '../scripts/lib/site/dist.mjs'

let dist

function put(path, text = '') {
  const abs = join(dist, path)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, text)
}

before(() => {
  dist = mkdtempSync(join(tmpdir(), 'site-dist-'))
  put('index.html', '<h1>MIDDAG Docs</h1>')
  put('about/index.html', '<h1>About</h1>')
  put('middag-react/0.30/cli/index.html', '<h1>CLI</h1>')
  put('pagefind/pagefind.js')
  put('sitemap-index.xml', '<sitemapindex/>')
})

after(() => rmSync(dist, { recursive: true, force: true }))

test('redirects render and parse back, and the sitemap rule is present', () => {
  const text = renderRedirects(REDIRECTS)
  assert.equal(text, '/sitemap.xml /sitemap-index.xml 301\n')
  assert.deepEqual(parseRedirects(`# comment\n\n${text}`), [
    { from: '/sitemap.xml', to: '/sitemap-index.xml', status: 301 },
  ])
  assert.throws(() => renderRedirects([{ from: 'no-slash', to: '/x', status: 301 }]), /invalid/)
})

test('resolveDistPath serves directories, slashless paths and exact files', () => {
  assert.equal(resolveDistPath(dist, '/'), 'index.html')
  assert.equal(resolveDistPath(dist, '/about'), 'about/index.html')
  assert.equal(resolveDistPath(dist, '/about/'), 'about/index.html')
  assert.equal(resolveDistPath(dist, '/middag-react/0.30/cli'), 'middag-react/0.30/cli/index.html')
  assert.equal(resolveDistPath(dist, '/sitemap-index.xml'), 'sitemap-index.xml')
  assert.equal(resolveDistPath(dist, '/missing'), null)
  assert.equal(resolveDistPath(dist, '/../etc/passwd'), null)
})

test('redirectCovers matches with or without a trailing slash', () => {
  assert.ok(redirectCovers(REDIRECTS, '/sitemap.xml'))
  assert.ok(!redirectCovers(REDIRECTS, '/other.xml'))
})

test('mapSitemapUrls maps pages and redirects and lists what is left', () => {
  const urls = [
    'https://docs.middag.dev/',
    'https://docs.middag.dev/about',
    'https://docs.middag.dev/middag-react/0.30/cli',
    'https://docs.middag.dev/sitemap.xml',
    'https://docs.middag.dev/gone',
  ]
  assert.deepEqual(mapSitemapUrls(dist, urls, REDIRECTS), {
    total: 5,
    pages: 3,
    redirected: 1,
    unmapped: ['https://docs.middag.dev/gone'],
  })
})

test('checkDist accepts a good site', async () => {
  assert.deepEqual(await checkDist(dist, { homeHeading: 'MIDDAG Docs' }), [])
})

test('checkDist refuses a template home, a /index/ route, no search and leaked nav data', async () => {
  const bad = mkdtempSync(join(tmpdir(), 'site-dist-bad-'))
  try {
    writeFileSync(join(bad, 'index.html'), '<a href="/welcome">Welcome</a>')
    mkdirSync(join(bad, 'index'))
    mkdirSync(join(bad, 'framework'))
    writeFileSync(join(bad, 'framework', 'nav.json'), '{}')
    const violations = await checkDist(bad, { homeHeading: 'MIDDAG Docs' })
    assert.equal(violations.length, 5, violations.join('\n'))
    assert.match(violations.join('\n'), /does not come from docs\/index\.md/)
    assert.match(violations.join('\n'), /links to \/welcome/)
    assert.match(violations.join('\n'), /dist\/index\/ exists/)
    assert.match(violations.join('\n'), /pagefind/)
    assert.match(violations.join('\n'), /framework\/nav\.json must not be published/)
  } finally {
    rmSync(bad, { recursive: true, force: true })
  }
})

test('the live sitemap snapshot holds 131 unique docs.middag.dev URLs', () => {
  const file = fileURLToPath(new URL('./fixtures/live-sitemap-urls.txt', import.meta.url))
  const urls = readFileSync(file, 'utf8').split('\n').filter(Boolean)
  assert.equal(urls.length, 131)
  assert.equal(new Set(urls).size, 131)
  assert.ok(urls.every((u) => u.startsWith('https://docs.middag.dev/')))
})
