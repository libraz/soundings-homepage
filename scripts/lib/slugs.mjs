/**
 * Slugs for claim pages, resolved by the precedence the design settled on: a
 * hand-authored override first, then a derivation from the printed name the
 * claim is about, and only then the archive's own claim id.
 *
 * The archive names nothing itself (CLAUDE.md: "A printed name is a statement
 * a document makes … The archive names nothing itself and must not start"),
 * so a slug this module derives is always built from a document's printed
 * wording, never invented. A claim this module cannot slug is not an error
 * here — it never throws — because a page must always be produced; the
 * caller decides whether to warn (`yarn sync`) or fail (`check:algorithms`)
 * on the `underived` flag this returns.
 */

const DASH_CHARS = /[→←·—–\s/.,]/g;
const NON_SLUG_CHARS = /[^a-z0-9-]/g;
const REPEATED_DASHES = /-+/g;
const EDGE_DASHES = /^-+|-+$/g;

/**
 * Fold a printed name into a URL path segment.
 *
 * NFKD before lowercasing so an accented letter's combining mark falls out
 * with every other non-ASCII character in the same pass, rather than needing
 * its own rule. A leading digit is left alone.
 * @param {string} text
 * @returns {string}
 */
export function slugify(text) {
  const folded = text
    .normalize('NFKD')
    .toLowerCase()
    .replace(DASH_CHARS, '-')
    .replace(NON_SLUG_CHARS, '');
  return folded.replace(REPEATED_DASHES, '-').replace(EDGE_DASHES, '');
}

/**
 * Derive a slug from a claim's printed title, or say why it cannot.
 *
 * Naming a few of a type's parameters would assert the claim is about only
 * those few, so the parameters are used only when `titleOf()` already
 * decided the claim names every parameter its type prints (`parametersMore
 * === 0`); otherwise the type name stands alone.
 * @param {string} id the archive claim id, used as the fallback slug
 * @param {{names: {name: string}[], more: number, parameters: {name: string}[], parametersMore: number} | null} title from `titleOf()`, or null for a claim no document reaches
 * @param {Record<string, string>} slugs the hand-authored `src/data/slugs.json`, keyed by claim id
 * @returns {{slug: string, underived: boolean}}
 */
export function resolveSlug(id, title, slugs) {
  const manual = slugs[id];
  if (manual) return { slug: manual, underived: false };

  if (title && title.names.length === 1 && title.more === 0) {
    const segments = [title.names[0].name];
    if (title.parametersMore === 0) {
      for (const parameter of title.parameters) segments.push(parameter.name);
    }
    return { slug: segments.map(slugify).join('-'), underived: false };
  }

  return { slug: id, underived: true };
}

/**
 * Slugs that collide within one unit.
 *
 * Uniqueness is per-unit — the route is `/units/<unit>/algorithms/<slug>` —
 * so the same slug on two different units is not a collision and is not this
 * function's business; the caller passes it one unit's claims at a time.
 * @param {{id: string, slug: string}[]} entries every claim in one unit
 * @returns {{slug: string, ids: string[]}[]} groups sharing a slug, more than one id each
 */
export function collisionsWithin(entries) {
  const bySlug = new Map();
  for (const { id, slug } of entries) {
    const group = bySlug.get(slug) ?? [];
    group.push(id);
    bySlug.set(slug, group);
  }
  return [...bySlug.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([slug, ids]) => ({ slug, ids }));
}
