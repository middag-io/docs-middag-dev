import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  axisOverrides,
  channelLabel,
  channelOverrides,
  leafKey,
  navLeaves,
  sectionOverrides,
} from '../scripts/lib/site/navigation.mjs'

const SPEC = {
  label: 'Framework',
  tutorials: { items: [{ file: 'tutorials/start', label: 'Start' }] },
  howTo: { items: [{ file: 'how-to/task', label: 'Task' }] },
  reference: {
    groups: [
      {
        label: 'B',
        order: 2,
        files: ['reference/b'],
        labels: [{ file: 'reference/b', label: 'Bee' }],
      },
      { label: 'A', order: 1, files: ['reference/a-thing'] },
    ],
    ui: [{ file: 'reference/ui/wire', label: 'Wire' }],
  },
  adapters: [
    {
      name: 'Moodle',
      groups: [
        {
          files: ['reference/adapters/moodle/index'],
          labels: [{ file: 'reference/adapters/moodle/index', label: 'Overview' }],
        },
      ],
    },
  ],
  explanation: { items: [{ file: 'explanation/why', label: 'Why' }] },
}

test('navLeaves keeps the VitePress reading order and falls back to a humanized label', () => {
  assert.deepEqual(
    navLeaves(SPEC).map((l) => `${l.file}=${l.label}${l.section ? ` (${l.section})` : ''}`),
    [
      'tutorials/start=Start',
      'how-to/task=Task',
      'reference/a-thing=A Thing',
      'reference/b=Bee',
      'reference/ui/wire=Wire',
      'reference/adapters/moodle/index=Overview (Moodle)',
      'explanation/why=Why',
    ],
  )
})

test('leafKey keys index pages by their directory', () => {
  assert.equal(leafKey('c', 'fw', 'reference/x'), 'c/fw/reference/x.md')
  assert.equal(
    leafKey('c', 'fw', 'reference/adapters/moodle/index'),
    'c/fw/reference/adapters/moodle',
  )
  assert.equal(leafKey('c', 'fw', 'index'), 'c/fw')
})

test('axisOverrides orders and labels every leaf, plus the Diataxis folders', () => {
  const existing = () => true
  const out = axisOverrides({ contentPath: 'c', axis: 'fw', spec: SPEC, existing })
  assert.deepEqual(out['c/fw'], { label: 'Framework' })
  assert.deepEqual(out['c/fw/tutorials'], { order: 1 })
  assert.deepEqual(out['c/fw/explanation'], { order: 4 })
  assert.deepEqual(out['c/fw/reference/b.md'], { label: 'Bee', order: 4 })
  // The index page of a named section labels the directory with the section name.
  assert.deepEqual(out['c/fw/reference/adapters/moodle'], { label: 'Moodle', order: 6 })
})

test('axisOverrides fails on a nav.json entry whose page does not exist', () => {
  const existing = (path) => !path.endsWith('how-to/task.md')
  assert.throws(
    () => axisOverrides({ contentPath: 'c', axis: 'fw', spec: SPEC, existing }),
    /lists pages that do not exist: how-to\/task/,
  )
})

test('channelOverrides labels the repo and each channel in declared order', () => {
  const repos = [
    {
      repo: 'lib',
      label: 'Lib',
      channels: [
        { selector: 'latest', segment: 'latest', version: '2.0.0' },
        { selector: '1.0.x', segment: '1.0', version: '1.0.3' },
      ],
    },
  ]
  assert.deepEqual(channelOverrides({ contentPath: 'c', repos }), {
    'c/lib': { label: 'Lib' },
    'c/lib/latest': { label: 'Latest (2.0.0)', order: 1 },
    'c/lib/1.0': { label: '1.0.x (1.0.3)', order: 2 },
  })
  assert.equal(channelLabel({ selector: '0.20.x', version: '0.20.0' }), '0.20.x (0.20.0)')
})

test('sectionOverrides orders the existing top-level sections and keeps other keys', () => {
  const existing = (path) => ['framework/index.md', 'about.md'].includes(path)
  const out = sectionOverrides({
    contentPath: 'c',
    existing,
    base: { 'c/framework': { label: 'F' } },
  })
  assert.deepEqual(out, { 'c/framework': { label: 'F', order: 1 }, 'c/about.md': { order: 7 } })
})
