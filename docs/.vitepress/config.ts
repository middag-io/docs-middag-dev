import { defineConfig } from 'vitepress'

// ADR-016 §4 — the hub's presentation layer is meant to come from
// @middag-io/docs-theme. That package is still scaffolding (it currently
// exports only `name`, no VitePress preset), so the options below are defined
// locally. When the theme ships a config export, replace the inline options
// with it, e.g.:
//   import { defineHubConfig } from '@middag-io/docs-theme'
//   export default defineHubConfig({ /* hub overrides */ })

// Kept in sync with hub.config.json (middag-react version) — the injected docs
// land at docs/injected/middag-react/{version}/ during `npm run docs:prebuild`.
const MIDDAG_REACT_VERSION = '0.19.0'

export default defineConfig({
  title: 'MIDDAG Docs',
  description:
    'Unified documentation hub for MIDDAG libraries — build-time aggregated via edge storage (ADR-016).',
  lang: 'en',
  cleanUrls: true,
  lastUpdated: true,

  // Serve injected library docs at clean, version-less URLs:
  //   docs/injected/{repo}/{version}/**  ->  /{repo}/**
  // VitePress 1.6.4 resolves the OBJECT form of `rewrites` through path-to-regexp
  // compile(), which substitutes :params (not $1) and URL-encodes a re-emitted
  // multi-segment capture (subdir "/" -> "%2F"). The FUNCTION form sidesteps both
  // and stays fully dynamic for any repo/version listed in hub.config.json.
  rewrites(id) {
    const m = id.match(/^injected\/([^/]+)\/[^/]+\/(.+)$/)
    return m ? `${m[1]}/${m[2]}` : id
  },

  // In-package absolute links are rewritten to /{repo}/… at prebuild time
  // (scripts/fetch-injected-docs.mjs). Dead-link checking stays off: injected
  // payloads may still link to targets outside their own doc set.
  ignoreDeadLinks: true,

  head: [
    ['meta', { name: 'theme-color', content: '#0F172A' }],
    ['meta', { property: 'og:site_name', content: 'MIDDAG Docs' }],
  ],

  themeConfig: {
    siteTitle: 'MIDDAG Docs',
    nav: [
      { text: 'Home', link: '/' },
      { text: 'middag-react', link: '/middag-react/' },
    ],
    sidebar: [
      {
        text: 'Libraries',
        items: [
          {
            text: `middag-react ${MIDDAG_REACT_VERSION}`,
            link: '/middag-react/',
          },
        ],
      },
    ],
    outline: { level: [2, 3] },
    socialLinks: [{ icon: 'github', link: 'https://github.com/middag-io' }],
    footer: { message: 'MIDDAG &copy; 2015-2026' },
    search: { provider: 'local' },
  },
})
