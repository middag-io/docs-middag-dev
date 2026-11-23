/**
 * content.mjs — assembles the Nimbus content source from the two layers.
 *
 * The own-authored tree (docs/) and the injected channels
 * (docs/injected/{repo}/{segment}/) are copied into one generated folder that
 * the preset mounts at the site root, so every page keeps the URL it had:
 * docs/framework/x.md -> /framework/x/, injected/middag-react/latest/y.md ->
 * /middag-react/latest/y/. The generated folder is disposable and gitignored.
 */
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { hasKind } from './api.mjs'

/** Top-level entries of docs/ that are not own-authored content. */
export const NON_CONTENT_DIRS = Object.freeze(['.vitepress', 'injected', 'public'])

/** The name of the channel manifest the prebuild writes next to each repo's channels. */
export const CHANNELS_FILE = '_channels.json'

/**
 * Copy docs/ (minus NON_CONTENT_DIRS) and every injected docs channel into
 * `outDir`. Returns the injected repos with their parsed channel manifests:
 * `channels` holds the channels that carry docs (the ones with pages),
 * `allChannels` every resolved channel, xref-only ones included.
 */
export async function assembleContent({ docsDir, injectedDir, outDir }) {
  await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })

  for (const entry of await readdir(docsDir, { withFileTypes: true })) {
    if (NON_CONTENT_DIRS.includes(entry.name)) continue
    await cp(join(docsDir, entry.name), join(outDir, entry.name), { recursive: true })
  }

  const repos = []
  if (!existsSync(injectedDir)) return repos

  for (const entry of await readdir(injectedDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const manifestPath = join(injectedDir, entry.name, CHANNELS_FILE)
    if (!existsSync(manifestPath)) continue
    const manifest = parseChannels(await readFile(manifestPath, 'utf8'), entry.name)
    const docsChannels = manifest.channels.filter((channel) => hasKind(channel, 'docs'))
    for (const channel of docsChannels) {
      await cp(
        join(injectedDir, entry.name, channel.segment),
        join(outDir, entry.name, channel.segment),
        { recursive: true },
      )
    }
    repos.push({
      repo: entry.name,
      ...manifest,
      channels: docsChannels,
      allChannels: manifest.channels,
    })
  }

  return repos.sort((a, b) => a.repo.localeCompare(b.repo))
}

/** Parse and validate one `_channels.json`. */
export function parseChannels(text, repo) {
  let data
  try {
    data = JSON.parse(text)
  } catch (error) {
    throw new Error(`${repo}/${CHANNELS_FILE} is not valid JSON: ${error.message}`)
  }
  const channels = Array.isArray(data?.channels) ? data.channels : []
  for (const channel of channels) {
    if (typeof channel?.segment !== 'string' || !/^[A-Za-z0-9._-]+$/.test(channel.segment)) {
      throw new Error(
        `${repo}/${CHANNELS_FILE}: channel segment ${JSON.stringify(channel?.segment)} is invalid`,
      )
    }
  }
  return {
    label: typeof data?.label === 'string' ? data.label : repo,
    defaultSegment: data?.defaultSegment ?? channels[0]?.segment ?? null,
    channels,
  }
}

/** Write `text` to `path` only when no file is there yet. Returns true when written. */
export async function writeIfMissing(path, text) {
  if (existsSync(path)) return false
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, text, 'utf8')
  return true
}
