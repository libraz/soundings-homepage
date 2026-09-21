<script setup lang="ts">
import { computed, ref } from 'vue';
import type { AlgorithmChart, AlgorithmShard } from '../composables/useArchive';
import { useI18n } from '../composables/useI18n';
import RecordLink from './RecordLink.vue';

/**
 * What the model answers at every setting of one byte, as numbers.
 *
 * The table is the code's own output in another form, so it follows the rule the
 * code follows: published for a model the archive's verdict closed and for no
 * other. Below that standing the place the table would take says so, because a
 * rejected law tabulated is the same law published in the form a reader carries
 * away most easily.
 *
 * It holds a row for every byte from 0 to 127 whether or not the law answers
 * there. A byte the law returns no value for is a row saying that, never a
 * skipped row: an absence on this site is rendered as an absence and never as a
 * blank.
 *
 * The third column is the point of the other two. A setting a run actually read
 * cites the record it was read from; everything between two readings is this
 * site's interpolation and says so. Where the map names no readings at all
 * there is nothing to interpolate between, and the column says the values came
 * from the law rather than claiming 128 interpolations between readings that do
 * not exist.
 */
const props = defineProps<{ unitId: string; shard: AlgorithmShard; chart: AlgorithmChart }>();

const { t } = useI18n();

/** The archive's verdict closed this model, and so the numbers it returns are published. */
const published = computed(() => props.shard.standing === 'closed');

const answered = computed(() => new Map(props.chart.series.map(([byte, value]) => [byte, value])));

/** The settings a run actually asked at, where the map names them. */
const read = computed(() => new Set(props.chart.marks.map(([byte]) => byte)));

/**
 * The record a reading was read from, as a path inside the unit's directory.
 *
 * Cut the same way `ByteMapChart` cuts it: a map read from somewhere other than
 * this unit's own records carries no link rather than a link quietly pointing
 * at a directory that does not hold it.
 */
const within = computed(() => {
  const prefix = `data/units/${props.unitId}/`;
  return props.chart.from?.startsWith(prefix) ? props.chart.from.slice(prefix.length) : null;
});

interface Row {
  byte: number;
  /** What the law returns, as the map carried it, or null where it returns nothing. */
  value: string | null;
  source: string;
  /** Whether this row is a reading, and so carries the record that established it. */
  cited: boolean;
}

const rows = computed<Row[]>(() =>
  Array.from({ length: 128 }, (_unused, byte) => {
    const value = answered.value.get(byte);
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return { byte, value: null, source: t('algorithms.table.noValue'), cited: false };
    }
    if (!props.chart.marks.length) {
      return { byte, value: String(value), source: t('algorithms.modelCurve'), cited: false };
    }
    const measured = read.value.has(byte);
    return {
      byte,
      value: String(value),
      source: measured ? t('algorithms.table.measured') : t('algorithms.table.interpolated'),
      cited: measured,
    };
  }),
);

/**
 * The same three columns, tab-separated.
 *
 * A reading carries the path of the record behind it rather than only the
 * wording, because the citation is what the column is for and a table pasted
 * into a sheet has no link left to follow.
 */
const tsv = computed(() => {
  const head = [
    t('algorithms.table.byte'),
    t('algorithms.table.value'),
    t('algorithms.table.source'),
  ].join('\t');
  const body = rows.value.map((row) => {
    const source =
      row.cited && props.chart.from ? `${row.source} — ${props.chart.from}` : row.source;
    return [String(row.byte), row.value ?? '—', source].join('\t');
  });
  return [head, ...body].join('\n');
});

const copied = ref(false);

async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(tsv.value);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 1600);
  } catch {
    // A refused clipboard is the browser's decision, and the table is on the
    // page to be selected. Nothing is worth saying about it.
  }
}
</script>

<template>
  <div class="numbers sg-sunk">
    <p v-if="!published" class="numbers__none">{{ t('algorithms.table.notClosed') }}</p>

    <!-- Closed by default: the reader came for the figure, and 128 rows opened
         under every chart is the page the figure was drawn to replace. -->
    <details v-else class="numbers__fold">
      <summary class="numbers__summary">
        <span class="sg-label">{{ chart.section }} · {{ chart.of }}</span>
        <span class="sg-readout numbers__span">0–127</span>
      </summary>

      <div class="numbers__actions">
        <button type="button" class="numbers__copy" @click="copy">
          {{ copied ? t('algorithms.copied') : t('algorithms.table.copyTsv') }}
        </button>
      </div>

      <div class="numbers__scroll">
        <table class="numbers__grid">
          <thead>
            <tr>
              <th scope="col" class="sg-label">{{ t('algorithms.table.byte') }}</th>
              <th scope="col" class="sg-label">{{ t('algorithms.table.value') }}</th>
              <th scope="col" class="sg-label">{{ t('algorithms.table.source') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.byte">
              <td class="sg-readout numbers__byte">{{ row.byte }}</td>
              <td class="sg-readout numbers__value">{{ row.value ?? '—' }}</td>
              <td class="numbers__source">
                {{ row.source }}
                <RecordLink v-if="row.cited && within" :unit-id="unitId" :path="within" compact />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  </div>
</template>

<style scoped>
.numbers {
  padding: var(--space-3) var(--space-4);
}

.numbers__none {
  margin: 0;
  font-size: 0.8rem;
  line-height: 1.7;
  color: var(--color-text-secondary);
}

.numbers__summary {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
  cursor: pointer;
  list-style: none;
}

.numbers__summary::-webkit-details-marker {
  display: none;
}

.numbers__span {
  font-size: 0.72rem;
  color: var(--color-text-tertiary);
}

.numbers__actions {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--space-3);
}

.numbers__copy {
  padding: 0.2rem 0.6rem;
  border: 1px solid var(--sg-rule);
  border-radius: var(--radius-sm);
  background: var(--sg-panel);
  font-family: var(--font-mono);
  font-size: 0.66rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-secondary);
  cursor: pointer;
}

.numbers__copy:hover {
  color: var(--vp-c-brand-1);
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 40%, transparent);
}

/* 128 rows are read a few at a time, so the table scrolls inside the panel
   rather than pushing the rest of the claim off the screen. */
.numbers__scroll {
  margin-top: var(--space-2);
  max-height: 22rem;
  overflow: auto;
}

/* Every rule below is written against the scoped attribute as well as a class,
   because `.vp-doc table` and `.vp-doc tr:nth-child(2n)` outrank a bare one and
   would stripe the rows in a tone this panel does not use. */
.numbers__grid {
  width: 100%;
  margin: 0;
  border-collapse: collapse;
  display: table;
}

.numbers__grid tr {
  background: transparent;
  border: 0;
}

.numbers__grid th,
.numbers__grid td {
  padding: 0.24rem var(--space-3) 0.24rem 0;
  border: 0;
  border-bottom: 1px solid var(--sg-rule-soft);
  text-align: left;
  vertical-align: baseline;
  font-size: 0.74rem;
}

.numbers__grid thead th {
  position: sticky;
  top: 0;
  background: var(--sg-panel-sunk);
  border-bottom: 1px solid var(--sg-rule);
}

.numbers__byte,
.numbers__value {
  white-space: nowrap;
}

.numbers__byte {
  color: var(--color-text-tertiary);
}

.numbers__source {
  color: var(--color-text-secondary);
  line-height: 1.5;
}
</style>
