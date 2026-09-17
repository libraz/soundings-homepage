/**
 * The archive's ASCII typesetting, undone where its prose is set.
 *
 * A record is JSON that a script greps and a person reads in a terminal, so the
 * prose inside it is written in ASCII: an em dash is ` -- ` and a sentence the
 * record wants read first is `**like this**`. Neither is what the record says,
 * so both are undone here — where the text is being set — rather than stored
 * some other way. A reader who meets `**` on a page has met the archive's
 * storage format, which is never the answer to anything this site is asked.
 *
 * The paragraphs are not undone: the record separates them with a blank line
 * and `.prose` sets the block `pre-wrap`, so they arrive already.
 */

/** A run of the archive's prose, and whether the record set it apart. */
export interface ProseRun {
  text: string;
  emphasised: boolean;
}

/** An em dash, which the record writes ` -- `. */
export function dashed(sentence: string): string {
  return sentence.replace(/ -- /g, ' — ');
}

/**
 * The prose as runs, for a block that sets it the way the record wrote it.
 *
 * An unpartnered `**` is text and not a marker. The record's prose is quoted,
 * so it is never rewritten here to make a marker pair up.
 */
export function proseRuns(text: string): ProseRun[] {
  const pieces = text.split('**');
  if (pieces.length % 2 === 0) return text ? [{ text, emphasised: false }] : [];
  return pieces
    .map((piece, index) => ({ text: piece, emphasised: index % 2 === 1 }))
    .filter((run) => run.text.length > 0);
}

/**
 * The same prose as plain text, for a heading, a table cell or a search
 * haystack. The markers are dropped rather than shown: emphasis has nowhere to
 * go in a cell, and the record's storage format has nowhere to go at all.
 */
export function plainProse(text: string): string {
  return proseRuns(text)
    .map((run) => run.text)
    .join('');
}
