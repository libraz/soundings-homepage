<script setup lang="ts">
import { computed, ref } from 'vue';
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

/**
 * One bank and program, looked up across every map select.
 *
 * The catalogue is 1,710 combinations written as ranges across five maps, which
 * is the right shape for reading the whole of it and the wrong shape for the
 * question a reader actually arrives with: is bank 8 program 48 there. Reading
 * that off `48–55, 61–63, 80–81` by eye is the sort of work a page should do.
 *
 * Four answers rather than yes and no, because three different things make a
 * combination absent and only one of them is the unit saying no. A bank the
 * record does not carry is not reported as a part that failed to move: what the
 * archive holds is that no bank of that number answered, and how far the sweep
 * went for it is the map's own caveat to state.
 */
const findBank = ref<string | number>('');
const findProgram = ref<string | number>('');

/**
 * `v-model` on a number field hands back a number, not the text in it, so this
 * takes either. Out of range is read as nothing typed rather than as a question
 * with no answer: 128 is not a program the unit was ever asked for, and saying
 * "the part did not move" about it would be this page answering for the archive.
 */
function reading(typed: string | number): number | null {
  if (typed === '' || typed === null) return null;
  const value = Number(typed);
  if (!Number.isInteger(value) || value < 0 || value > 127) return null;
  return value;
}

const lookup = computed(() => {
  const bankNumber = reading(findBank.value);
  const programNumber = reading(findProgram.value);
  if (bankNumber === null || programNumber === null) return null;
  return (data.value?.maps ?? []).map((map) => {
    const bank = map.banks.find((candidate) => candidate.bank === bankNumber);
    if (!bank) return { mapSelect: map.mapSelect, verdict: 'noBank' };
    const held = bank.programs.some(([from, to]) => programNumber >= from && programNumber <= to);
    if (held) return { mapSelect: map.mapSelect, verdict: 'moved' };
    return { mapSelect: map.mapSelect, verdict: bank.sweptFully ? 'didNotMove' : 'notSwept' };
  });
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

      <!-- Above the tables rather than below them: it is the question, and the
           tables are the whole of the answer for anyone who wants to read it. -->
      <section class="find sg-panel">
        <h2 class="sg-label find__title">{{ t('tones.find') }}</h2>
        <div class="find__fields">
          <label class="find__field">
            <span class="sg-label">{{ t('tones.bank') }}</span>
            <input
              v-model="findBank"
              class="find__input sg-readout"
              type="number"
              min="0"
              max="127"
              inputmode="numeric"
              autocomplete="off"
            />
          </label>
          <label class="find__field">
            <span class="sg-label">{{ t('tones.program') }}</span>
            <input
              v-model="findProgram"
              class="find__input sg-readout"
              type="number"
              min="0"
              max="127"
              inputmode="numeric"
              autocomplete="off"
            />
          </label>
        </div>

        <!--
          No colour. The four this site uses are the states a measurement of the
          sound can be in, and "a part moved when it was asked for a tone" is
          not one of them; a difference in weight says which answer is the unit
          having done something.
        -->
        <ul v-if="lookup" class="find__answers">
          <li v-for="row in lookup" :key="row.mapSelect" class="find__answer">
            <span class="find__map">{{ t('tones.mapSelect', { n: row.mapSelect }) }}</span>
            <span
              class="find__verdict"
              :class="{ 'find__verdict--moved': row.verdict === 'moved' }"
            >
              {{ t(`tones.${row.verdict}`) }}
            </span>
          </li>
        </ul>
        <p v-else class="find__hint">{{ t('tones.findHint') }}</p>
      </section>

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

.find {
  margin-bottom: var(--space-5);
  padding: var(--space-4) var(--space-5) var(--space-5);
}

.find__title {
  margin: 0 0 var(--space-4);
  border: none;
  padding: 0;
}

.find__fields {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
}

.find__field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

/* Wide enough for three digits and the platform's spinner, and no wider: two
   number fields side by side that each take a third of the panel read as a
   form rather than as a pair of small dials. */
.find__input {
  width: 7rem;
  padding: 0.45rem 0.6rem;
  font-size: 1rem;
  letter-spacing: 0.06em;
  color: var(--color-text-primary);
  background: var(--sg-panel);
  border: 1px solid var(--sg-rule);
  border-radius: var(--radius-sm);
}

.find__input:focus {
  outline: none;
  border-color: var(--vp-c-brand-1);
}

.find__answers {
  list-style: none;
  margin: var(--space-4) 0 0;
  padding: 0;
  border-top: 1px solid var(--sg-rule-soft);
}

.find__answer {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.5rem var(--space-4);
  padding: 0.4rem 0;
  border-bottom: 1px solid var(--sg-rule-soft);
  font-size: 0.85rem;
}

.find__map {
  min-width: 9rem;
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: var(--color-text-tertiary);
}

.find__verdict {
  color: var(--color-text-tertiary);
}

.find__verdict--moved {
  font-weight: 600;
  color: var(--color-text-primary);
}

.find__hint {
  margin: var(--space-4) 0 0;
  max-width: var(--sg-measure-wide);
  font-family: var(--font-reading);
  font-size: 0.8rem;
  line-height: 1.7;
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

/* The ranges are the long column and the only one worth wrapping — written as
   `td.banks__programs` because `.banks td` above is a class and an element and
   outranks a class on its own, so the `nowrap` there won and a bank of ninety
   programs ran off the right edge of the row instead of wrapping inside it. */
td.banks__programs {
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
