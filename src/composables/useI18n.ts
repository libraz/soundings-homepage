import { useData } from 'vitepress';
import { computed } from 'vue';
import en from '../locales/en.json';
import ja from '../locales/ja.json';
import vocabEn from '../locales/vocab.en.json';
import vocabJa from '../locales/vocab.ja.json';

type Strings = typeof en;
type Vocabulary = typeof vocabEn;

const STRINGS: Record<string, Strings> = { en, ja: ja as Strings };
const VOCABULARY: Record<string, Vocabulary> = { en: vocabEn, ja: vocabJa as Vocabulary };

/** `en-US` and `ja-JP` both reduce to the directory the pages live in. */
function toLocale(lang: string): string {
  const base = lang.split('-')[0];
  return base in STRINGS ? base : 'en';
}

/** Walk a dotted key, e.g. `address.powerOn`. */
function lookup(table: unknown, path: string): unknown {
  return path.split('.').reduce<any>((node, key) => (node == null ? undefined : node[key]), table);
}

function interpolate(template: string, values: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key) =>
    key in values ? String(values[key]) : whole,
  );
}

/**
 * Two vocabularies sit side by side on this site: the interface's own words,
 * and the archive's. The first is written here and translated freely; the
 * second is quoted, so a verdict is looked up by the exact wording the record
 * used and never paraphrased into something the measurement did not say.
 *
 * A verdict with no entry is shown as it was written rather than swallowed —
 * `yarn check:vocab` is what catches that before it reaches a page.
 */
export function useI18n() {
  const { lang, site } = useData();
  const locale = computed(() => toLocale(lang.value));
  const strings = computed(() => STRINGS[locale.value]);
  const vocabulary = computed(() => VOCABULARY[locale.value]);

  /** Interface copy. */
  function t(path: string, values: Record<string, unknown> = {}): string {
    const found = lookup(strings.value, path) ?? lookup(STRINGS.en, path);
    if (typeof found !== 'string') return path;
    return interpolate(found, values);
  }

  /** A verdict, as a chip label. */
  function short(wording: string): string {
    const entry = lookup(vocabulary.value, `verdicts.${wording}`) as { short: string } | undefined;
    return entry?.short ?? wording;
  }

  /** A verdict, in the archive's own sentence. */
  function full(wording: string): string {
    const entry = lookup(vocabulary.value, `verdicts.${wording}`) as { full: string } | undefined;
    return entry?.full ?? wording;
  }

  /** A reset outcome code (`R`, `M`, `N`, `D`, `-`). */
  function resetOutcome(code: string): { short: string; full: string } {
    const entry = lookup(vocabulary.value, `resetOutcome.${code}`) as
      | { short: string; full: string }
      | undefined;
    return entry ?? { short: code, full: code };
  }

  /**
   * A stimulus name, which is an identifier and stays as it was written, with
   * its qualifier and its setting rendered in the reader's language around it.
   */
  function stimulus(name: string): string {
    const withMatch = name.match(/^(.+?) with (.+)$/);
    const base = withMatch ? withMatch[1] : name;
    const setting = withMatch ? withMatch[2] : null;
    const qualified = base.match(/^(.+?) \((.+)\)$/);
    const identifier = qualified ? qualified[1] : base;
    const qualifier = qualified
      ? ((lookup(vocabulary.value, `qualifiers.${qualified[2]}`) as string) ?? qualified[2])
      : null;
    const head = qualifier ? `${identifier}（${qualifier}）` : identifier;
    if (!setting) return head;
    const template = (lookup(vocabulary.value, 'under') as string) ?? '{stimulus} with {setting}';
    return interpolate(template, { stimulus: head, setting });
  }

  /**
   * A sentence the archive wrote, rendered in the reader's language when one
   * has been written and in the archive's own words when it has not.
   *
   * These are not interface copy: they are the records speaking, and the site
   * quotes rather than paraphrases them. A translation is a translation of a
   * measurement note, so it is kept in the vocabulary file beside the verdicts
   * and is checked the same way. An untranslated one falls back to the English
   * it was written in rather than disappearing — `yarn check:vocab` lists those.
   */
  function note(sentence: string | null | undefined): string {
    if (!sentence) return '';
    const table = (lookup(vocabulary.value, 'notes') ?? {}) as Record<string, string>;
    return table[sentence] ?? sentence;
  }

  /** Whether `note()` had to fall back to the archive's own language. */
  function noteIsQuoted(sentence: string | null | undefined): boolean {
    if (!sentence) return false;
    if (locale.value === 'en') return false;
    const table = (lookup(vocabulary.value, 'notes') ?? {}) as Record<string, string>;
    return !(sentence in table);
  }

  const base = computed(() => site.value.base);

  /** Prefix a root-relative asset path with the site base. */
  function asset(path: string): string {
    return `${base.value.replace(/\/$/, '')}${path}`;
  }

  /** Prefix a route with the locale directory, so links stay in-language. */
  function route(path: string): string {
    const prefix = locale.value === 'en' ? '' : `/${locale.value}`;
    return asset(`${prefix}${path}`);
  }

  return { locale, t, short, full, note, noteIsQuoted, resetOutcome, stimulus, asset, route };
}
