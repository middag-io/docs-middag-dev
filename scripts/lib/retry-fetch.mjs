/**
 * retry-fetch.mjs — retries transient failures of the prebuild's requests.
 *
 * The prebuild downloads thousands of files (the xref trees). One dropped
 * connection ("fetch failed") or one 502/503/504 from the edge used to fail the
 * whole deploy. `withRetry` wraps a fetch function: a network error or one of
 * those statuses is retried with a linear backoff; anything else (a 404, a
 * 401) is returned at once, so real errors still surface on the first try.
 */
export const RETRY_STATUSES = Object.freeze([502, 503, 504])
export const DEFAULT_ATTEMPTS = 4
export const DEFAULT_BACKOFF_MS = 500

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** A fetch function that retries network errors and RETRY_STATUSES. */
export function withRetry(
  fetchFn,
  { attempts = DEFAULT_ATTEMPTS, backoffMs = DEFAULT_BACKOFF_MS, log = () => {} } = {},
) {
  return async function retryingFetch(input, init) {
    for (let attempt = 1; ; attempt += 1) {
      const isLast = attempt >= attempts
      try {
        const response = await fetchFn(input, init)
        if (isLast || !RETRY_STATUSES.includes(response.status)) return response
        log(`HTTP ${response.status} on ${input}; retry ${attempt}/${attempts - 1}`)
      } catch (error) {
        if (isLast || init?.signal?.aborted) throw error
        log(`${error.message} on ${input}; retry ${attempt}/${attempts - 1}`)
      }
      await sleep(backoffMs * attempt)
    }
  }
}
