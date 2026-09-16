import { addClassToHast, createHighlighter } from 'shiki';

/**
 * A generated code example, highlighted the way every other code block on this
 * site is highlighted.
 *
 * The docs pages get theirs from VitePress, which runs Shiki over a markdown
 * fence with the `github-light` / `github-dark` pair and leaves the two colours
 * on each span as custom properties for a global rule to choose between. A code
 * example on a claim page is the same thing in a different container, so it is
 * produced the same way rather than by a second highlighter written here: two
 * call sites doing one job have to look the same, and a hand-rolled palette
 * beside VitePress's would be visibly not it.
 *
 * Run at sync time rather than in the browser. The examples are generated, so
 * they change only when the archive does, and highlighting them here keeps the
 * highlighter out of the bundle a reader downloads.
 */

/** The pair VitePress's own `vp-adaptive-theme` blocks are built with. */
const THEMES = { light: 'github-light', dark: 'github-dark' };

/** @returns {Promise<{ cpp: (code: string) => string }>} */
export async function highlighter() {
  const shiki = await createHighlighter({
    themes: Object.values(THEMES),
    langs: ['cpp'],
  });

  return {
    /** @param {string} code @returns {string} */
    cpp(code) {
      // `defaultColor: false` is what leaves both themes on the span instead of
      // baking one in. Without it the block is legible in one appearance and
      // near-invisible in the other, which is how a code block on a dark panel
      // came out white on white.
      return shiki.codeToHtml(code, {
        lang: 'cpp',
        themes: THEMES,
        defaultColor: false,
        transformers: [
          {
            // The class VitePress's own global rules select on to choose
            // between the two themes. Shiki does not add it — VitePress does,
            // in its markdown plugin — so without it every span keeps both
            // colours as custom properties and none of them is ever read, which
            // renders as a block in one flat colour.
            pre(node) {
              addClassToHast(node, 'vp-code');
            },
          },
        ],
      });
    },
  };
}
