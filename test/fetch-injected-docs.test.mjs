/**
 * End-to-end prebuild runs against a local fake docs proxy that answers the
 * requests @middag-io/docs-proxy-client makes: manifest (404 here), repo
 * listings scoped by `prefix=`, artifact listings relative to
 * /{repo}/{kind}/{version}/, and single files.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url))
const SCRIPT = fileURLToPath(new URL('../scripts/fetch-injected-docs.mjs', import.meta.url))
const PAYLOAD = JSON.parse(readFileSync(join(FIXTURES, 'proxy-payload.json'), 'utf8'))

let server
let baseUrl
let requests = 0

function json(res, body) {
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(body))
}

function handle(req, res) {
  requests += 1
  const url = new URL(req.url, 'http://localhost')
  const [repo, ...rest] = url.pathname.slice(1).split('/')
  const files = PAYLOAD[repo]
  const keys = Object.keys(files ?? {})
  if (files && url.searchParams.get('list') === 'true') {
    if (rest.length === 0) {
      const prefix = url.searchParams.get('prefix') ?? ''
      return json(
        res,
        keys.filter((k) => k.startsWith(prefix)),
      )
    }
    const base = `${rest.filter(Boolean).join('/')}/`
    return json(
      res,
      keys.filter((k) => k.startsWith(base)).map((k) => k.slice(base.length)),
    )
  }
  const body = files?.[rest.join('/')]
  if (body === undefined) {
    res.statusCode = 404
    return res.end()
  }
  res.end(body)
}

before(async () => {
  server = createServer(handle)
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(() => server.close())

function runPrebuild(hubConfig, dir, extraEnv = {}) {
  return new Promise((ok) => {
    const env = {
      ...process.env,
      DOCS_PROXY_BASE_URL: baseUrl,
      DOCS_HUB_CONFIG: join(FIXTURES, hubConfig),
      DOCS_INJECTED_DIR: join(dir, 'injected'),
      DOCS_XREF_DIR: join(dir, 'xref'),
    }
    delete env.DOCS_PROXY_TOKEN
    Object.assign(env, extraEnv)
    execFile(process.execPath, [SCRIPT], { env }, (err, stdout, stderr) =>
      ok({ code: err ? (err.code ?? 1) : 0, stdout, stderr }),
    )
  })
}

function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'prebuild-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

test('clean allowlist: prebuild passes and writes the docs payload with links rewritten', async (t) => {
  const out = tempDir(t)
  const run = await runPrebuild('hub.config.clean.json', out)
  assert.equal(run.code, 0, run.stderr)
  assert.ok(existsSync(join(out, 'injected', 'lib-clean', 'latest', 'guides', 'usage.md')))
  const index = readFileSync(join(out, 'injected', 'lib-clean', 'latest', 'index.md'), 'utf8')
  assert.match(index, /\]\(\/lib-clean\/latest\/guides\/usage\)/)
  const channels = JSON.parse(readFileSync(join(out, 'injected', 'lib-clean', '_channels.json')))
  assert.deepEqual(channels.channels[0].kinds, ['docs'])
})

test('a kind the repo does not declare is never fetched', async (t) => {
  const out = tempDir(t)
  const run = await runPrebuild('hub.config.clean.json', out)
  assert.equal(run.code, 0, run.stderr)
  assert.equal(existsSync(join(out, 'xref')), false, 'xref is published by the proxy, not declared')
})

test('a kind outside docs and xref is refused before any request', async (t) => {
  const out = tempDir(t)
  const before = requests
  const run = await runPrebuild('hub.config.schemas.json', out)
  assert.notEqual(run.code, 0)
  assert.match(run.stderr, /kind "schemas" is not published by this hub/)
  assert.equal(requests, before)
})

test('declared xref is staged byte for byte, HTML not rewritten; xref-only repos have no docs', async (t) => {
  const out = tempDir(t)
  const run = await runPrebuild('hub.config.xref.json', out)
  assert.equal(run.code, 0, run.stderr)
  const index = join(out, 'xref', 'lib-clean', 'latest', 'index.html')
  assert.equal(readFileSync(index, 'utf8'), PAYLOAD['lib-clean']['xref/1.0.0/index.html'])
  assert.ok(existsSync(join(out, 'xref', 'lib-clean', 'latest', 'classes', 'Foo.html')))
  assert.equal(
    readFileSync(join(out, 'xref', 'lib-xref-only', 'latest', 'index.html'), 'utf8'),
    PAYLOAD['lib-xref-only']['xref/2.1.0/index.html'],
  )
  assert.equal(existsSync(join(out, 'injected', 'lib-xref-only', 'latest')), false)
  const only = JSON.parse(readFileSync(join(out, 'injected', 'lib-xref-only', '_channels.json')))
  assert.deepEqual(only.channels, [
    { selector: 'latest', segment: 'latest', version: '2.1.0', kinds: ['xref'] },
  ])
})

test('allowlist with a source shipping decisions/: prebuild fails with diagnostic', async (t) => {
  const out = tempDir(t)
  const run = await runPrebuild('hub.config.with-decisions.json', out)
  assert.notEqual(run.code, 0)
  assert.match(run.stderr, /\[inject\] FAILED: publish guard:/)
  assert.match(run.stderr, /repos\["lib-leaky"\] channel "latest" \(1\.0\.0\)/)
  assert.match(run.stderr, /"docs\/1\.0\.0\/decisions\/0001-use-postgres\.md"/)
  assert.equal(
    existsSync(join(out, 'injected', 'lib-leaky')),
    false,
    'nothing of the refused channel written',
  )
})

test('public build: DOCS_PROXY_TOKEN set fails before any request', async (t) => {
  const out = tempDir(t)
  const before = requests
  const run = await runPrebuild('hub.config.clean.json', out, { DOCS_PROXY_TOKEN: 'not-a-secret' })
  assert.notEqual(run.code, 0)
  assert.match(run.stderr, /public target guard: a proxy token is set/)
  assert.equal(requests, before, 'the proxy saw no request')
  assert.equal(existsSync(join(out, 'injected')), false)
})

test('public build: a non-public, non-loopback proxy is refused', async (t) => {
  const out = tempDir(t)
  const run = await runPrebuild('hub.config.clean.json', out, {
    DOCS_PROXY_BASE_URL: 'https://docs-proxy.middag.io',
  })
  assert.notEqual(run.code, 0)
  assert.match(run.stderr, /public target guard: https:\/\/docs-proxy\.middag\.io is not a public/)
})
