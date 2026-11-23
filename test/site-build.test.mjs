/**
 * The pre-build steps of scripts/build-site.mjs over a temporary tree: content
 * assembly, publish guard input, landings, channel frontmatter and navigation.
 * The preset build itself runs in the site build, not here.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { assembleContent, parseChannels, writeIfMissing } from '../scripts/lib/site/content.mjs'
import {
  buildNavigation,
  convertVitepressSyntax,
  firstHeading,
  isSlugSafe,
  prepareChannels,
  writeLandings,
} from '../scripts/build-site.mjs'

let root
let content
let repos

function put(path, text) {
  const abs = join(root, path)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, text)
}

const read = (path) => readFileSync(join(content, path), 'utf8')

before(async () => {
  root = mkdtempSync(join(tmpdir(), 'site-build-'))
  put('docs/index.md', '# Home\n')
  put('docs/.vitepress/config.ts', 'export default {}\n')
  put('docs/libraries/index.md', '# Libraries\n')
  put('docs/libraries/reference/guards.md', '# Guards\n')
  put(
    'docs/libraries/nav.json',
    JSON.stringify({
      label: 'PHP Libraries',
      reference: {
        groups: [
          {
            order: 0,
            files: ['reference/guards'],
            labels: [{ file: 'reference/guards', label: 'Guards' }],
          },
        ],
      },
    }),
  )
  put('docs/injected/lib/latest/index.md', '# Lib\n\n## Setup {#setup}\n')
  put(
    'docs/injected/lib/latest/home.md',
    '---\nlayout: home\nhero:\n  name: Lib Home\n---\n\n## Overview {#overview}\n',
  )
  put('docs/injected/lib/0.30/index.md', '---\ntitle: Old\n---\n# Old\n')
  put('docs/injected/lib/0.30/guide.md', '# Guide\n')
  put('docs/injected/lib/unlisted/index.md', '# Not a declared channel\n')
  put(
    'docs/injected/lib/_channels.json',
    JSON.stringify({
      label: 'Lib',
      defaultSegment: 'latest',
      channels: [
        { selector: 'latest', segment: 'latest', version: '1.2.0' },
        { selector: '0.30.x', segment: '0.30', version: '0.30.4' },
      ],
    }),
  )
  content = join(root, 'site-content')
  repos = await assembleContent({
    docsDir: join(root, 'docs'),
    injectedDir: join(root, 'docs', 'injected'),
    outDir: content,
  })
})

after(() => rmSync(root, { recursive: true, force: true }))

test('assembleContent copies docs and declared channels only', () => {
  assert.deepEqual(
    repos.map((r) => r.repo),
    ['lib'],
  )
  assert.ok(existsSync(join(content, 'index.md')))
  assert.ok(existsSync(join(content, 'libraries/reference/guards.md')))
  assert.ok(existsSync(join(content, 'lib/latest/index.md')))
  assert.ok(existsSync(join(content, 'lib/0.30/guide.md')))
  assert.ok(!existsSync(join(content, '.vitepress')))
  assert.ok(!existsSync(join(content, 'injected')))
  assert.ok(!existsSync(join(content, 'lib/unlisted')))
  assert.ok(!existsSync(join(content, 'lib/_channels.json')))
})

test('parseChannels refuses a segment that could escape the repo folder', () => {
  assert.throws(() => parseChannels('{"channels":[{"segment":"../x"}]}', 'lib'), /invalid/)
  assert.throws(() => parseChannels('not json', 'lib'), /not valid JSON/)
  assert.equal(parseChannels('{"channels":[]}', 'lib').label, 'lib')
})

test('writeLandings creates missing landings with root-absolute channel links', async () => {
  const logs = []
  await writeLandings(content, repos, (m) => logs.push(m))
  assert.equal(
    read('lib/index.md'),
    '# Lib\n\nPublished documentation channels:\n\n- [Latest (1.2.0)](/lib/latest/)\n- [0.30.x (0.30.4)](/lib/0.30/)\n',
  )
  assert.match(read('libraries/reference/index.md'), /- \[Guards\]\(\.\/guards\.md\)/)
  assert.deepEqual(logs, ['landing: /lib/', 'landing: /libraries/reference/'])
  assert.equal(await writeIfMissing(join(content, 'lib/index.md'), 'x'), false)
})

test('prepareChannels hides older channels from search and pins dotted routes', async () => {
  assert.ok(isSlugSafe('latest'))
  assert.ok(!isSlugSafe('0.30'))
  assert.deepEqual(await prepareChannels(content, repos), { hidden: 2, pinned: 2 })
  assert.equal(
    read('lib/0.30/index.md'),
    '---\ntitle: Old\nsearchable: false\nslug: "lib/0.30"\nsocialImage: "/og/lib.png"\n---\n# Old\n',
  )
  assert.match(read('lib/0.30/guide.md'), /slug: "lib\/0\.30\/guide"/)
  assert.doesNotMatch(read('lib/latest/index.md'), /searchable|slug/)
})

test('convertVitepressSyntax rewrites heading ids and home layouts in the assembled tree', async () => {
  assert.deepEqual(await convertVitepressSyntax(content), { headingIds: 2, homePages: 1 })
  assert.match(read('lib/latest/index.md'), /<a id="setup"><\/a>\n\n## Setup\n/)
  assert.equal(read('lib/latest/home.md'), '# Lib Home\n\n<a id="overview"></a>\n\n## Overview\n')
})

test('buildNavigation merges channel, axis and section overrides', async () => {
  const nav = await buildNavigation(content, repos)
  assert.deepEqual(nav['site-content/lib'], { label: 'Lib' }) // not in SECTION_ORDER
  assert.deepEqual(nav['site-content/lib/0.30'], { label: '0.30.x (0.30.4)', order: 2 })
  assert.deepEqual(nav['site-content/libraries'], { label: 'PHP Libraries', order: 2 })
  assert.deepEqual(nav['site-content/libraries/reference/guards.md'], { label: 'Guards', order: 1 })
})

test('firstHeading reads the first H1', () => {
  assert.equal(firstHeading('---\ntitle: x\n---\n\n# MIDDAG Docs\n\n## Sub\n'), 'MIDDAG Docs')
  assert.equal(firstHeading('no heading'), null)
})
