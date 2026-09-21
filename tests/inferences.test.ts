import { describe, expect, it } from 'vitest';
// @ts-expect-error -- the sync scripts are plain JS with JSDoc types
import { levelOf, STANDINGS, standingOf, titleOf } from '../scripts/lib/inferences.mjs';
// @ts-expect-error -- the sync scripts are plain JS with JSDoc types
import { asExample } from '../scripts/lib/model-cpp.mjs';

/**
 * How far a claim about an algorithm got, and what the site is willing to print
 * because of it.
 *
 * Both sides of this are the reason the pages exist in the shape they do. A
 * claim can stand on measurements and printed pages while the model somebody
 * built for it was rejected outright — three of this archive's do — so the level
 * is read off two fields and never off one, and the code example follows the
 * level rather than the existence of a model.
 */

const standing = { state: 'standing', about: { types: [], addresses: [] } };

describe('the level a claim is at', () => {
  it('is identified only when the claim stands and its model closed', () => {
    expect(levelOf(standing, { verdict: 'reproduces' }).level).toBe('identified');
    expect(levelOf(standing, { verdict: 'equivalent_under_this_test' }).level).toBe('identified');
  });

  /**
   * The one this is really for. `rejected` sits on a claim whose own state is
   * `standing`: the evidence holds and the model built from it does not.
   */
  it('is under investigation where the claim stands and the model was rejected', () => {
    expect(levelOf(standing, { verdict: 'rejected' }).level).toBe('investigating');
    expect(levelOf(standing, { verdict: 'breaks_down' }).level).toBe('investigating');
    expect(levelOf(standing, { verdict: 'domain_too_narrow' }).level).toBe('investigating');
  });

  it('is under investigation where no model has been rendered at all', () => {
    const level = levelOf(standing, null);
    expect(level.level).toBe('investigating');
    expect(level.why).toContain('no model');
  });

  it('is under investigation where a comparison was made and left no verdict', () => {
    expect(levelOf(standing, { model: 'inferences/models/x.json' }).level).toBe('investigating');
  });

  /**
   * A claim believed on the era or on a printed page alone is not identified,
   * whatever a model rendered beside it came to. Nothing has been in a position
   * to contradict it.
   */
  it('is never identified on a claim the archive marks untested', () => {
    const untested = { ...standing, state: 'standing_untested' };
    expect(levelOf(untested, { verdict: 'reproduces' }).level).toBe('investigating');
  });

  it("carries the archive's own reason for every level", () => {
    expect(levelOf({ ...standing, state: 'parked' }, null).why).toBeTruthy();
    expect(
      levelOf({ ...standing, state: 'retracted', retracted_because: 'a later run' }, null).why,
    ).toBe('a later run');
    expect(
      levelOf({ ...standing, state: 'superseded', superseded_by: 'inferences/u/b.json' }, null).why,
    ).toBe('inferences/u/b.json');
  });

  it('fails on a state the site has no word for rather than defaulting', () => {
    expect(() => levelOf({ state: 'provisional', about: {} }, null)).toThrow(/provisional/);
  });
});

/**
 * The one word a reader is told first.
 *
 * `level` and `verdict` fail apart, and a page that showed only one of them
 * said the wrong thing about several claims at once — most damagingly that a
 * retracted claim was one nobody had built a model for yet. These six words
 * are that pair read down in a fixed order, and the order is the whole of it.
 */
describe('where a claim stands, in one word', () => {
  const compared = { model: 'inferences/models/x.json' };

  it('is withdrawn for a claim the archive no longer stands behind', () => {
    expect(standingOf({ level: 'retracted', reproduces: null, verdict: null })).toBe('withdrawn');
    expect(standingOf({ level: 'superseded', reproduces: null, verdict: null })).toBe('withdrawn');
  });

  /**
   * The defect the order exists for. A retracted claim usually has no
   * `reproduces`, so any order testing that first calls it `unmodelled` and
   * tells the reader nothing has been compared yet — about a claim that was
   * compared, and then withdrawn.
   */
  it('is withdrawn even where a model closed, and even where none was built', () => {
    expect(standingOf({ level: 'retracted', reproduces: compared, verdict: 'reproduces' })).toBe(
      'withdrawn',
    );
    expect(standingOf({ level: 'superseded', reproduces: compared, verdict: 'rejected' })).toBe(
      'withdrawn',
    );
  });

  it('is closed exactly where the level is identified', () => {
    expect(standingOf({ level: 'identified', reproduces: compared, verdict: 'reproduces' })).toBe(
      'closed',
    );
    expect(
      standingOf({
        level: 'identified',
        reproduces: compared,
        verdict: 'equivalent_under_this_test',
      }),
    ).toBe('closed');
  });

  /**
   * A limit on how long the claim was pursued, not a verdict on the model. One
   * of this archive's parked claims carries a model that reproduced what the
   * unit did, and its curves are drawn solid on that verdict while the page
   * says the claim was exhausted.
   */
  it('is exhausted for a parked claim, whatever its model came to', () => {
    expect(standingOf({ level: 'parked', reproduces: null, verdict: null })).toBe('exhausted');
    expect(standingOf({ level: 'parked', reproduces: compared, verdict: 'reproduces' })).toBe(
      'exhausted',
    );
  });

  it('is not closed for each of the four verdicts a comparison can fail under', () => {
    for (const verdict of ['breaks_down', 'rejected', 'domain_too_narrow', 'candidates_too_few']) {
      expect(standingOf({ level: 'investigating', reproduces: compared, verdict })).toBe('failed');
    }
  });

  it('is undecided where a comparison was made and carries no verdict', () => {
    expect(standingOf({ level: 'investigating', reproduces: compared, verdict: null })).toBe(
      'undecided',
    );
  });

  /**
   * `standing_untested` with a closed verdict. `levelOf()` refuses to call it
   * identified, and the pair would otherwise reach the end of the order and
   * throw — the model closed, so `unmodelled` is false too.
   */
  it('is undecided where the model closed but the archive left the claim untested', () => {
    const untested = { ...standing, state: 'standing_untested' };
    const level = levelOf(untested, { verdict: 'reproduces' }).level;
    expect(level).toBe('investigating');
    expect(standingOf({ level, reproduces: compared, verdict: 'reproduces' })).toBe('undecided');
  });

  it('is not yet modelled where nothing has been compared', () => {
    expect(standingOf({ level: 'investigating', reproduces: null, verdict: null })).toBe(
      'unmodelled',
    );
  });

  it('fails on a pair it has no word for rather than defaulting', () => {
    expect(() =>
      standingOf({ level: 'investigating', reproduces: compared, verdict: 'pending_review' }),
    ).toThrow(/pending_review/);
  });

  it('only ever answers with one of the six words the locales carry', () => {
    expect(STANDINGS).toHaveLength(6);
    for (const level of ['retracted', 'superseded', 'identified', 'parked', 'investigating']) {
      for (const reproduces of [null, compared]) {
        for (const verdict of [null, 'reproduces', 'rejected', 'equivalent_under_this_test']) {
          let answer: string | null = null;
          try {
            answer = standingOf({ level, reproduces, verdict });
          } catch {
            // A pair with no word is a failure by design, not a default.
            continue;
          }
          expect(STANDINGS).toContain(answer);
        }
      }
    }
  });
});

describe('what a claim is headed with', () => {
  const printed = {
    types: new Map([
      ['01 00', { name: 'Stereo-EQ', page: 216, document: 'manual' }],
      ['01 20', { name: 'Phaser', page: 216, document: 'manual' }],
      ['01 70', { name: '3D Auto', page: 220, document: 'manual' }],
    ]),
    parameters: new Map([
      ['01 00/03', { name: 'Low Freq', page: 216, document: 'manual' }],
      ['01 00/04', { name: 'Low Gain', page: 216, document: 'manual' }],
      ['01 20/06', { name: 'Reso', page: 216, document: 'manual' }],
      ['01 20/07', { name: 'Mix', page: 216, document: 'manual' }],
    ]),
  };

  it('is the name the document prints for the type', () => {
    const title = titleOf({ types: ['01 20'], addresses: ['40 03 06'] }, printed);
    expect(title.names.map((entry: { name: string }) => entry.name)).toEqual(['Phaser']);
    expect(title.parameters.map((entry: { name: string }) => entry.name)).toEqual(['Reso']);
  });

  /**
   * The claim is about the type, not about a selection inside it, and naming
   * every parameter it prints says the opposite of that.
   */
  it('names no parameter where the claim reaches every one the type prints', () => {
    const title = titleOf({ types: ['01 00'], addresses: ['40 03 03', '40 03 04'] }, printed);
    expect(title.names.map((entry: { name: string }) => entry.name)).toEqual(['Stereo-EQ']);
    expect(title.parameters).toEqual([]);
  });

  /**
   * The one this is really for. A claim's addresses are a union over every type
   * it reaches, and the same address byte is a different parameter under a
   * different type — matched across three of them it put a delay's feedback mode
   * on an equaliser's gain.
   */
  it('names no parameter at all where the claim reaches more than one type', () => {
    const title = titleOf({ types: ['01 00', '01 20'], addresses: ['40 03 06'] }, printed);
    expect(title.names.map((entry: { name: string }) => entry.name)).toEqual([
      'Stereo-EQ',
      'Phaser',
    ]);
    expect(title.parameters).toEqual([]);
  });

  it('stops at three names and counts the rest', () => {
    const many = {
      types: new Map(
        ['a', 'b', 'c', 'd', 'e'].map((name, index) => [
          `0${index} 00`,
          { name, page: 1, document: 'manual' },
        ]),
      ),
      parameters: new Map(),
    };
    const title = titleOf({ types: ['00 00', '01 00', '02 00', '03 00', '04 00'] }, many);
    expect(title.names).toHaveLength(3);
    expect(title.more).toBe(2);
  });

  it('gives nothing for a claim no printed page reaches, rather than a guess', () => {
    expect(titleOf({ types: [], addresses: ['40 03 03'] }, printed)).toBeNull();
    expect(titleOf({ types: ['7F 7F'] }, printed)).toBeNull();
    expect(titleOf({ types: ['01 20'] }, undefined)).toBeNull();
  });
});

describe('what is printed as an example', () => {
  const args = { modelPath: 'inferences/models/x.json', claimPath: 'inferences/u/c.json' };

  it('names the model it came from, so the page can be checked against it', () => {
    const model = {
      model: { kind: 'lti', unit_id: 'u', type: '01 20', class: 'phaser' },
      sample_rate_hz: 32000,
      chain: [
        {
          kind: 'allpass-chain',
          sections: 8,
          corner_hz: { byte: '40 03 03', map: { kind: 'states', values: { '*': 1000 } } },
          mix: { byte: '40 03 07', map: { kind: 'states', values: { '*': 1 } } },
        },
      ],
    };
    const produced = asExample({ ...args, model, reproduces: null });
    expect(produced.code).toContain('inferences/models/x.json');
    expect(produced.code).toContain('inferences/u/c.json');
    expect(produced.code).toContain('kSampleRateHz = 32000.0');
  });

  /**
   * A chain missing a section is a different effect. Half an example would be
   * the site asserting a structure no record establishes, in the form a reader
   * is most likely to compile.
   */
  it('refuses the whole chain when one section has no realisation', () => {
    const model = {
      model: { kind: 'lti' },
      sample_rate_hz: 32000,
      chain: [{ kind: 'waveshaper' }],
    };
    const produced = asExample({ ...args, model, reproduces: null });
    expect(produced.code).toBeUndefined();
    expect(produced.unsupported).toContain('waveshaper');
  });

  it('refuses a loop whose tap point the model does not settle', () => {
    const model = {
      model: { kind: 'lti' },
      sample_rate_hz: 32000,
      chain: [
        {
          kind: 'allpass-chain',
          sections: 8,
          feedback_sections: 4,
          corner_hz: { byte: 'a', map: { kind: 'states', values: { '*': 1000 } } },
          mix: { byte: 'b', map: { kind: 'states', values: { '*': 1 } } },
        },
      ],
    };
    expect(asExample({ ...args, model, reproduces: null }).unsupported).toMatch(/tap point/);
  });

  it('refuses a chain with no rate, because every section here is clocked by one', () => {
    const model = { model: { kind: 'lti' }, chain: [{ kind: 'gain', gain_db: 0 }] };
    expect(asExample({ ...args, model, reproduces: null }).unsupported).toMatch(/sample rate/);
  });

  it('refuses a model of a kind nothing is generated from yet', () => {
    const produced = asExample({ ...args, model: { model: { kind: 'pan' } }, reproduces: null });
    expect(produced.unsupported).toContain('pan');
  });

  it('keys a table example by the range the document prints', () => {
    const model = {
      model: { kind: 'table', class: 'delay-time' },
      what: 'A ladder cut to whole samples.',
      tables: {
        '0 - 500m': { kind: 'table', entries: [0, 0.09375], out_of_range: 127 },
      },
    };
    const produced = asExample({ ...args, model, reproduces: null });
    expect(produced.code).toContain('"0 - 500m"');
    // A range no reading was taken over answers with nothing rather than with a
    // neighbour's table.
    expect(produced.code).toContain('return false;');
  });
});
