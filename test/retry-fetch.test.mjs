import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withRetry } from '../scripts/lib/retry-fetch.mjs'

const response = (status) => ({ status, ok: status < 400 })

function scripted(outcomes) {
  const calls = []
  const fn = async (input) => {
    calls.push(input)
    const next = outcomes[Math.min(calls.length, outcomes.length) - 1]
    if (next instanceof Error) throw next
    return response(next)
  }
  return { fn, calls }
}

test('retries a network error, then returns the response', async () => {
  const { fn, calls } = scripted([new TypeError('fetch failed'), 200])
  const res = await withRetry(fn, { backoffMs: 0 })('u')
  assert.equal(res.status, 200)
  assert.equal(calls.length, 2)
})

test('retries 502/503/504 but returns a 404 at once', async () => {
  const flaky = scripted([503, 502, 200])
  assert.equal((await withRetry(flaky.fn, { backoffMs: 0 })('u')).status, 200)
  assert.equal(flaky.calls.length, 3)
  const missing = scripted([404])
  assert.equal((await withRetry(missing.fn, { backoffMs: 0 })('u')).status, 404)
  assert.equal(missing.calls.length, 1)
})

test('gives up after the last attempt with the last error or status', async () => {
  const down = scripted([new TypeError('fetch failed')])
  await assert.rejects(withRetry(down.fn, { attempts: 3, backoffMs: 0 })('u'), /fetch failed/)
  assert.equal(down.calls.length, 3)
  const gateway = scripted([504])
  assert.equal((await withRetry(gateway.fn, { attempts: 2, backoffMs: 0 })('u')).status, 504)
  assert.equal(gateway.calls.length, 2)
})
