<script setup lang="ts">
import { computed } from 'vue';
import type { ClaimSummary } from '../composables/useArchive';
import { unit as findUnit, useArchiveFile } from '../composables/useArchive';
import { useI18n } from '../composables/useI18n';
import ComparisonBrowser from './ComparisonBrowser.vue';
import DocumentLink from './DocumentLink.vue';

/**
 * What every document read for this unit came to, in one place.
 *
 * The per-address comparison lives on the block pages, where a claim sits
 * beside the measurement it is about. This is the view that is only visible
 * from above: how much of the document has been read, how much of the map it
 * reaches, and — the part worth the page — the rows it states that nothing has
 * ever been measured against.
 *
 * It asserts nothing the block pages do not. Every figure here is a count of
 * claims that each carry their own citation, and the two lists at the bottom
 * are the document speaking, not the unit.
 */
const props = defineProps<{ unitId: string }>();

const { t, stated, statedIsQuoted, route } = useI18n();

const { data, error, loading } = useArchiveFile<ClaimSummary>(() => `${props.unitId}/claims.json`);

const held = computed(() => findUnit(props.unitId));

/**
 * The verdicts in the order a reader looks for them.
 *
 * Agreement and disagreement first because they are the only two that are
 * comparisons; everything after is a reason there was nothing to compare, and
 * those are ordered by how much of the map they account for.
 */
const ORDER = [
  'agrees',
  'differs',
  'qualified',
  'wider than was measured',
  'stated in words rather than as a value',
  'not measured',
  'not stated',
  'not asked',
];

/**
 * A facet's verdicts, with the two comparisons always present.
 *
 * `agrees` and `differs` are the only entries that are comparisons, and a
 * comparison that came out zero is a result. Left out because no claim produced
 * one, `differs` reads as a figure nobody computed rather than as none found —
 * which is the opposite of what the page is here to say.
 */
function tally(counts: Record<string, number> | undefined) {
  if (!counts) return [];
  const rows = { agrees: 0, differs: 0, ...counts };
  return Object.entries(rows).sort(
    ([a], [b]) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99),
  );
}

/** The three facets a claim is compared on, each with its own tally. */
const facets = computed(() => {
  const counts = data.value?.counts;
  if (!counts) return [];
  return [
    { key: 'range', label: t('claims.range'), rows: tally(counts.range) },
    { key: 'initial', label: t('claims.initial'), rows: tally(counts.initial) },
    { key: 'resets', label: t('claims.resets'), rows: tally(counts.resets) },
  ].filter((facet) => facet.rows.length > 0);
});

/**
 * How far into the map the documents reach.
 *
 * Two figures rather than a percentage: a block a document says nothing about
 * is not a gap in the document, and the ratio would read as one.
 */
const reach = computed(() => {
  if (!data.value || !held.value) return null;
  return { reached: data.value.blocks.length, blocks: held.value.blocks.length };
});

const differs = computed(
  () => data.value?.byBlock.reduce((total, block) => total + block.differs, 0) ?? 0,
);

function documentOf(id: string) {
  return data.value?.documents.find((candidate) => candidate.id === id);
}

function blockRoute(block: string): string {
  return route(`/units/${props.unitId}/map/${block.replace(' ', '-')}`);
}

/** How many blocks a row would reach before the ends stand for the rest. */
const SHOWN = 4;

/**
 * The blocks a row would reach, as somewhere to go rather than as a list.
 *
 * A row whose middle byte is a letter states the same thing about every part,
 * which is twenty blocks for the drum setup rows. Printed in full they overrun
 * the parameter beside them and are read by nobody; printed as a count alone
 * they leave the reader nowhere to go. So: the ends, and the count between.
 */
function reachOf(blocks: string[]) {
  if (blocks.length <= SHOWN) return { links: blocks, elided: 0 };
  return { links: [blocks[0], blocks[blocks.length - 1]], elided: blocks.length };
}
</script>

<template>
  <section class="claims">
    <p v-if="loading" class="claims__status">{{ t('search.loading') }}</p>
    <p v-else-if="error" class="claims__status">{{ t('claims.noneRead') }}</p>

    <template v-else-if="data">
      <!--
        Which document, then what came of it, then what kind of claim any of it
        is. The rule used to open the page, and a reader arriving to find out
        whether the manual matches met a paragraph of epistemology before a
        single figure. It is still here, in the one place it is actually needed
        — under the verdicts it governs — rather than in front of them.
      -->
      <section class="documents sg-panel">
        <h2 class="sg-label documents__title">{{ t('claims.read') }}</h2>
        <article v-for="document in data.documents" :key="document.id" class="document">
          <p class="document__title">{{ document.title }}</p>
          <p class="document__imprint">
            {{ [document.publisher, document.printing, `© ${document.copyright}`]
              .filter(Boolean)
              .join(' · ') }}
          </p>
          <p class="document__pages">
            <span class="sg-readout">
              {{ t('claims.pagesRead', { read: document.pagesRead, pages: document.pages }) }}
            </span>
            <span v-if="reach" class="sg-readout">
              {{ t('claims.blocksReached', reach) }}
            </span>
          </p>
        </article>
        <p class="documents__note">{{ t('claims.notHosted') }}</p>
      </section>

      <!--
        Achromatic on purpose. The four colours mean what the unit did, and a
        verdict here is a relation between two statements rather than something
        the unit was heard or refused to do.
      -->
      <section class="found sg-panel">
        <h2 class="sg-label found__title">{{ t('claims.found') }}</h2>
        <p class="found__body">
          {{ differs === 0 ? t('claims.noneDiffer') : t('claims.someDiffer', { count: differs }) }}
        </p>
        <div class="facets">
          <div v-for="facet in facets" :key="facet.key" class="facet sg-sunk">
            <h3 class="sg-label">{{ facet.label }}</h3>
            <dl class="facet__rows">
              <template v-for="[verdict, count] in facet.rows" :key="verdict">
                <dt>{{ t(`claims.verdict.${verdict}`) }}</dt>
                <dd class="sg-readout">{{ count.toLocaleString() }}</dd>
              </template>
            </dl>
          </div>
        </div>

        <details class="rule">
          <summary class="rule__summary">{{ t('claims.ruleTitle') }}</summary>
          <p class="rule__body">{{ t('claims.rule') }}</p>
        </details>
      </section>

      <!--
        The rows behind the tallies. A count of how many claims came out each
        way answers how many and not which, and which is the question a reader
        arrives with; this is where a verdict can be picked and the addresses
        that produced it read.
      -->
      <ComparisonBrowser :unit-id="unitId" />

      <!--
        The strongest thing this site says about a document, and the reason the
        page is worth having: rows it states that no measurement has ever been
        held against. Grouped as the document prints them, because the printed
        row is the thing somebody would go and measure.
      -->
      <section v-if="data.absentRows.length" class="absent sg-panel">
        <h2 class="sg-label absent__title">{{ t('claims.absent') }}</h2>
        <p class="absent__body">
          {{ t('claims.absentSummary', {
            rows: data.absentRows.length,
            addresses: data.counts.absent.toLocaleString(),
          }) }}
        </p>
        <div class="scroller">
          <table class="grid">
            <thead>
              <tr>
                <th class="sg-label" scope="col">{{ t('claims.printedAs') }}</th>
                <th class="sg-label" scope="col">{{ t('claims.parameter') }}</th>
                <th class="sg-label" scope="col">{{ t('claims.range') }}</th>
                <th class="sg-label" scope="col">{{ t('claims.initial') }}</th>
                <th class="sg-label" scope="col">{{ t('claims.wouldReach') }}</th>
                <th class="sg-label" scope="col">{{ t('claims.source') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in data.absentRows" :key="`${row.d}-${row.page}-${row.t}`">
                <td class="sg-readout">{{ row.t }}</td>
                <!--
                  A row the page gives no columns of its own — the second byte
                  of a parameter stated on the line above — says that instead of
                  standing as three dashes, which would read as a document that
                  stated nothing rather than one that stated it a line earlier.
                -->
                <td v-if="!row.parameter && row.why" colspan="3">
                  <!-- The width lives on the span: a max-width on a table cell
                       is advice the auto layout is free to ignore, and it does. -->
                  <span class="grid__why" :class="{ 'sg-quoted': statedIsQuoted(row.why) }">
                    {{ stated(row.why) }}
                  </span>
                </td>
                <template v-else>
                  <td class="grid__parameter">{{ row.parameter ?? '—' }}</td>
                  <td class="sg-readout grid__figure">{{ row.data ?? '—' }}</td>
                  <td class="sg-readout grid__figure">{{ row.default ?? '—' }}</td>
                </template>
                <td class="grid__blocks">
                  <template v-for="(block, at) in reachOf(row.blocks).links" :key="block">
                    <!-- An ellipsis between the ends, or two block numbers read
                         as one six-byte address. -->
                    <span v-if="at > 0 && reachOf(row.blocks).elided" class="grid__through">…</span>
                    <a :href="blockRoute(block)" class="sg-readout">{{ block }}</a>
                  </template>
                  <span v-if="reachOf(row.blocks).elided" class="grid__elided">
                    {{ t('claims.blocksInAll', { count: reachOf(row.blocks).elided }) }}
                  </span>
                </td>
                <td>
                  <DocumentLink
                    v-if="documentOf(row.d)"
                    :document="documentOf(row.d)!"
                    :page="row.page"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!--
        Notes printed under a table rather than beside a row. None carries a
        verdict, and each says what would have to be measured before it could.
      -->
      <section v-if="data.statements.length" class="notes sg-panel">
        <h2 class="sg-label notes__title">{{ t('claims.tableNotes') }}</h2>
        <p class="notes__body">{{ t('claims.tableNotesBody') }}</p>
        <article v-for="statement in data.statements" :key="statement.id" class="note sg-sunk">
          <p class="note__restated" :class="{ 'sg-quoted': statedIsQuoted(statement.restated) }">
            {{ stated(statement.restated) }}
          </p>
          <dl class="note__facts">
            <dt class="sg-label">{{ t('claims.whatWouldAnswer') }}</dt>
            <dd :class="{ 'sg-quoted': statedIsQuoted(statement.open) }">{{ stated(statement.open) }}</dd>
            <dt class="sg-label">{{ t('claims.howItWasRead') }}</dt>
            <dd :class="{ 'sg-quoted': statedIsQuoted(statement.readAs) }">{{ stated(statement.readAs) }}</dd>
          </dl>
          <p class="note__reach">
            <span class="sg-readout">
              {{ t('claims.reaches', {
                addresses: (statement.reached ?? 0).toLocaleString(),
                blocks: Array.isArray(statement.blocks) ? statement.blocks.length : statement.blocks,
              }) }}
            </span>
            <DocumentLink
              v-if="documentOf(statement.d)"
              :document="documentOf(statement.d)!"
              :page="statement.page"
            />
          </p>
        </article>
      </section>
    </template>

    <p v-else class="claims__status">{{ t('claims.noneRead') }}</p>
  </section>
</template>

<style scoped>
.claims {
  margin-top: var(--space-8);
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.claims__status {
  margin: 0;
  padding: var(--space-4) var(--space-5);
  font-family: var(--font-reading);
  font-size: 0.85rem;
  line-height: 1.7;
  max-width: var(--sg-measure-wide);
  color: var(--color-text-tertiary);
}

/* Folded under the tallies it governs. Its own hairline rather than a panel of
   its own: it belongs to the section above it, and a second panel here read as
   a second finding. */
.rule {
  margin-top: var(--space-5);
  padding-top: var(--space-4);
  border-top: 1px solid var(--sg-rule-soft);
}

.rule__summary {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--vp-c-brand-1);
  cursor: pointer;
  list-style: none;
}

.rule__summary::-webkit-details-marker {
  display: none;
}

.rule__summary::before {
  content: '+';
  display: inline-block;
  width: 1.2em;
  font-size: 1.2em;
  line-height: 1;
  color: var(--color-text-tertiary);
}

.rule[open] > .rule__summary::before {
  content: '−';
}

.rule__body {
  margin: var(--space-3) 0 0;
  max-width: var(--sg-measure-wide);
  font-family: var(--font-reading);
  font-size: 0.85rem;
  line-height: 1.75;
  color: var(--color-text-secondary);
}

.documents,
.found,
.absent,
.notes {
  padding: var(--space-4) var(--space-5) var(--space-5);
}

.documents__title,
.found__title,
.absent__title,
.notes__title {
  margin: 0 0 var(--space-3);
  padding: 0;
  border: none;
}

.document + .document {
  margin-top: var(--space-4);
  padding-top: var(--space-4);
  border-top: 1px solid var(--sg-rule-soft);
}

.document__title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.1rem;
  font-weight: 500;
}

.document__imprint {
  margin: 0.25rem 0 0;
  font-size: 0.8rem;
  color: var(--color-text-tertiary);
}

.document__pages {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-5);
  margin: 0.5rem 0 0;
  font-size: 0.85rem;
}

.documents__note {
  margin: var(--space-4) 0 0;
  max-width: var(--sg-measure-wide);
  font-family: var(--font-reading);
  font-size: 0.78rem;
  line-height: 1.65;
  color: var(--color-text-tertiary);
}

.found__body {
  margin: 0 0 var(--space-4);
  max-width: var(--sg-measure-wide);
  font-family: var(--font-reading);
  font-size: 0.88rem;
  line-height: 1.7;
}

.facets {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-4);
}

.facet {
  padding: var(--space-4);
}

.facet__rows {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.3rem var(--space-4);
  margin: var(--space-3) 0 0;
  align-items: baseline;
}

.facet__rows dt {
  font-size: 0.78rem;
  line-height: 1.5;
  color: var(--color-text-secondary);
}

.facet__rows dd {
  margin: 0;
  font-size: 0.9rem;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.absent__body,
.notes__body {
  margin: 0 0 var(--space-4);
  max-width: var(--sg-measure-wide);
  font-family: var(--font-reading);
  font-size: 0.85rem;
  line-height: 1.7;
  color: var(--color-text-secondary);
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

.grid__parameter {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: var(--color-text-secondary);
}

.grid__figure {
  color: var(--color-text-secondary);
}

.grid__blocks {
  white-space: normal;
}

.grid__blocks a {
  display: inline-block;
  margin: 0 0.5rem 0.15rem 0;
  font-size: 0.75rem;
  letter-spacing: 0.04em;
  color: var(--vp-c-brand-1);
  text-decoration: none;
}

.grid__blocks a:hover {
  text-decoration: underline;
}

.grid__elided {
  font-family: var(--font-reading);
  font-size: 0.72rem;
  color: var(--color-text-tertiary);
}

.grid__through {
  margin-right: 0.5rem;
  color: var(--color-text-tertiary);
}

.grid__why {
  display: inline-block;
  white-space: normal;
  max-width: 28rem;
  font-family: var(--font-reading);
  font-size: 0.75rem;
  line-height: 1.6;
  color: var(--color-text-tertiary);
}

.note {
  padding: var(--space-4);
}

.note + .note {
  margin-top: var(--space-4);
}

.note__restated {
  margin: 0;
  max-width: var(--sg-measure-wide);
  font-family: var(--font-reading);
  font-size: 0.88rem;
  line-height: 1.75;
}

.note__facts {
  display: grid;
  gap: 0.15rem;
  margin: var(--space-4) 0 0;
}

.note__facts dt {
  margin-top: var(--space-3);
}

.note__facts dd {
  margin: 0;
  max-width: var(--sg-measure-wide);
  font-family: var(--font-reading);
  font-size: 0.8rem;
  line-height: 1.65;
  color: var(--color-text-tertiary);
}

.note__reach {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.7rem;
  margin: var(--space-4) 0 0;
  font-size: 0.75rem;
  color: var(--color-text-tertiary);
}

@media (max-width: 640px) {
  .documents,
  .found,
  .absent,
  .notes {
    padding: var(--space-4);
  }
  .grid__blocks a {
    margin-right: 0.35rem;
  }
}
</style>
