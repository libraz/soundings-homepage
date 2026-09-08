<script setup lang="ts">
import { computed } from 'vue';
import { useArchiveFile } from '../composables/useArchive';
import { useI18n } from '../composables/useI18n';
import RecordLink from './RecordLink.vue';

/**
 * Every bank and program the unit moved to when it was asked for one.
 *
 * The tone map is not a list of names — nothing here reads a name off the
 * instrument. It is the set of combinations a part actually took, one map
 * select at a time, which is why a bank appears at all and why the programs
 * inside it are given as the ranges the sweep found rather than as a total.
 */
const props = defineProps<{ unitId: string }>();

const { t, note, noteIsQuoted } = useI18n();

/** Closed ranges, as the record writes them: `[[0, 127]]`, `[[5, 5]]`. */
type ProgramRange = [number, number];

interface ToneBank {
  bank: number;
  tones: number;
  sweptFully: boolean;
  programs: ProgramRange[];
}

interface ToneMap {
  file: string;
  mapSelect: number;
  /** Set when this map's bank and program set is the same as an earlier map's. */
  identicalTo?: number;
  channel: number;
  requests: number;
  readsUnusable: number;
  samplingCaveat: string;
  banks: ToneBank[];
}

interface ToneCatalogue {
  maps: ToneMap[];
  totals: { maps: number };
}

const { data, error, loading } = useArchiveFile<ToneCatalogue>(() => `${props.unitId}/tones.json`);

function programs(ranges: ProgramRange[]): string {
  return ranges.map(([from, to]) => (from === to ? String(from) : `${from}–${to}`)).join(', ');
}

function tonesIn(map: ToneMap): number {
  return map.banks.reduce((sum, bank) => sum + bank.tones, 0);
}

/**
 * The caveat belongs to each map's record, and every map was swept the same
 * way, so when they agree it is stated once instead of five times.
 */
const sharedCaveat = computed(() => {
  const caveats = new Set((data.value?.maps ?? []).map((map) => map.samplingCaveat));
  return caveats.size === 1 ? [...caveats][0] : null;
});
</script>

<template>
  <section class="tones">
    <p class="tones__lede">{{ t('tones.lede') }}</p>

    <p v-if="loading" class="tones__status">{{ t('search.loading') }}</p>
    <p v-else-if="error" class="tones__status">{{ t('common.loadFailed') }}</p>

    <template v-else-if="data">
      <header class="tones__head">
        <p class="tones__totals">
          {{ t('tones.maps', { count: data.totals.maps }) }}
        </p>
        <p class="tones__caveat">{{ t('tones.mapsNote') }}</p>
        <p v-if="sharedCaveat" class="tones__caveat" :class="{ 'sg-quoted': noteIsQuoted(sharedCaveat) }">
          {{ note(sharedCaveat) }}
        </p>
      </header>

      <section v-for="map in data.maps" :key="map.mapSelect" class="map sg-panel">
        <header class="map__head">
          <h3 class="map__title">{{ t('tones.mapSelect', { n: map.mapSelect }) }}</h3>
          <p class="map__totals">
            {{ t('tones.totals', { tones: tonesIn(map).toLocaleString(), banks: map.banks.length }) }}
          </p>
          <p v-if="map.identicalTo !== undefined" class="map__identical">
            {{ t('tones.identicalTo', { n: map.identicalTo }) }}
          </p>
          <RecordLink :unit-id="unitId" :path="map.file" />
        </header>

        <p
          v-if="!sharedCaveat"
          class="map__caveat"
          :class="{ 'sg-quoted': noteIsQuoted(map.samplingCaveat) }"
        >
          {{ note(map.samplingCaveat) }}
        </p>

        <p v-if="map.banks.length === 0" class="tones__absent">
          {{ t('address.notMeasuredBody') }}
        </p>

        <div v-else class="scroller">
          <table class="banks">
            <thead>
              <tr>
                <th class="sg-label" scope="col">{{ t('tones.bank') }}</th>
                <th class="sg-label" scope="col">{{ t('tones.count') }}</th>
                <th class="sg-label" scope="col">{{ t('tones.programs') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="bank in map.banks" :key="bank.bank">
                <td class="sg-readout banks__bank">{{ bank.bank }}</td>
                <td class="sg-readout banks__count">{{ bank.tones }}</td>
                <td class="sg-readout banks__programs">{{ programs(bank.programs) }}</td>
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
.tones {
  margin-top: var(--space-8);
}

.tones__lede {
  margin: 0 0 var(--space-5);
  max-width: var(--sg-measure-wide);
  font-family: var(--font-reading);
  font-size: 0.9rem;
  line-height: 1.75;
  color: var(--color-text-secondary);
}

.tones__status,
.tones__absent {
  margin: 0;
  padding: var(--space-4) var(--space-5);
  font-family: var(--font-reading);
  font-size: 0.85rem;
  line-height: 1.7;
  color: var(--color-text-tertiary);
}

.tones__head {
  margin-bottom: var(--space-5);
}

.tones__totals {
  margin: 0;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: 0.95rem;
  color: var(--color-text-secondary);
}

.tones__caveat,
.map__caveat {
  margin: var(--space-3) 0 0;
  font-family: var(--font-reading);
  font-size: 0.8125rem;
  line-height: 1.7;
  max-width: var(--sg-measure-wide);
  color: var(--color-text-tertiary);
}

.map + .map {
  margin-top: var(--space-5);
}

.map__head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--space-3) var(--space-4);
  padding: var(--space-4) var(--space-5) var(--space-3);
  border-bottom: 1px solid var(--sg-rule);
}

.map__title {
  margin: 0;
  padding: 0;
  border: none;
  font-size: 1.05rem;
  font-weight: 500;
}

.map__identical {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  color: var(--sg-unasked);
}

.map__totals {
  margin: 0;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: 0.8125rem;
  color: var(--color-text-tertiary);
}

.map__head :deep(.sg-record) {
  margin-left: auto;
}

.map__caveat {
  padding: var(--space-3) var(--space-5) 0;
}

.scroller {
  overflow-x: auto;
}

.banks {
  width: 100%;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
}

.banks th,
.banks td {
  padding: 0.3rem var(--space-5);
  text-align: left;
  vertical-align: baseline;
  border: 0;
  white-space: nowrap;
}

.banks th {
  padding-top: var(--space-3);
  padding-bottom: var(--space-2);
}

.banks tbody tr + tr td {
  border-top: 1px solid var(--sg-rule-soft);
}

.banks__bank,
.banks__count {
  font-size: 0.875rem;
}

.banks__count {
  color: var(--color-text-secondary);
}

/* The ranges are the long column and the only one worth wrapping. */
.banks__programs {
  white-space: normal;
  font-size: 0.8125rem;
  line-height: 1.6;
  color: var(--color-text-secondary);
}

@media (max-width: 640px) {
  .map__head {
    padding: var(--space-3) var(--space-4);
  }
  .map__head :deep(.sg-record) {
    margin-left: 0;
  }
  .map__caveat {
    padding-left: var(--space-4);
    padding-right: var(--space-4);
  }
  .banks th,
  .banks td {
    padding-left: var(--space-4);
    padding-right: var(--space-4);
  }
}
</style>
