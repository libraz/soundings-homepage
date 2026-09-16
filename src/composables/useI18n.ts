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

/**
 * The archive writes its prose in ASCII, and an em dash in it is ` -- `.
 *
 * That is the record's convention and the record keeps it: JSON that a script
 * greps and a person reads in a terminal is better off without characters that
 * depend on the terminal. It is a typographic convention rather than content,
 * so it is undone here, where the text is being set rather than stored.
 */
function dashed(sentence: string): string {
  return sentence.replace(/ -- /g, ' — ');
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

  /**
   * Several of the archive's own words as one run of text.
   *
   * The separator is interface punctuation, not part of any of them, so it is
   * a translated string: an ideographic comma set between English stimulus
   * names reads as a page that forgot which language it was in, which is what
   * a hard-coded one did to every English block page.
   */
  function list(items: readonly string[]): string {
    return items.join(t('common.listSeparator'));
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
    // The brackets are the interface's punctuation and not part of either the
    // identifier or its qualifier, so they are set in the reader's language:
    // fullwidth ones around an English gloss on an English page read as a
    // sentence that changed script halfway through.
    const head = qualifier ? t('common.qualified', { name: identifier, qualifier }) : identifier;
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
    return quoting('notes', sentence).text;
  }

  /** Whether `note()` had to fall back to the archive's own language. */
  function noteIsQuoted(sentence: string | null | undefined): boolean {
    return quoting('notes', sentence).quoted;
  }

  /**
   * A restatement of something a published document says.
   *
   * Written in this project's own words rather than copied, so unlike a
   * measurement note it is ordinary prose and translates freely. It is still
   * looked up by the exact sentence and still falls back to the English it was
   * written in, because a document read after the last translation pass would
   * otherwise vanish from the Japanese page rather than merely arrive in
   * English.
   */
  function stated(sentence: string | null | undefined): string {
    return quoting('documents', sentence).text;
  }

  /** Whether `stated()` had to fall back to the language it was written in. */
  function statedIsQuoted(sentence: string | null | undefined): boolean {
    return quoting('documents', sentence).quoted;
  }

  /**
   * One of the four short statements a claim about an algorithm is read
   * through: what it says, what it is called, what it adds beyond its evidence,
   * and what would show it wrong.
   *
   * Only those four are translated. Everything under them — what an era prior
   * argues, what a gate was for, why a residual leans — is the archive writing
   * in its own voice, revised as the reading goes on, and is shown as written.
   * The page marks where that line falls rather than letting a reader discover
   * it by meeting English halfway down a Japanese page.
   */
  function claimed(sentence: string | null | undefined): string {
    return quoting('inferences', sentence).text;
  }

  /** Whether `claimed()` had to fall back to the language it was written in. */
  function claimedIsQuoted(sentence: string | null | undefined): boolean {
    return quoting('inferences', sentence).quoted;
  }

  /**
   * A sentence the archive wrote that this site never translates.
   *
   * The dashes are still undone, because that is typesetting rather than
   * content, and nothing else is touched.
   */
  function verbatim(sentence: string | null | undefined): string {
    return sentence ? dashed(sentence) : '';
  }

  function quoting(bucket: string, sentence: string | null | undefined) {
    if (!sentence) return { text: '', quoted: false };
    const table = (lookup(vocabulary.value, bucket) ?? {}) as Record<string, string>;
    const found = table[sentence];
    return {
      text: dashed(found ?? sentence),
      quoted: locale.value !== 'en' && found === undefined,
    };
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

  return {
    locale,
    t,
    list,
    short,
    full,
    note,
    noteIsQuoted,
    stated,
    statedIsQuoted,
    claimed,
    claimedIsQuoted,
    verbatim,
    resetOutcome,
    stimulus,
    asset,
    route,
  };
}
