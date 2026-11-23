import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  convertHeadingIds,
  convertHomeLayout,
  escapeLinkText,
  landingPage,
  routeSlug,
  setFrontmatterKey,
} from '../scripts/lib/site/markdown.mjs'

test('setFrontmatterKey adds a frontmatter block when there is none', () => {
  const out = setFrontmatterKey('# Title\n', 'searchable', false)
  assert.equal(out, '---\nsearchable: false\n---\n\n# Title\n')
})

test('setFrontmatterKey appends to an existing block and keeps the body', () => {
  const input = '---\ntitle: X\n---\n# X\n'
  assert.equal(
    setFrontmatterKey(input, 'slug', 'a/0.30/b'),
    '---\ntitle: X\nslug: "a/0.30/b"\n---\n# X\n',
  )
})

test('setFrontmatterKey replaces an existing value', () => {
  const input = '---\nsearchable: true\n---\nbody\n'
  assert.equal(setFrontmatterKey(input, 'searchable', false), '---\nsearchable: false\n---\nbody\n')
})

test('setFrontmatterKey rejects a key that is not a plain identifier', () => {
  assert.throws(() => setFrontmatterKey('', 'bad key', 1), /invalid frontmatter key/)
})

test('convertHeadingIds moves an explicit id to a standalone anchor', () => {
  const { text, count } = convertHeadingIds(
    '## GitHub Packages (with source) {#github-packages}\n\nBody\n',
  )
  assert.equal(count, 1)
  assert.equal(text, '<a id="github-packages"></a>\n\n## GitHub Packages (with source)\n\nBody\n')
})

test('convertHeadingIds leaves fenced code and plain headings alone', () => {
  const input = '```md\n## In code {#kept}\n```\n\n## Plain\n~~~~\n# x {#also-kept}\n~~~~\n'
  const { text, count } = convertHeadingIds(input)
  assert.equal(count, 0)
  assert.equal(text, input)
})

test('routeSlug strips the extension and a trailing index', () => {
  assert.equal(routeSlug('middag-react/0.30/guides/forms.md'), 'middag-react/0.30/guides/forms')
  assert.equal(routeSlug('middag-react/0.30/index.md'), 'middag-react/0.30')
  assert.equal(routeSlug('index.md'), '')
})

test('landingPage renders a title, an intro and escaped links', () => {
  const page = landingPage({
    title: 'Repo',
    intro: 'Channels:',
    links: [{ label: 'Latest [1.0]', href: '/repo/latest/' }],
  })
  assert.equal(page, '# Repo\n\nChannels:\n\n- [Latest \\[1.0\\]](/repo/latest/)\n')
  assert.equal(escapeLinkText('a\\b'), 'a\\\\b')
})

test('convertHomeLayout turns hero and features into Markdown and keeps other keys', () => {
  const input = [
    '---',
    'layout: home',
    'description: Short',
    'hero:',
    '  name: Lib',
    '  text: Components',
    '  tagline: Contract driven.',
    '  actions:',
    '    - theme: brand',
    '      text: Get Started',
    '      link: /lib/latest/getting-started',
    'features:',
    '  - title: Typed',
    '    details: Full types.',
    '  - title: Docs',
    '    link: /lib/latest/',
    '---',
    '',
    '## Overview',
    '',
  ].join('\n')
  const { text, converted } = convertHomeLayout(input)
  assert.ok(converted)
  assert.equal(
    text,
    [
      '---',
      'description: Short',
      '---',
      '',
      '# Lib',
      '',
      '**Components**',
      '',
      'Contract driven.',
      '',
      '- [Get Started](/lib/latest/getting-started)',
      '',
      '- **Typed**: Full types.',
      '- **[Docs](/lib/latest/)**',
      '',
      '## Overview',
      '',
    ].join('\n'),
  )
})

test('convertHomeLayout leaves other pages alone', () => {
  for (const input of ['# Plain\n', '---\ntitle: X\n---\n# X\n', '---\n: bad: yaml: [\n---\n']) {
    assert.deepEqual(convertHomeLayout(input), { text: input, converted: false })
  }
})
