<script setup lang="ts">
import { computed } from 'vue';
import type { Region, RegionIndex } from '../composables/useArchive';
import { audibleWording, useArchiveFile } from '../composables/useArchive';
import { useI18n } from '../composables/useI18n';

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

interface Tally {
  y: number;
  n: number;
  x: number;
}

interface BlockRow {
  block: string;
  regions: number;
  addresses: number;
  /** null when no region in the block was ever asked whether it is audible. */
  heard: Tally | null;
}

interface BankGroup {
  bank: string;
  window: boolean;
  regions: number;
  addresses: number;
  blocks: BlockRow[];
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
          addresses: addressesIn(regions),
          heard: tallyOf(regions),
        }));
      return {
        bank,
        window: windowBanks.value.includes(bank),
        regions: rows.reduce((sum, row) => sum + row.regions, 0),
        addresses: rows.reduce((sum, row) => sum + row.addresses, 0),
        blocks: rows,
      };
    });
});

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
      <!-- Stated once, at the top: twelve of the nineteen banks are the same
           window, and repeating it on each of them would drown the map. -->
      <p v-if="data.window" class="map__window">
        <strong>{{ t('address.window') }}</strong>
        {{
          t('address.windowBody', {
            blocks: data.window.blocks.join(', '),
            onto: data.window.onto.join(' / '),
          })
        }}
      </p>

      <p v-if="banks.length === 0" class="map__status">{{ t('map.emptyBank') }}</p>

      <section v-for="bank in banks" :key="bank.bank" class="bank sg-panel">
        <header class="bank__head">
          <h3 class="bank__byte sg-readout">{{ bank.bank }}</h3>
          <p class="bank__counts">
            <span>{{ t('map.regions', { count: bank.regions.toLocaleString() }) }}</span>
            <span class="bank__sep">·</span>
            <span>{{ t('map.addresses', { count: bank.addresses.toLocaleString() }) }}</span>
          </p>
          <p v-if="bank.window" class="bank__window">{{ t('address.windowShort') }}</p>
        </header>

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
                  <a class="blocks__link sg-readout" :href="route(`/units/${unitId}/map/${row.block}`)">
                    {{ row.block.replace('-', ' ') }}
                  </a>
                </td>
                <td class="blocks__figure sg-readout">{{ row.regions }}</td>
                <td class="blocks__figure sg-readout">{{ row.addresses.toLocaleString() }}</td>
                <td>
                  <span v-if="row.heard" class="tally">
                    <span class="sg-state sg-state--heard" :title="tallyTitles.y">{{ row.heard.y }}</span>
                    <span class="sg-state sg-state--silent" :title="tallyTitles.n">{{ row.heard.n }}</span>
                    <span class="sg-state sg-state--unasked" :title="tallyTitles.x">{{ row.heard.x }}</span>
                  </span>
                  <span v-else class="blocks__absent">{{ t('address.notMeasured') }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
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

/* A full border plus a tint, never a one-sided stripe on a rounded box. */
.map__window {
  margin: 0 0 var(--space-6);
  padding: var(--space-3) var(--space-4);
  border: 1px solid color-mix(in srgb, var(--sg-refused) 28%, transparent);
  background: color-mix(in srgb, var(--sg-refused) 8%, transparent);
  border-radius: var(--radius-sm);
  font-family: var(--font-reading);
  font-size: 0.85rem;
  line-height: 1.65;
  max-width: var(--sg-measure-wide);
  color: var(--color-text-secondary);
}

.map__window strong {
  display: block;
  margin-bottom: 0.2rem;
  color: var(--sg-refused);
}

.bank + .bank {
  margin-top: var(--space-5);
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

.bank__window {
  margin: 0 0 0 auto;
  padding: 0.15rem 0.5rem;
  border: 1px solid color-mix(in srgb, var(--sg-refused) 28%, transparent);
  background: color-mix(in srgb, var(--sg-refused) 8%, transparent);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  color: var(--sg-refused);
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
