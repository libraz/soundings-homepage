import { describe, expect, it } from 'vitest';
// @ts-expect-error -- the sync scripts are plain JS with JSDoc types
import { aggregateUnit } from '../scripts/lib/aggregate.mjs';
import legend from '../src/data/legend.json';

/**
 * How several records of one stage become one reading of an address.
 *
 * A stage is a directory, not a file. The map-wide pass is the largest record
 * in it and never the only one: it stops at each region's mapped length, so the
 * addresses printed between two regions are asked later, by a run aimed at
 * them. Reading only `whole-map.json` showed thirty-four of those as never
 * measured — an absence the archive does not hold, which is the one thing this
 * site may not put on a page.
 */

/** An archive of exactly the records a test hands it. */
function fakeUnit(files: Record<string, unknown>) {
  return {
    unitId: 'test-unit-01',
    read: new Set<string>(),
    has: (path: string) => path in files,
    load: (path: string) => files[path] ?? null,
    loadRequired: (path: string) => files[path] ?? {},
    loadStage(stage: string) {
      const out = new Map<string, unknown>();
      for (const path of Object.keys(files).sort()) {
        if (!path.startsWith(`${stage}/`)) continue;
        out.set(path.slice(stage.length + 1).replace(/\.json$/, ''), files[path]);
      }
      return out;
    },
    stages: () => [],
    size: () => 0,
  };
}

function byte(address: string, over: Record<string, unknown> = {}) {
  return {
    address,
    classification: 'accepts',
    range: '00..7F',
    accepted: ['00', '7F'],
    wrote_read: [
      ['00', '00'],
      ['7F', '7F'],
    ],
    ...over,
  };
}

/** A unit whose sweep found one region of two bytes. */
function archive(rest: Record<string, unknown>) {
  return aggregateUnit(
    fakeUnit({
      'meta.json': { unit_id: 'test-unit-01', documents: [] },
      'sweep/whole-map.json': {
        regions: [
          {
            address: '40 20 00',
            size: 2,
            data: '00 00',
            checksum_ok: true,
            oversize_behaviour: 'refuses',
          },
        ],
      },
      ...rest,
    }),
    legend,
  );
}

describe('a stage with more than one record in it', () => {
  it('takes an address the map-wide pass never asked from the run that did', () => {
    const { addresses, warnings } = archive({
      'write-probe/whole-map.json': {
        regions: [{ start: '40 20 00', bytes: [byte('40 20 00')] }],
      },
      'write-probe/40-2x-20.json': {
        regions: [{ start: '40 20 20', bytes: [byte('40 20 20')] }],
      },
    });
    expect(warnings).toEqual([]);
    // No swept region and no swept value, and it says so rather than borrowing
    // either from the run that did reach it.
    expect(addresses.get('40 20 20')).toMatchObject({ g: null, o: null, s: null });
    expect(addresses.get('40 20 20').w).toMatchObject({ f: 'write-probe/40-2x-20.json' });
  });

  it('names the record only where it is not the map-wide pass', () => {
    // The map-wide pass answers for all but a few dozen of thirty-seven
    // thousand addresses. Repeating its path on each of them costs a megabyte
    // to say the same thing every time, so the index carries it once.
    const { addresses, probedBy } = archive({
      'write-probe/whole-map.json': {
        regions: [{ start: '40 20 00', bytes: [byte('40 20 00')] }],
      },
    });
    expect(addresses.get('40 20 00').w.f).toBeUndefined();
    expect(probedBy).toBe('write-probe/whole-map.json');
  });

  it('refuses to settle a disagreement by file order, and says so', () => {
    const { addresses, warnings } = archive({
      'write-probe/whole-map.json': {
        regions: [{ start: '40 20 00', bytes: [byte('40 20 00')] }],
      },
      'write-probe/later.json': {
        regions: [
          {
            start: '40 20 00',
            bytes: [byte('40 20 00', { range: '28..58', classification: 'clamps' })],
          },
        ],
      },
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('40 20 00');
    // The reading already held stands, and the page is unchanged: which of the
    // two is right is a question for a person, not for a sort order.
    expect(addresses.get('40 20 00').w.r).toBe('00..7F');
  });

  it('takes the addresses a region answered past its mapped end from the record', () => {
    // The boundary record says how many answered and what each of them said.
    // Keeping only the count put a figure on the region page and left the
    // addresses themselves nowhere — and the archive counts them as addresses
    // it found, not as a property of the region that ran into them.
    const { addresses } = archive({
      'boundary/whole-map.json': {
        regions: [
          {
            address: '40 20 00',
            mapped_size: 2,
            answered_beyond_the_mapped_end: 2,
            first_address_past_the_end: '40 20 02',
            values: ['40', '7F'],
          },
        ],
      },
    });
    expect(addresses.get('40 20 02')).toMatchObject({ s: '40', g: null, o: null, x: true });
    expect(addresses.get('40 20 03')).toMatchObject({ s: '7F', x: true });
  });

  it('warns rather than inventing an address the map-wide pass alone names', () => {
    // A map-wide write probe walks the map the sweep found. One naming an
    // address the sweep did not is two records about different maps, which is
    // a coherence problem in the archive rather than a new address.
    const { addresses, warnings } = archive({
      'write-probe/whole-map.json': {
        regions: [{ start: '40 20 00', bytes: [byte('40 20 00'), byte('40 20 20')] }],
      },
    });
    expect(addresses.has('40 20 20')).toBe(false);
    expect(warnings[0]).toContain('40 20 20');
  });
});

describe('a hold verdict taken over a run rather than over a region', () => {
  const past = {
    'boundary/whole-map.json': {
      regions: [
        {
          address: '40 20 00',
          mapped_size: 2,
          answered_beyond_the_mapped_end: 2,
          first_address_past_the_end: '40 20 02',
          values: ['40', '7F'],
        },
      ],
    },
  };

  it('sits on the addresses it was taken over, not on the region containing them', () => {
    // The run starts part-way through, or past the end of, a region. Matched
    // against region starts it matches nothing and was dropped without a word,
    // which is how a measured verdict came to be shown as never taken.
    const { addresses, regions, warnings } = archive({
      ...past,
      'hold-probe/40-20-02.json': {
        regions: [
          {
            start: '40 20 02',
            length: 2,
            verdict: 'every address answered differently from its neighbours',
            neighbouring_pairs_that_answered_alike: 0,
            given: { '40 20 02': '00', '40 20 03': '7F' },
          },
        ],
      },
    });
    expect(warnings).toEqual([]);
    expect(addresses.get('40 20 02').h).toMatchObject({
      v: 'D',
      l: 2,
      s: '40 20 02',
      f: 'hold-probe/40-20-02.json',
    });
    // The region it ran past keeps its own verdict, which is about its own
    // addresses and says nothing about these.
    expect(regions[0].hold).toBeUndefined();
  });

  it('says so rather than inventing an address only the run names', () => {
    const { addresses, warnings } = archive({
      'hold-probe/40-20-40.json': {
        regions: [
          {
            start: '40 20 40',
            length: 1,
            verdict: 'only one address here would answer, so there was nothing to compare it with',
            given: { '40 20 40': '00' },
          },
        ],
      },
    });
    expect(addresses.has('40 20 40')).toBe(false);
    expect(warnings[0]).toContain('40 20 40');
  });
});
