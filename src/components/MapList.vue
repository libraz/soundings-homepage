<script setup lang="ts">
import { computed } from 'vue';
import type { ClaimSummary, Region, RegionIndex } from '../composables/useArchive';
import { audibleWording, useArchiveFile } from '../composables/useArchive';
import { useI18n } from '../composables/useI18n';
import BankMatrix from './BankMatrix.vue';

/**
 * The whole address space of one unit, as far as it has been reached.
 *
 * The archive holds a flat list of regions, which is the shape the sweep wrote
 * it in and not the shape it is read in. Here it is folded back into the two
 * levels the unit's own addressing has — a bank and, inside it, a block — so a
 * reader can see which parts of the space were mapped at all before opening any
 * of them.
 */
const props = defineProps<{ unitId: string }>();

const { t, full, route } = useI18n();

const { data, error, loading } = useArchiveFile<RegionIndex>(() => `${props.unitId}/regions.json`);

/**
 * What the documents came to, block by block.
 *
 * Absent for a unit no document has been read for, which is ordinary and not an
 * error: the map is a map of measurements and stands without it. Thirty
 * kilobytes, which is what makes it worth fetching here at all — the page needs
 * one number per block and the per-block shards would be four hundred requests.
 */
const { data: claims } = useArchiveFile<ClaimSummary>(() => `${props.unitId}/claims.json`);

interface Tally {
  y: number;
  n: number;
  x: number;
}

interface BlockRow {
  block: string;
  regions: number;
  /** Addresses the archive holds for the block, counted once each. */
  count: number;
  /** null when no region in the block was ever asked whether it is audible. */
  heard: Tally | null;
}

/** A block as the documents reached it: claims joined, and rows that did not. */
interface StatedRow {
  block: string;
  count: number;
  absent: number;
}

interface BankGroup {
  bank: string;
  window: boolean;
  regions: number;
  addresses: number;
  blocks: BlockRow[];
  /** How many rows of sixteen both of the bank's grids are drawn at. */
  rows: number;
  /** null when no document read so far names an address in this bank. */
  stated: StatedRow[] | null;
}

/**
 * How many addresses a block holds, counted once each.
 *
 * Regions inside a block overlap — the sweep bounds a 64-byte read and a
 * 16-byte one that starts inside it — so their sizes cannot be added. The
 * archive records how much of a region an earlier one already covers, and what
 * is left is what that region adds to the block.
 */
function addressesIn(regions: Region[]): number {
  return regions.reduce((sum, region) => sum + region.size - (region.overlaps ?? 0), 0);
}

/**
 * A region's audible tally counts only the addresses it added, so the tallies
 * of two overlapping regions can be added where their sizes cannot.
 */
function tallyOf(regions: Region[]): Tally | null {
  const measured = regions.filter((region) => region.heard);
  if (measured.length === 0) return null;
  return measured.reduce<Tally>(
    (sum, region) => ({
      y: sum.y + (region.heard?.y ?? 0),
      n: sum.n + (region.heard?.n ?? 0),
      x: sum.x + (region.heard?.x ?? 0),
    }),
    { y: 0, n: 0, x: 0 },
  );
}

const windowBanks = computed(() => data.value?.window?.blocks ?? []);

const banks = computed<BankGroup[]>(() => {
  const index = data.value;
  if (!index) return [];

  const grouped = new Map<string, Map<string, Region[]>>();
  for (const region of index.regions) {
    let blocks = grouped.get(region.bank);
    if (!blocks) {
      blocks = new Map();
      grouped.set(region.bank, blocks);
    }
    const held = blocks.get(region.block);
    if (held) held.push(region);
    else blocks.set(region.block, [region]);
  }

  return [...grouped.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([bank, blocks]) => {
      const rows = [...blocks.entries()]
        .sort((left, right) => left[0].localeCompare(right[0]))
        .map(([block, regions]) => ({
          block,
          regions: regions.length,
          count: addressesIn(regions),
          heard: tallyOf(regions),
        }));
      const stated = statedIn(bank);
      return {
        bank,
        window: windowBanks.value.includes(bank),
        regions: rows.reduce((sum, row) => sum + row.regions, 0),
        addresses: rows.reduce((sum, row) => sum + row.count, 0),
        blocks: rows,
        rows: heightOf([...rows, ...(stated ?? [])]),
        stated,
      };
    });
});

/**
 * The blocks of one bank a document names, or null when none does.
 *
 * Null and empty are different answers and the page renders them differently: a
 * bank no document reaches says so, and a unit no document has been read for
 * shows no document grid at all.
 */
function statedIn(bank: string): StatedRow[] | null {
  const byBlock = claims.value?.byBlock;
  if (!byBlock) return null;
  const rows = byBlock
    .filter((row) => row.b.startsWith(`${bank}-`))
    .map((row) => ({ block: row.b, count: row.claims, absent: row.absent }));
  return rows.length > 0 ? rows : null;
}

/**
 * How many rows of sixteen a bank is drawn at, over both of its grids.
 *
 * Taken over the two together: a document that states an address past everything
 * the archive reached would otherwise be drawn on a shorter grid than the one it
 * is meant to be read against, and the two would stop lining up exactly where
 * the difference between them matters most.
 */
function heightOf(rows: { block: string }[]): number {
  return rows.reduce((top, row) => {
    const high = Number.parseInt(row.block.split('-')[1][0], 16) + 1;
    return high > top ? high : top;
  }, 1);
}

/** The archive's own sentence for each state, kept on the tally as its title. */
const tallyTitles = computed(() => ({
  y: full(audibleWording('Y')),
  n: full(audibleWording('N')),
  x: full(audibleWording('X')),
}));

/**
 * "Block {block}" is the interface's only word for a block; with no number in
 * it, it is the noun a column heading needs.
 */
const blockNoun = computed(() => t('map.block', { block: '' }).trim());
</script>

<template>
  <section class="map">
    <p v-if="loading" class="map__status">{{ t('search.loading') }}</p>
    <p v-else-if="error" class="map__status">{{ t('common.loadFailed') }}</p>

    <template v-else-if="data">
      <p v-if="banks.length === 0" class="map__status">{{ t('map.emptyBank') }}</p>

      <!-- Said once, above every bank: the grid below is the same picture
           nineteen times, and a legend repeated on each of them is wallpaper. -->
      <div v-if="banks.length" class="key">
        <p class="key__body">{{ t('map.grid.body') }}</p>
        <p class="key__pick">{{ t('map.grid.pick') }}</p>
        <div class="key__groups">
          <div class="key__group">
            <p class="sg-label">{{ t('map.grid.measured') }}</p>
            <ul class="sg-key">
              <li>
                <span class="sg-key__ramp" aria-hidden="true">
                  <span class="sg-cell sg-cell--1" />
                  <span class="sg-cell sg-cell--2" />
                  <span class="sg-cell sg-cell--3" />
                  <span class="sg-cell sg-cell--4" />
                </span>
                {{ t('map.grid.depth') }}
              </li>
              <li>
                <span class="sg-cell sg-cell--absent" aria-hidden="true" />
                {{ t('map.grid.unmapped') }}
              </li>
              <li>
                <span class="sg-cell sg-cell--2" aria-hidden="true">
                  <span class="sg-cell__dot sg-cell__dot--heard" />
                </span>
                {{ t('map.grid.audible') }}
              </li>
            </ul>
          </div>

          <!-- The document's own key, and none of the four colours in it. -->
          <div v-if="claims" class="key__group">
            <p class="sg-label">{{ t('map.grid.stated') }}</p>
            <ul class="sg-key">
              <li>
                <span class="sg-key__ramp" aria-hidden="true">
                  <span class="sg-cell sg-cell--1" />
                  <span class="sg-cell sg-cell--2" />
                  <span class="sg-cell sg-cell--3" />
                  <span class="sg-cell sg-cell--4" />
                </span>
                {{ t('map.grid.statedDepth') }}
              </li>
              <li>
                <span class="sg-cell sg-cell--absent" aria-hidden="true" />
                {{ t('map.grid.unstated') }}
              </li>
              <li>
                <span class="sg-cell sg-cell--2" aria-hidden="true">
                  <span class="sg-cell__dot sg-cell__dot--gap" />
                </span>
                {{ t('map.grid.gap') }}
              </li>
            </ul>
          </div>
        </div>
      </div>

      <!--
        Below the legend, not above it: this is an exception, and an exception
        shown before a reader knows what a block is asks them to hold something
        they cannot place yet. Folded, because it is twelve blocks of four
        hundred and sixty-one — the banks it applies to carry their own mark, so
        anyone who meets one has a way back to this.

        The heading is the unit's, not an address's. `address.window` is written
        in the singular for one block and read as a statement about the block
        the reader is on; here it stood above a list of twelve.
      -->
      <details v-if="data.window" class="window">
        <summary class="window__summary">
          {{ t('map.windowBlocks', { count: data.window.blocks.length }) }}
        </summary>
        <p class="window__body">
          {{
            t('address.windowBody', {
              blocks: data.window.blocks.join(', '),
              onto: data.window.onto.join(' / '),
            })
          }}
        </p>
      </details>

      <!--
        Nineteen banks stack to six thousand pixels, so the page needs a way to
        move that is not scrolling. Byte order rather than size: it is the order
        the banks are already in, and the order an address is read in.
      -->
      <nav v-if="banks.length > 1" class="jump" :aria-label="t('map.jumpTo')">
        <span class="sg-label">{{ t('map.jumpTo') }}</span>
        <ul class="jump__list">
          <li v-for="bank in banks" :key="bank.bank">
            <a class="jump__item sg-readout" :href="`#bank-${bank.bank}`">{{ bank.bank }}</a>
          </li>
        </ul>
      </nav>

      <section
        v-for="bank in banks"
        :id="`bank-${bank.bank}`"
        :key="bank.bank"
        class="bank sg-panel"
      >
        <header class="bank__head">
          <h3 class="bank__byte sg-readout">{{ bank.bank }}</h3>
          <p class="bank__counts">
            <span>{{ t('map.regions', { count: bank.regions.toLocaleString() }) }}</span>
            <span class="bank__sep">·</span>
            <span>{{ t('map.addresses', { count: bank.addresses.toLocaleString() }) }}</span>
          </p>
          <p v-if="bank.window" class="bank__window">{{ t('address.windowShort') }}</p>
        </header>

        <!-- The two side by side and never overlaid: what a document states is
             shown apart from what was measured, and on the same geometry, so a
             block is the same square in both and the reader compares them by
             looking rather than by being told. -->
        <div class="bank__grids">
          <figure class="plot">
            <figcaption class="plot__title sg-label">{{ t('map.grid.measured') }}</figcaption>
            <BankMatrix
              :unit-id="unitId"
              :bank="bank.bank"
              :rows="bank.rows"
              variant="measured"
              :blocks="bank.blocks"
            />
          </figure>

          <figure v-if="bank.stated" class="plot">
            <figcaption class="plot__title sg-label">{{ t('map.grid.stated') }}</figcaption>
            <BankMatrix
              :unit-id="unitId"
              :bank="bank.bank"
              :rows="bank.rows"
              variant="stated"
              :blocks="bank.stated"
            />
          </figure>
          <p v-else-if="claims" class="plot__none">{{ t('map.grid.unstatedBank') }}</p>
        </div>

        <!-- The numbers the grid was folded from, kept and not thrown away.
             Folded rather than dropped: a shape is what the grid is for, and
             "how many addresses does 40 11 hold" is a question the shape cannot
             answer. -->
        <details class="numbers">
          <summary class="numbers__summary sg-label">{{ t('map.grid.numbers') }}</summary>
          <div class="scroller">
            <table class="blocks">
              <thead>
                <tr>
                  <th class="sg-label" scope="col">{{ blockNoun }}</th>
                  <th class="sg-label" scope="col">{{ t('address.region') }}</th>
                  <th class="sg-label" scope="col">{{ t('search.address') }}</th>
                  <th class="sg-label" scope="col">{{ t('map.heard') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in bank.blocks" :key="row.block">
                  <td>
                    <a
                      class="blocks__link sg-readout"
                      :href="route(`/units/${unitId}/map/${row.block}`)"
                    >
                      {{ row.block.replace('-', ' ') }}
                    </a>
                  </td>
                  <td class="blocks__figure sg-readout">{{ row.regions }}</td>
                  <td class="blocks__figure sg-readout">{{ row.count.toLocaleString() }}</td>
                  <td>
                    <span v-if="row.heard" class="tally">
                      <span class="sg-state sg-state--heard" :title="tallyTitles.y">
                        {{ row.heard.y }}
                      </span>
                      <span class="sg-state sg-state--silent" :title="tallyTitles.n">
                        {{ row.heard.n }}
                      </span>
                      <span class="sg-state sg-state--unasked" :title="tallyTitles.x">
                        {{ row.heard.x }}
                      </span>
                    </span>
                    <span v-else class="blocks__absent">{{ t('address.notMeasured') }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>
      </section>
    </template>
  </section>
</template>

<style scoped>
/* The unit's header panel sits directly above, with nothing between them. */
.map {
  margin-top: var(--space-8);
}

.map__status {
  margin: var(--space-6) 0;
  font-size: 0.9rem;
  color: var(--color-text-tertiary);
}

/* A full border plus a tint, never a one-sided stripe on a rounded box.

   Drawn in the page's own ink and none of the four hues. A block that holds
   nothing of its own is a fact about how the unit is addressed, not a reading:
   nothing here was asked and refused. Wearing the refused hue it was the
   loudest mark on a page whose whole subject is four colours meaning four
   things, and it was saying a fifth. */
.window {
  margin: 0 0 var(--space-5);
  padding: var(--space-2) var(--space-4);
  border: 1px solid var(--sg-rule);
  background: color-mix(in srgb, var(--sg-readout) 4%, transparent);
  border-radius: var(--radius-sm);
  max-width: var(--sg-measure);
}

/* The reading surface gives a `summary` a margin of its own, which inside a box
   this size is most of the box. */
.window__summary {
  margin: 0;
  padding: var(--space-2) 0;
  font-family: var(--font-reading);
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--color-text-primary);
  cursor: pointer;
  list-style: none;
}

.window__summary::-webkit-details-marker {
  display: none;
}

/* Drawn rather than left to the platform's triangle, so it is the size of the
   label beside it — the same mark the bank tables' disclosure carries. */
.window__summary::before {
  content: '+';
  display: inline-block;
  width: 1em;
  font-size: 1.1em;
  line-height: 1;
}

.window[open] > .window__summary::before {
  content: '−';
}

.window__body {
  margin: 0 0 var(--space-3);
  font-family: var(--font-reading);
  font-size: 0.85rem;
  line-height: 1.7;
  color: var(--color-text-secondary);
}

/* Byte, byte, byte across the page. Set in the readout face because that is
   what a bank is — a byte the unit answers at, not a section title. */
.jump {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-4);
  margin: 0 0 var(--space-5);
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--sg-rule-soft);
}

.jump__list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  list-style: none;
  margin: 0;
  padding: 0;
}

.jump__item {
  display: block;
  padding: 0.15rem 0.45rem;
  font-size: 0.8rem;
  letter-spacing: 0.04em;
  border: 1px solid var(--sg-rule-soft);
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  text-decoration: none;
  transition: border-color var(--transition-fast), color var(--transition-fast),
    background-color var(--transition-fast);
}

.jump__item:hover,
.jump__item:focus-visible {
  outline: none;
  color: var(--vp-c-brand-1);
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 45%, transparent);
  background: color-mix(in srgb, var(--vp-c-brand-1) 6%, transparent);
}

/* The bank a jump landed on, clear of the sticky nav above it. */
.bank {
  scroll-margin-top: 5rem;
}

/* The legend, once, above the nineteen grids it explains. */
.key {
  margin: 0 0 var(--space-6);
}

.key__body {
  margin: 0 0 var(--space-2);
  max-width: var(--sg-measure-wide);
  font-family: var(--font-reading);
  font-size: 0.8rem;
  line-height: 1.7;
  color: var(--color-text-secondary);
}

/* A cell is a link and nothing about it says so until it is hovered, which is
   no use to a reader deciding whether the grid is worth reading at all. */
.key__pick {
  margin: 0 0 var(--space-3);
  font-family: var(--font-reading);
  font-size: 0.8rem;
  color: var(--color-text-tertiary);
}

.bank + .bank {
  margin-top: var(--space-5);
}

.key__groups {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3) var(--space-8);
}

.key__group {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.bank__grids {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-5) var(--space-8);
  padding: var(--space-5);
}

.plot {
  flex: 0 1 19rem;
  min-width: 11rem;
  margin: 0;
}

.plot__title {
  margin-bottom: var(--space-3);
}

.plot__none {
  align-self: center;
  margin: 0;
  font-family: var(--font-reading);
  font-size: 0.75rem;
  color: var(--color-text-tertiary);
}

/* The numbers, folded. Its own hairline above it so the panel still reads as
   two parts rather than one that ran on. */
.numbers {
  border-top: 1px solid var(--sg-rule-soft);
}

.numbers__summary {
  padding: var(--space-3) var(--space-5);
  cursor: pointer;
  list-style: none;
  color: var(--vp-c-brand-1);
}

.numbers__summary::-webkit-details-marker {
  display: none;
}

/* The mark that says it opens, drawn rather than left to the platform's
   triangle: the platform's is a different size in every browser and this one
   is the size of the label beside it. */
.numbers__summary::before {
  content: '+';
  display: inline-block;
  width: 1em;
  font-size: 1.1em;
  line-height: 1;
  color: var(--color-text-tertiary);
}

.numbers[open] > .numbers__summary::before {
  content: '−';
}

.numbers__summary:hover {
  background: color-mix(in srgb, var(--vp-c-brand-1) 5%, transparent);
}

.numbers__summary:focus-visible {
  outline: 1px solid var(--vp-c-brand-1);
  outline-offset: -1px;
}

.numbers .scroller {
  padding-bottom: var(--space-3);
}

.bank__head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--space-3) var(--space-4);
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--sg-rule);
}

.bank__byte {
  margin: 0;
  padding: 0;
  border: none;
  font-size: 1.5rem;
  font-weight: 500;
  line-height: 1;
  letter-spacing: 0.06em;
}

.bank__counts {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--color-text-tertiary);
}

.bank__sep {
  margin: 0 0.5em;
  opacity: 0.5;
}

/* The same fact as the disclosure above, so the same marks: the page's ink, and
   none of the four hues. */
.bank__window {
  margin: 0 0 0 auto;
  padding: 0.15rem 0.5rem;
  border: 1px solid var(--sg-rule);
  background: color-mix(in srgb, var(--sg-readout) 4%, transparent);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  color: var(--color-text-secondary);
}

/* Nineteen banks of up to eighty-five blocks: the table scrolls rather than
   forcing the page to. */
.scroller {
  overflow-x: auto;
}

.blocks {
  width: 100%;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
}

.blocks th,
.blocks td {
  padding: 0.3rem var(--space-5);
  text-align: left;
  white-space: nowrap;
  border: 0;
}

.blocks th {
  padding-top: var(--space-3);
  padding-bottom: var(--space-2);
}

.blocks tbody tr + tr td {
  border-top: 1px solid var(--sg-rule-soft);
}

.blocks tbody tr:hover td {
  background: color-mix(in srgb, var(--vp-c-brand-1) 5%, transparent);
}

.blocks__link {
  font-size: 0.85rem;
  letter-spacing: 0.05em;
  color: var(--vp-c-brand-1);
  text-decoration: none;
}

.blocks__link:hover {
  text-decoration: underline;
}

.blocks__figure {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

.blocks__absent {
  font-family: var(--font-reading);
  font-size: 0.72rem;
  color: var(--color-text-tertiary);
}

.tally {
  display: inline-flex;
  gap: var(--space-3);
}

@media (max-width: 640px) {
  .bank__head {
    padding: var(--space-3) var(--space-4);
  }
  .blocks th,
  .blocks td {
    padding-left: var(--space-4);
    padding-right: var(--space-4);
  }
  .bank__window {
    margin-left: 0;
  }
}
</style>
