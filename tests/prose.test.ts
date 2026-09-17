import { describe, expect, it } from 'vitest';
import { dashed, plainProse, proseRuns } from '../src/composables/prose';

/**
 * The archive's ASCII typesetting, undone where its prose is set.
 *
 * The records are written to be grepped and read in a terminal, so what a page
 * gets is the storage format: ` -- ` for an em dash and `**like this**` for the
 * sentence the record wants read first. A reader who meets either on a page has
 * met the format rather than the measurement, which is the whole of what these
 * two functions are for — and the paragraphs are left alone, because the block
 * that carries them is set `pre-wrap`.
 */

describe('an em dash the record wrote in ASCII', () => {
  it('is set as one', () => {
    expect(dashed('a corner -- and where it sits')).toBe('a corner — and where it sits');
  });

  it('leaves a hyphenated range alone', () => {
    expect(dashed('Lo-Fi Type 1 - 6 - 9')).toBe('Lo-Fi Type 1 - 6 - 9');
  });
});

describe('the sentence a record sets apart', () => {
  it('comes back as its own run', () => {
    expect(proseRuns('**What the low field does.** Read with the filters parked.')).toEqual([
      { text: 'What the low field does.', emphasised: true },
      { text: ' Read with the filters parked.', emphasised: false },
    ]);
  });

  it('is found in the middle of a paragraph as well as at its head', () => {
    expect(proseRuns('One. **Two.** Three.').map((run) => run.emphasised)).toEqual([
      false,
      true,
      false,
    ]);
  });

  it('keeps the paragraphs, which the block sets rather than this', () => {
    expect(proseRuns('One.\n\n**Two.**')).toEqual([
      { text: 'One.\n\n', emphasised: false },
      { text: 'Two.', emphasised: true },
    ]);
  });
});

describe('prose with no emphasis in it', () => {
  it('is one run', () => {
    expect(proseRuns('A byte, and what it did.')).toEqual([
      { text: 'A byte, and what it did.', emphasised: false },
    ]);
  });

  it('is nothing at all when the record said nothing', () => {
    expect(proseRuns('')).toEqual([]);
  });
});

describe('an unpartnered marker', () => {
  /**
   * The record's prose is quoted, so a marker with no partner is shown as the
   * text it is rather than rewritten here until it pairs up.
   */
  it('stays in the text', () => {
    expect(proseRuns('a byte ** and what it did')).toEqual([
      { text: 'a byte ** and what it did', emphasised: false },
    ]);
  });
});

describe('the same prose in a cell', () => {
  it('carries no marker', () => {
    expect(plainProse('**Two fields.** Told apart by where they show.')).toBe(
      'Two fields. Told apart by where they show.',
    );
  });
});
