/**
 * End-to-end prebuild run against a local fake docs proxy: an allowlist whose
 * source ships decisions/ must fail the build; the clean allowlist must pass.
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

/** Minimal docs proxy: /{repo}?list=true, /{repo}/{key}; no manifest (404). */
function handle(req, res) {
  const url = new URL(req.url, 'http://localhost')
  const [repo, ...rest] = url.pathname.slice(1).split('/')
  const files = PAYLOAD[repo]
  if (files && rest.length === 0 && url.searchParams.get('list') === 'true') {
    res.setHeader('content-type', 'application/json')
    return res.end(JSON.stringify(Object.keys(files)))
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

function runPrebuild(hubConfig, injectedDir) {
  return new Promise((ok) => {
    const env = {
      ...process.env,
      DOCS_PROXY_BASE_URL: baseUrl,
      DOCS_HUB_CONFIG: join(FIXTURES, hubConfig),
      DOCS_INJECTED_DIR: injectedDir,
    }
    delete env.DOCS_PROXY_TOKEN
    execFile(process.execPath, [SCRIPT], { env }, (err, stdout, stderr) =>
      ok({ code: err ? (err.code ?? 1) : 0, stdout, stderr }),
    )
  })
}

function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'injected-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

test('clean allowlist: prebuild passes and writes the payload', async (t) => {
  const out = tempDir(t)
  const run = await runPrebuild('hub.config.clean.json', out)
  assert.equal(run.code, 0, run.stderr)
  assert.ok(existsSync(join(out, 'lib-clean', 'latest', 'guides', 'usage.md')))
  assert.ok(existsSync(join(out, 'lib-clean', '_channels.json')))
})

test('allowlist with a source shipping decisions/: prebuild fails with diagnostic', async (t) => {
  const out = tempDir(t)
  const run = await runPrebuild('hub.config.with-decisions.json', out)
  assert.notEqual(run.code, 0)
  assert.match(run.stderr, /\[inject\] FAILED: publish guard:/)
  assert.match(run.stderr, /repos\["lib-leaky"\] channel "latest" \(1\.0\.0\)/)
  assert.match(run.stderr, /"docs\/1\.0\.0\/decisions\/0001-use-postgres\.md"/)
  assert.equal(existsSync(join(out, 'lib-leaky')), false, 'nothing of the refused channel written')
})
