<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ClaimComparison, ComparisonRow } from '../composables/useArchive';
import { useArchiveFile } from '../composables/useArchive';
import { useI18n } from '../composables/useI18n';

/**
 * The comparison, row by row, with somewhere to stand.
 *
 * The tallies above this say how many claims came out each way; this is the
 * list behind them. It exists because the tallies answer "how many" and the
 * question a reader arrives with is "which" — which address, and what did the
 * two sides actually say about it.
 *
 * It asserts nothing new. Every row is a claim the block pages already carry,
 * with the same verdict reached in the same place, and the address links to the
 * card that holds the rest of it. What is added here is the ability to ask for
 * one verdict at a time across the whole unit rather than a block at a time.
 *
 * **A facet at a time, never both.** A claim is compared twice and the two fail
 * differently, so the table shows one comparison per row and says which. Put
 * side by side they read as one verdict with two halves, which is the reading
 * the whole page exists to prevent.
 */
const props = defineProps<{ unitId: string }>();

const { t, route } = useI18n();

const { data, error, loading } = useArchiveFile<ClaimComparison>(
  () => `${props.unitId}/comparison.json`,
);

/** The two facets, each naming the column of the document it is read from. */
const FACETS = [
  { key: 'range', stated: 5, measured: 6, verdict: 7 },
  { key: 'initial', stated: 8, measured: 9, verdict: 10 },
] as const;

type Facet = (typeof FACETS)[number];

const facetKey = ref<Facet['key']>('range');
const facet = computed<Facet>(() => FACETS.find((one) => one.key === facetKey.value) ?? FACETS[0]);

/**
 * The verdicts in the order a reader looks for them.
 *
 * A difference first, because it is the one worth going to look at; agreement
 * second, because between them they are the only two entries that are
 * comparisons at all. Everything after is a reason there was nothing to
 * compare, and the list is the same one the tallies are ordered by.
 */
const ORDER = [
  'differs',
  'agrees',
  'qualified',
  'wider than was measured',
  'stated in words rather than as a value',
  'not measured',
  'not stated',
  'not asked',
];

const rows = computed<ComparisonRow[]>(() => data.value?.rows ?? []);

/** How many rows came out each way, for the facet in view. */
const counts = computed(() => {
  const tally = new Map<string, number>();
  for (const row of rows.value) {
    const verdict = row[facet.value.verdict];
    tally.set(verdict, (tally.get(verdict) ?? 0) + 1);
  }
  // `differs` even at zero. A comparison that came out zero is a result, and
  // left out because nothing produced one it reads as a figure nobody
  // computed — which is the opposite of what this page is here to say.
  if (!tally.has('differs')) tally.set('differs', 0);
  return [...tally.entries()].sort(
    ([a], [b]) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99),
  );
});

/** null means every verdict; a value means that one alone. */
const only = ref<string | null>(null);
const query = ref('');

/**
 * What the search matches on.
 *
 * The address, the parameter's name and the address as the document prints it —
 * the three things a reader has in hand when they come here. Not the values: a
 * search for `40` would otherwise return most of the unit.
 */
function matches(row: ComparisonRow, needle: string): boolean {
  return (
    row[0].toLowerCase().includes(needle) ||
    (row[2] ?? '').toLowerCase().includes(needle) ||
    row[1].toLowerCase().includes(needle)
  );
}

const found = computed(() => {
  const needle = query.value.trim().toLowerCase();
  const wanted = only.value;
  return rows.value.filter((row) => {
    if (wanted !== null && row[facet.value.verdict] !== wanted) return false;
    return needle === '' || matches(row, needle);
  });
});

/**
 * How many rows are drawn at once.
 *
 * Nine thousand rows is a second of layout and a page nobody scrolls to the
 * end of. The cap is stated rather than hidden — the count above the table is
 * of everything that matched, and the note under it says how much of that is
 * on screen, so narrowing the filter is offered rather than left to be
 * discovered.
 */
const LIMIT = 250;
const shown = computed(() => found.value.slice(0, LIMIT));

function blockRoute(address: string): string {
  const block = address.slice(0, 5).replace(' ', '-');
  return `${route(`/units/${props.unitId}/map/${block}`)}#${address.replace(/ /g, '-')}`;
}

/**
 * How firmly a verdict is put, for emphasis rather than for colour — the same
 * three kinds the address card sets them in, so a verdict read here and a
 * verdict read there are visibly the same statement.
 */
function verdictKind(verdict: string): string {
  if (verdict === 'differs') return 'differs';
  if (verdict === 'agrees') return 'agrees';
  return 'open';
}

function pick(verdict: string): void {
  only.value = only.value === verdict ? null : verdict;
}

/**
 * Which document a row was read from.
 *
 * The column shows the printed page and nothing else, because a page number is
 * what a reader holding their own copy turns to. Which edition that page is in
 * is the other half of the citation, so it is carried on the cell: with one
 * document read the title on every row would be nine thousand repetitions of
 * the same line, and with two it is the one thing the number alone leaves out.
 */
function titleOf(id: string): string {
  return data.value?.documents.find((candidate) => candidate.id === id)?.title ?? id;
}
</script>

<template>
  <section class="browse sg-panel">
    <h2 class="sg-label browse__title">{{ t('claims.browse') }}</h2>
    <p class="browse__body">{{ t('claims.browseBody') }}</p>

    <p v-if="loading" class="browse__status">{{ t('search.loading') }}</p>
    <p v-else-if="error" class="browse__status">{{ t('common.loadFailed') }}</p>

    <template v-else-if="data">
      <!-- Equal segments: the two labels are different lengths in every
           language, and a selector that resizes under the reader is harder to
           aim at than one whose segments never move. -->
      <nav class="facets sg-sunk" :aria-label="t('claims.facet')">
        <button
          v-for="one in FACETS"
          :key="one.key"
          type="button"
          class="facets__item"
          :class="{ 'facets__item--current': one.key === facetKey }"
          :aria-pressed="one.key === facetKey"
          @click="facetKey = one.key"
        >
          {{ t(`claims.${one.key}`) }}
        </button>
      </nav>

      <!-- The tally, as the filter. A count a reader cannot act on is a figure
           to read past; here the figure is the way in to the rows behind it. -->
      <div class="verdicts">
        <button
          v-for="[verdict, count] in counts"
          :key="verdict"
          type="button"
          class="verdict"
          :class="[
            `verdict--${verdictKind(verdict)}`,
            { 'verdict--on': only === verdict },
          ]"
          :aria-pressed="only === verdict"
          @click="pick(verdict)"
        >
          <span class="verdict__name">{{ t(`claims.verdict.${verdict}`) }}</span>
          <span class="verdict__count sg-readout">{{ count.toLocaleString() }}</span>
        </button>
      </div>

      <div class="find">
        <label class="sg-label" for="comparison-find">{{ t('claims.find') }}</label>
        <input
          id="comparison-find"
          v-model="query"
          class="find__input sg-readout"
          type="search"
          autocomplete="off"
          spellcheck="false"
          :placeholder="t('claims.findPlaceholder')"
        />
      </div>

      <p class="browse__count">
        {{ t('claims.matched', { count: found.length.toLocaleString() }) }}
        <span v-if="found.length > shown.length" class="browse__capped">
          {{ t('claims.showingFirst', { count: LIMIT }) }}
        </span>
      </p>

      <p v-if="found.length === 0" class="browse__empty">{{ t('claims.noneMatched') }}</p>

      <div v-else class="scroller">
        <table class="grid">
          <thead>
            <tr>
              <th class="sg-label" scope="col">{{ t('search.address') }}</th>
              <th class="sg-label" scope="col">{{ t('claims.parameter') }}</th>
              <!-- Named for what each side is rather than for the column it
                   came out of: this is the one table on the site where the
                   document and the unit are read against each other, and the
                   heading is where that is said. -->
              <th class="sg-label" scope="col">{{ t('claims.documentStates') }}</th>
              <th class="sg-label" scope="col">{{ t('claims.archiveMeasured') }}</th>
              <th class="sg-label" scope="col">{{ t('claims.verdictColumn') }}</th>
              <th class="sg-label" scope="col">{{ t('claims.source') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in shown" :key="`${row[0]}-${row[3]}-${row[4]}`">
              <td>
                <a class="grid__address sg-readout" :href="blockRoute(row[0])">{{ row[0] }}</a>
              </td>
              <td class="grid__parameter">{{ row[2] ?? '—' }}</td>
              <td>
                <span v-if="row[facet.stated]" class="sg-readout grid__value">
                  {{ row[facet.stated] }}
                </span>
                <span v-else class="grid__absent">{{ t('claims.verdict.not stated') }}</span>
              </td>
              <td>
                <span v-if="row[facet.measured]" class="sg-readout grid__value">
                  {{ row[facet.measured] }}
                </span>
                <span v-else class="grid__absent">{{ t('address.notMeasured') }}</span>
              </td>
              <td>
                <!-- The short form, with the sentence one hover away. The
                     chips above are the legend and carry it in full; set out
                     again on nine thousand rows the same sentence stops being
                     read and starts being the texture of the column. -->
                <span
                  class="grid__verdict"
                  :class="`grid__verdict--${verdictKind(row[facet.verdict])}`"
                  :title="t(`claims.verdict.${row[facet.verdict]}`)"
                >
                  {{ t(`claims.verdictShort.${row[facet.verdict]}`) }}
                </span>
              </td>
              <td class="grid__page sg-readout" :title="titleOf(row[3])">
                {{ t('claims.page', { page: row[4] }) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>

<style scoped>
.browse {
  padding: var(--space-4) var(--space-5) var(--space-5);
}

.browse__title {
  margin: 0 0 var(--space-3);
}

.browse__body {
  margin: 0 0 var(--space-4);
  max-width: var(--sg-measure-wide);
  font-family: var(--font-reading);
  font-size: 0.85rem;
  line-height: 1.7;
  color: var(--color-text-secondary);
}

.browse__status,
.browse__empty {
  margin: var(--space-4) 0 0;
  font-family: var(--font-reading);
  font-size: 0.85rem;
  color: var(--color-text-tertiary);
}

.facets {
  display: flex;
  gap: 2px;
  padding: 3px;
}

/* A full border and a tint on the chosen segment, never an edge stripe: the
   segment is rounded, and a straight rule down one side of a rounded box reads
   as a mistake at every size. */
.facets__item {
  flex: 1 1 0;
  min-width: 0;
  padding: 0.45rem 0.5rem;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: none;
  font: inherit;
  font-size: 0.8rem;
  line-height: 1.3;
  text-align: center;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: color var(--transition-fast), background var(--transition-fast);
}

.facets__item:hover {
  color: var(--vp-c-brand-1);
  background: color-mix(in srgb, var(--vp-c-brand-1) 6%, transparent);
}

.facets__item--current {
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 28%, transparent);
  background: color-mix(in srgb, var(--vp-c-brand-1) 8%, transparent);
  color: var(--vp-c-brand-1);
}

.verdicts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-4);
}

.verdict {
  display: inline-flex;
  align-items: baseline;
  gap: 0.5rem;
  padding: 0.3rem 0.6rem;
  border: 1px solid var(--sg-rule);
  border-radius: var(--radius-sm);
  background: none;
  font: inherit;
  font-size: 0.78rem;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: border-color var(--transition-fast), background var(--transition-fast);
}

.verdict:hover {
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 40%, transparent);
}

.verdict--on {
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 45%, transparent);
  background: color-mix(in srgb, var(--vp-c-brand-1) 8%, transparent);
  color: var(--vp-c-brand-1);
}

.verdict__count {
  font-size: 0.8rem;
}

.verdict--on .verdict__count {
  color: inherit;
}

/* A difference is the one verdict worth crossing the page for, so it is set
   apart — by weight, never by hue. The four colours mean what the unit did,
   and the relation between a document and a measurement is not one of them. */
.verdict--differs .verdict__name {
  font-weight: 600;
  color: var(--color-text-primary);
}

.find {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  margin-top: var(--space-4);
}

.find__input {
  flex: 1 1 auto;
  min-width: 0;
  max-width: 22rem;
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--sg-rule);
  border-radius: var(--radius-sm);
  background: var(--sg-panel-sunk);
  font-size: 0.85rem;
  letter-spacing: 0.04em;
}

.find__input:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 55%, transparent);
}

.browse__count {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin: var(--space-4) 0 var(--space-2);
  font-size: 0.8rem;
  color: var(--color-text-secondary);
}

.browse__capped {
  color: var(--color-text-tertiary);
}

.scroller {
  overflow-x: auto;
}

.grid {
  width: 100%;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
}

.grid th,
.grid td {
  padding: 0.35rem var(--space-4) 0.35rem 0;
  text-align: left;
  vertical-align: baseline;
  border: 0;
  white-space: nowrap;
  font-size: 0.8125rem;
}

.grid th {
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--sg-rule);
}

.grid tbody tr + tr td {
  border-top: 1px solid var(--sg-rule-soft);
}

.grid tbody tr:hover td {
  background: color-mix(in srgb, var(--vp-c-brand-1) 5%, transparent);
}

.grid__address {
  letter-spacing: 0.05em;
  color: var(--vp-c-brand-1);
  text-decoration: none;
}

.grid__address:hover {
  text-decoration: underline;
}

.grid__parameter {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: var(--color-text-secondary);
}

.grid__value {
  color: var(--color-text-secondary);
}

.grid__absent,
.grid__verdict {
  font-family: var(--font-reading);
  font-size: 0.75rem;
  color: var(--color-text-tertiary);
}

.grid__verdict--agrees {
  color: var(--color-text-secondary);
}

.grid__verdict--differs {
  font-weight: 600;
  color: var(--color-text-primary);
  border-bottom: 1px solid currentColor;
}

.grid__page {
  font-size: 0.72rem;
  color: var(--color-text-muted);
}

@media (max-width: 640px) {
  .browse {
    padding: var(--space-4);
  }
  .facets {
    flex-wrap: wrap;
  }
  .facets__item {
    flex: 1 1 8rem;
  }
  .find {
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-2);
  }
  .find__input {
    max-width: none;
  }
}
</style>
