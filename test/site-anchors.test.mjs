import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  addLegacyAnchors,
  headingText,
  preserveLegacyAnchors,
  vitepressSlug,
} from '../scripts/lib/site/anchors.mjs'

test('vitepressSlug matches the VitePress ids of the live site', () => {
  assert.equal(vitepressSlug('1. Check for host leakage'), '_1-check-for-host-leakage')
  assert.equal(vitepressSlug('DI & Events'), 'di-events')
  assert.equal(vitepressSlug("What's here today"), 'what-s-here-today')
  assert.equal(vitepressSlug('0.46.1 (2026-11-19)'), '_0-46-1-2026-11-19')
  assert.equal(
    vitepressSlug('Known OSS boundaries — seams, not bugs'),
    'known-oss-boundaries-—-seams-not-bugs',
  )
  assert.equal(vitepressSlug('Café'), 'cafe')
})

test('headingText drops tags and decodes entities', () => {
  assert.equal(headingText('2. Check for a <code>core</code> import'), '2. Check for a core import')
  assert.equal(headingText('DI &amp; Events &#39;x&#x27;'), "DI & Events 'x'")
})

test('addLegacyAnchors adds only the ids the page lacks, with VitePress suffixes', () => {
  const html = [
    '<h1>Title</h1>',
    '<h2 id="1-check">1. Check</h2>',
    '<h2 id="setup">Setup</h2>',
    '<h3 id="setup-1">Setup</h3>',
    '<h2 id="di--events">DI &amp; Events</h2>',
    '<h3 id="di--events-1">DI &amp; Events</h3>',
  ].join('')
  const result = addLegacyAnchors(html)
  assert.equal(result.added, 3)
  assert.match(result.html, /<a id="_1-check"><\/a><h2 id="1-check">/)
  assert.match(result.html, /<a id="di-events"><\/a><h2 id="di--events">/)
  assert.match(result.html, /<a id="di-events-1"><\/a><h3 id="di--events-1">/)
  assert.doesNotMatch(result.html, /<a id="setup/)
  assert.equal(addLegacyAnchors(result.html).added, 0)
})

test('preserveLegacyAnchors rewrites only the pages that need it', async () => {
  const dist = mkdtempSync(join(tmpdir(), 'site-anchors-'))
  try {
    mkdirSync(join(dist, 'a'))
    writeFileSync(join(dist, 'a', 'index.html'), '<h2 id="1-x">1. X</h2>')
    writeFileSync(join(dist, 'index.html'), '<h2 id="same">Same</h2>')
    writeFileSync(join(dist, 'data.json'), '<h2 id="1-x">1. X</h2>')
    assert.deepEqual(await preserveLegacyAnchors(dist), { pages: 1, anchors: 1 })
    assert.equal(
      readFileSync(join(dist, 'a', 'index.html'), 'utf8'),
      '<a id="_1-x"></a><h2 id="1-x">1. X</h2>',
    )
    assert.equal(readFileSync(join(dist, 'data.json'), 'utf8'), '<h2 id="1-x">1. X</h2>')
  } finally {
    rmSync(dist, { recursive: true, force: true })
  }
})
