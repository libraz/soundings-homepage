/**
 * Sort every wording the archive used into the buckets the locale files are
 * organised by, so a translator sees seventeen stimulus names rather than the
 * fifty-odd strings those names appear inside.
 *
 * A stimulus is named three ways in the archive:
 *
 *   struck                                  the note on its own
 *   struck_moved (balance)                  the same note, read a different way
 *   struck_pressed with 40 20 32 = 7F       the same note under a setting
 *
 * Only the base name and the qualifier need translating; the address and the
 * value in the third form are the same in every language.
 */

const WITH = /^(.+?) with (.+)$/;
const QUALIFIED = /^(.+?) \((.+)\)$/;

/** @param {string} word @returns {{base: string, qualifier: string|null, under: string|null}} */
export function parseStimulus(word) {
  let rest = word;
  let under = null;
  const withMatch = rest.match(WITH);
  if (withMatch) {
    rest = withMatch[1];
    under = withMatch[2];
  }
  const qualified = rest.match(QUALIFIED);
  if (qualified) return { base: qualified[1], qualifier: qualified[2], under };
  return { base: rest, qualifier: null, under };
}

/**
 * @param {Iterable<string>} words
 * @param {any} legend
 */
export function classifyVocabulary(words, legend) {
  const verdictPhrases = new Set(
    Object.values(legend)
      .filter((value) => value && typeof value === 'object')
      .flatMap((table) => Object.values(table)),
  );

  const verdicts = new Set();
  const stimuli = new Set();
  const qualifiers = new Set();

  for (const word of words) {
    if (verdictPhrases.has(word)) {
      verdicts.add(word);
      continue;
    }
    const parsed = parseStimulus(word);
    stimuli.add(parsed.base);
    if (parsed.qualifier) qualifiers.add(parsed.qualifier);
  }

  return {
    verdicts: [...verdicts].sort(),
    stimuli: [...stimuli].sort(),
    qualifiers: [...qualifiers].sort(),
  };
}
