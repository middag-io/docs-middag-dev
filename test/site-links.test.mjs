import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  checkLinks,
  extractHrefs,
  extractIds,
  extractOgImages,
  internalTarget,
  pageUrlFor,
} from '../scripts/lib/site/links.mjs'

const ORIGIN = 'https://docs.middag.dev'
let dist

function put(path, text) {
  const abs = join(dist, path)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, text)
}

before(() => {
  dist = mkdtempSync(join(tmpdir(), 'site-links-'))
  put(
    'index.html',
    [
      '<meta property="og:image" content="https://docs.middag.dev/og/index.png">',
      '<a href="/guide/">ok</a>',
      '<a href="/guide#install">ok anchor</a>',
      '<a href="https://docs.middag.dev/guide/#missing">bad anchor</a>',
      '<a href="/nowhere">bad page</a>',
      '<a href="/sitemap.xml">redirected</a>',
      '<a href="https://example.com/x">external</a>',
      '<a href="mailto:a@b.c">mail</a>',
      '<a href="#skip">ignored</a>',
      '<a name="top"></a>',
    ].join('\n'),
  )
  put('og/index.png', '')
  put('guide/index.html', '<h2 id="install">Install</h2><a href="../#top">up</a>')
})

after(() => rmSync(dist, { recursive: true, force: true }))

test('extractHrefs, extractIds and extractOgImages read attributes and decode entities', () => {
  assert.deepEqual(extractHrefs(`<a class="x" href="/a?b=1&amp;c=2">x</a><a href='/b'>`), [
    '/a?b=1&c=2',
    '/b',
  ])
  assert.deepEqual([...extractIds('<h2 id="a">x</h2><a name="b"></a>')], ['a', 'b'])
  assert.deepEqual(extractOgImages('<meta property="og:image" content="/og/x.png">'), ['/og/x.png'])
})

test('internalTarget keeps own-origin and relative links, drops the rest', () => {
  assert.deepEqual(internalTarget('../b/#c', '/a/x/', ORIGIN), { path: '/a/b/', fragment: 'c' })
  assert.deepEqual(internalTarget(`${ORIGIN}/a`, '/', ORIGIN), { path: '/a', fragment: null })
  assert.equal(internalTarget('https://example.com/a', '/', ORIGIN), null)
  assert.equal(internalTarget('//cdn.example.com/a', '/', ORIGIN), null)
  assert.equal(internalTarget('mailto:x@y.z', '/', ORIGIN), null)
})

test('pageUrlFor maps dist files to served URLs', () => {
  assert.equal(pageUrlFor('index.html'), '/')
  assert.equal(pageUrlFor('a/b/index.html'), '/a/b/')
  assert.equal(pageUrlFor('404.html'), '/404.html')
})

test('checkLinks reports missing pages and anchors, honours redirects and ignores', async () => {
  const result = await checkLinks(dist, {
    origin: ORIGIN,
    rules: [{ from: '/sitemap.xml', to: '/sitemap-index.xml', status: 301 }],
    ignore: [{ page: '/', href: '#skip' }],
  })
  assert.equal(result.pages, 2)
  assert.deepEqual(
    result.broken.map((b) => `${b.page} ${b.href} ${b.reason}`),
    ['/ https://docs.middag.dev/guide/#missing no #missing on /guide/', '/ /nowhere no such page'],
  )
})

test('checkLinks reports an og:image that was not built', async () => {
  put('page/index.html', '<meta property="og:image" content="https://docs.middag.dev/og/0.png">')
  try {
    const result = await checkLinks(dist, {
      origin: ORIGIN,
      ignore: [{ page: '/', href: '#skip' }],
    })
    assert.ok(result.broken.some((b) => b.reason === 'og:image not built' && b.page === '/page/'))
  } finally {
    rmSync(join(dist, 'page'), { recursive: true, force: true })
  }
})
