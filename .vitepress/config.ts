import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitepress';
import units from '../src/data/units.json' with { type: 'json' };
import en from '../src/locales/en.json' with { type: 'json' };
import ja from '../src/locales/ja.json' with { type: 'json' };

const siteUrl = 'https://soundings.libraz.net';
const githubUrl = 'https://github.com/libraz/soundings';

/**
 * The unit the nav can point straight at, or null once there is a choice.
 *
 * Every page below `/units/` belongs to one unit, so a nav entry for one is
 * only meaningful while there is a single unit to mean. With a second in the
 * archive the same entries would send someone reading the MU2000 to the
 * SC-8850's map, so they give way to the index, where a unit gets picked first.
 */
const soleUnit = units.units.length === 1 ? units.units[0].id : null;

/**
 * @param prefix `''` for English at the root, `/ja` for the Japanese tree
 * @param strings that locale's interface copy
 */
function themeConfig(prefix: string, strings: typeof en) {
  const path = (route: string) => `${prefix}${route}`;
  return {
    nav: [
      { text: strings.nav.units, link: path('/units/'), activeMatch: '/units/' },
      ...(soleUnit
        ? [
            { text: strings.nav.map, link: path(`/units/${soleUnit}/map`) },
            { text: strings.nav.tones, link: path(`/units/${soleUnit}/tones`) },
            { text: strings.nav.effects, link: path(`/units/${soleUnit}/effects`) },
            { text: strings.nav.algorithms, link: path(`/units/${soleUnit}/algorithms`) },
            { text: strings.nav.emulator, link: path(`/units/${soleUnit}/emulator`) },
          ]
        : []),
      { text: strings.nav.docs, link: path('/docs/'), activeMatch: '/docs/' },
    ],
    sidebar: {
      [path('/docs/')]: [
        {
          text: strings.nav.docs,
          items: [
            { text: strings.nav.reading, link: path('/docs/') },
            { text: strings.algorithms.methodLink, link: path('/docs/identifying-an-algorithm') },
            { text: strings.nav.glossary, link: path('/docs/glossary') },
          ],
        },
        {
          text: strings.nav.protocol,
          items: [
            { text: strings.nav.protocol, link: path('/docs/protocol/measurement-protocol') },
            { text: strings.nav.addingAUnit, link: path('/docs/protocol/adding-a-unit') },
            { text: strings.nav.completingAUnit, link: path('/docs/protocol/completing-a-unit') },
          ],
        },
      ],
    },
    outline: { level: [2, 3] as [number, number] },
    socialLinks: [{ icon: 'github', link: githubUrl }],
    footer: {
      message: `${strings.common.dataLicense} · ${strings.common.notAffiliated}`,
      copyright: `<a href="${githubUrl}">${strings.common.sourceRepo}</a>`,
    },
    search: { provider: 'local' as const },
    darkModeSwitchLabel: strings.nav.appearance,
    darkModeSwitchTitle: strings.nav.darkMode,
    lightModeSwitchTitle: strings.nav.lightMode,
    returnToTopLabel: strings.nav.returnToTop,
    sidebarMenuLabel: strings.nav.menu,
  };
}

export default defineConfig({
  srcDir: 'src',
  cleanUrls: true,
  lastUpdated: false,
  // The route hash map is otherwise inlined into every page, so a site of n
  // pages carries n copies of a map whose size grows with n. At one unit that
  // is 82% of a block page and 52 MB of the output; the cost is quadratic, so
  // it is the second unit that makes it matter.
  metaChunk: true,
  title: 'soundings',
  description: en.site.description,
  head: [
    ['link', { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    [
      'link',
      {
        rel: 'stylesheet',
        // One family across Latin, kana and monospace, which is what a page of
        // mixed hex, English and Japanese needs to set as one thing.
        href: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans+JP:wght@300;400;500;600&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap',
      },
    ],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: 'soundings' }],
    ['meta', { property: 'og:url', content: siteUrl }],
  ],
  sitemap: { hostname: siteUrl },
  locales: {
    root: {
      label: 'English',
      lang: 'en-US',
      title: 'soundings',
      description: en.site.description,
      themeConfig: themeConfig('', en),
    },
    ja: {
      label: '日本語',
      lang: 'ja-JP',
      title: 'soundings',
      description: ja.site.description,
      themeConfig: themeConfig('/ja', ja as typeof en),
    },
  },
  vite: {
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('../src', import.meta.url)),
        '@theme': fileURLToPath(new URL('./theme', import.meta.url)),
      },
    },
  },
});
