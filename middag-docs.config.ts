// Nimbus site configuration for docs.middag.dev.
//
// The content source is `site-content/`, a disposable folder that
// scripts/build-site.mjs assembles from docs/ and the injected channels, then
// mounts at the site root so every page keeps its URL. The same script writes
// `site-navigation.json` (order and labels from each axis's nav.json and from
// the channel manifests) before the preset loads this file. Neither file is
// committed. Run the build through `npm run site:build`, not `middag-docs
// build` directly.
import { existsSync, readFileSync } from 'node:fs'
import { defineMiddagDocsConfig } from '@middag-io/nimbus-preset/config'

const NAVIGATION_FILE = new URL('./site-navigation.json', import.meta.url)

const overrides = existsSync(NAVIGATION_FILE)
  ? JSON.parse(readFileSync(NAVIGATION_FILE, 'utf8'))
  : {}

export default defineMiddagDocsConfig({
  title: 'MIDDAG Docs',
  description:
    'Developer documentation for MIDDAG: the MIDDAG Framework, its host adapters, the PHP library family and middag-react.',
  site: 'https://docs.middag.dev',
  github: 'https://github.com/middag-io/docs-middag-dev',
  locale: 'en',
  content: [{ path: 'site-content', routePrefix: '' }],
  // Navigation data and channel manifests are build inputs, never public files.
  exclude: ['nav.json', '_channels.json'],
  navigation: { overrides },
  outDir: 'dist',
  search: true,
  strict: true,
})
