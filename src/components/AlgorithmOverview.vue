<script setup lang="ts">
import { computed, ref } from 'vue';
import type { AlgorithmLevel, AlgorithmLine, AlgorithmSummary } from '../composables/useArchive';
import { useArchiveFile } from '../composables/useArchive';
import { useI18n } from '../composables/useI18n';
import ClaimTitle from './ClaimTitle.vue';
import LevelChip from './LevelChip.vue';

/**
 * Where identification has reached across one unit, and every claim behind it.
 *
 * The detail pages hold one claim each, with its evidence and its curves. This
 * is the view that is only visible from above: how much of the unit's effect set
 * has had the algorithm behind it identified, how much has a claim that has not
 * closed, and how much nobody has claimed anything about at all.
 *
 * It asserts nothing the detail pages do not. Every figure is a count of claims
 * that each carry their own grounds, and the level on each line is the archive's
 * own state and its own verdict rather than a reading taken here.
 */
const props = defineProps<{ unitId: string }>();

const { t, claimed, claimedIsQuoted, route } = useI18n();

const { data, error, loading } = useArchiveFile<AlgorithmSummary>(
  () => `${props.unitId}/algorithms.json`,
);

/**
 * The effect catalogue, for the denominator the claims are counted against and
 * for the name a document prints each type as. Sixty-five two-byte codes are
 * not a map anybody can read; the same sixty-five with the manual's own names
 * on them are the list a reader came here holding.
 */
const { data: effects } = useArchiveFile<{
  effects: { type: string; printed: { name: string; page: number } | null }[];
}>(() => `${props.unitId}/effects.json`);

/** The order the tally reads in: what closed, then what is still open. */
const ORDER: AlgorithmLevel[] = [
  'identified',
  'investigating',
  'parked',
  'retracted',
  'superseded',
];

const tally = computed(() => {
  const counts = data.value?.counts;
  if (!counts) return [];
  // The two live levels are always shown, zero or not. Left out because nothing
  // reached it, `identified` reads as a level nobody defined rather than as one
  // nothing has got to yet — which is the opposite of what this band is for.
  return ORDER.filter(
    (level) => level === 'identified' || level === 'investigating' || counts[level] > 0,
  ).map((level) => ({ level, value: counts[level] ?? 0 }));
});

/**
 * One cell per insertion effect type, at what the claims reaching it add up to.
 *
 * Four marks and not two, because two of them cannot tell apart a type nothing
 * is open on from a type one byte closed on. A claim is about a handful of
 * addresses, and one claim can reach twenty-one types: the rate table alone
 * fills twenty-one of these cells, and it is one byte. A cell at full strength
 * earned that way would say the type was identified when what closed is a
 * single parameter of it, so the middle step carries "some claim here closed"
 * and full strength is kept for a type with nothing still open. Nothing on this
 * unit reaches full strength yet, and that is the honest reading rather than a
 * gap in the data.
 */
/** Every claim that reaches a type, the ones that closed first. */
const claimsByType = computed(() => {
  const held = new Map<string, AlgorithmLine[]>();
  for (const line of data.value?.inferences ?? []) {
    for (const type of line.types) {
      const list = held.get(type) ?? [];
      list.push(line);
      held.set(type, list);
    }
  }
  for (const list of held.values()) {
    list.sort((a, b) => Number(b.level === 'identified') - Number(a.level === 'identified'));
  }
  return held;
});

const strip = computed(() => {
  const all = effects.value?.effects ?? [];
  if (all.length === 0) return [];
  return all.map((effect) => {
    const claims = claimsByType.value.get(effect.type) ?? [];
    const identified = claims.filter((line) => line.level === 'identified').length;
    const state =
      claims.length === 0
        ? 'absent'
        : identified === 0
          ? 'claimed'
          : identified === claims.length
            ? 'identified'
            : 'partial';
    return {
      type: effect.type,
      name: effect.printed?.name ?? null,
      state,
      claims: claims.length,
      // Every cell goes somewhere. A map whose filled cells are the whole point
      // of the page and cannot be opened is a picture of an index rather than
      // one: a type some claim reaches opens the claim that got furthest, and a
      // type none reaches opens what *was* measured of it, which is the honest
      // answer to "and this one?" rather than a dead square.
      href: claims.length
        ? route(`/units/${props.unitId}/algorithms/${claims[0].id}`)
        : route(`/units/${props.unitId}/effects#type-${effect.type.replace(/ /g, '-')}`),
    };
  });
});

const reach = computed(() => {
  const cells = strip.value;
  if (cells.length === 0) return null;
  return {
    total: cells.length,
    claimed: cells.filter((cell) => cell.state !== 'absent').length,
    // Counted apart on purpose. Summed, the two read as one number of types
    // that got somewhere, and the only figure that would answer "how much of
    // this unit is worked out" is the one nothing has reached.
    partial: cells.filter((cell) => cell.state === 'partial').length,
    settled: cells.filter((cell) => cell.state === 'identified').length,
  };
});

const filter = ref<AlgorithmLevel | 'all'>('all');
const query = ref('');

const segments = computed(() => {
  const counts = data.value?.counts;
  if (!counts) return [];
  return [
    { key: 'all' as const, label: t('algorithms.all'), value: counts.total },
    ...tally.value.map((entry) => ({
      key: entry.level,
      label: t(`algorithms.level.${entry.level}`),
      value: entry.value,
    })),
  ];
});

const rows = computed(() => {
  const needle = query.value.trim().toLowerCase();
  return (data.value?.inferences ?? []).filter((line) => {
    if (filter.value !== 'all' && line.level !== filter.value) return false;
    if (!needle) return true;
    const haystack = [
      line.id,
      line.claim ?? '',
      line.named ?? '',
      claimed(line.claim),
      claimed(line.named),
      // The printed names, so a reader searching "phaser" finds the two claims
      // about one — which is the word they have and `01 20` is not.
      ...(line.title?.names ?? []).map((entry) => entry.name),
      ...(line.title?.parameters ?? []).map((entry) => entry.name),
      ...line.types,
      ...line.addresses,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(needle);
  });
});

/**
 * What the row says under its name: the claim's own short name where it has
 * one, and what it claims where it does not.
 *
 * Only where the name above it came from a document. Where it did not, the
 * archive's words are already the heading and repeating them would print the
 * same paragraph twice.
 */
function saysOf(line: AlgorithmLine): string {
  if (!line.title) return '';
  return claimed(line.named) || claimed(line.claim) || '';
}

function saysIsQuoted(line: AlgorithmLine): boolean {
  return claimedIsQuoted(line.named ? line.named : line.claim);
}
</script>

<template>
  <div class="algorithms">
    <p class="algorithms__lede">{{ t('algorithms.lede') }}</p>

    <!-- A full border and a tint, never an edge stripe on a rounded box. -->
    <aside class="rule sg-panel">
      <h2 class="sg-label rule__head">{{ t('algorithms.ruleTitle') }}</h2>
      <p class="rule__body">{{ t('algorithms.rule') }}</p>
      <p class="rule__body">{{ t('algorithms.ruleCode') }}</p>
      <p class="rule__more">
        <a :href="route('/docs/identifying-an-algorithm')">{{ t('algorithms.methodLink') }}</a>
      </p>
    </aside>

    <p v-if="loading && !data" class="algorithms__state">{{ t('common.loading') }}</p>
    <p v-else-if="error" class="algorithms__state">{{ t('common.loadFailed') }}</p>

    <template v-else-if="data">
      <ul class="tally">
        <li v-for="entry in tally" :key="entry.level" class="tally__item">
          <span class="tally__value sg-readout">{{ entry.value }}</span>
          <LevelChip :level="entry.level" />
          <span class="tally__body">{{ t(`algorithms.levelBody.${entry.level}`) }}</span>
        </li>
      </ul>

      <section v-if="reach" class="panel sg-panel">
        <h2 class="sg-label panel__head">{{ t('algorithms.coverage') }}</h2>
        <p class="panel__lede">{{ t('algorithms.coverageLede') }}</p>

        <p class="panel__figure">
          <span class="sg-readout">{{ t('algorithms.reached', reach) }}</span>
          <span class="panel__aside">{{ t('algorithms.closedOn', { count: reach.partial + reach.settled }) }}</span>
          <span class="panel__aside">{{ t('algorithms.settledOn', { count: reach.settled }) }}</span>
        </p>

        <ul class="strip">
          <li v-for="cell in strip" :key="cell.type" class="strip__item">
            <a
              class="strip__link"
              :href="cell.href"
              :title="[cell.type, cell.name, cell.claims || t('algorithms.noClaim')].filter(Boolean).join(' · ')"
            >
              <span class="sg-cell" :class="`sg-cell--${cell.state}`" />
              <span class="strip__type sg-readout">{{ cell.type }}</span>
            </a>
          </li>
        </ul>

        <ul class="sg-key strip__key">
          <li><span class="sg-cell sg-cell--identified" /> {{ t('algorithms.cell.settled') }}</li>
          <li><span class="sg-cell sg-cell--partial" /> {{ t('algorithms.cell.partial') }}</li>
          <li><span class="sg-cell sg-cell--claimed" /> {{ t('algorithms.cell.open') }}</li>
          <li><span class="sg-cell sg-cell--absent" /> {{ t('algorithms.noClaim') }}</li>
        </ul>
      </section>

      <section class="panel sg-panel">
        <h2 class="sg-label panel__head">{{ t('algorithms.claims') }}</h2>
        <p class="panel__lede">{{ t('algorithms.claimsLede') }}</p>

        <!-- Equal segments, because a Japanese label is a different length from
             its English one and a selector that resizes under the reader is
             harder to aim at than one whose segments never move. -->
        <nav class="segments sg-sunk">
          <button
            v-for="segment in segments"
            :key="segment.key"
            type="button"
            class="segments__item"
            :class="{ 'segments__item--current': filter === segment.key }"
            :aria-pressed="filter === segment.key"
            @click="filter = segment.key"
          >
            <span class="segments__label">{{ segment.label }}</span>
            <span class="segments__count sg-readout">{{ segment.value }}</span>
          </button>
        </nav>

        <label class="search">
          <span class="sg-label">{{ t('algorithms.search') }}</span>
          <input
            v-model="query"
            class="search__input sg-readout"
            type="search"
            :placeholder="t('algorithms.searchPlaceholder')"
          />
        </label>

        <ol class="claims">
          <li v-for="line in rows" :key="line.id" class="claim">
            <a class="claim__link" :href="route(`/units/${unitId}/algorithms/${line.id}`)">
              <span class="claim__head">
                <LevelChip :level="line.level" />
                <ClaimTitle :title="line.title" :named="line.named" :claim="line.claim" />
              </span>
              <span
                v-if="saysOf(line)"
                class="claim__says"
                :class="{ 'sg-quoted': saysIsQuoted(line) }"
              >{{ saysOf(line) }}</span>
            </a>

            <!-- The addresses the claim is about and what the page behind it
                 carries, on one line. Set as two, the codes read as a heading
                 for the counts under them and they are not one. -->
            <ul class="badges">
              <li v-if="line.types.length" class="badges__item badges__item--types sg-readout">
                {{ line.types.join('  ') }}
              </li>
              <li v-else class="badges__item badges__item--scope">
                {{ t('algorithms.scope') }}: {{ line.scope }}
              </li>
              <li v-if="line.examples" class="badges__item badges__item--code">
                {{ t('algorithms.example') }}
              </li>
              <li v-if="line.charts" class="badges__item">{{ line.charts }} · {{ t('algorithms.charts') }}</li>
              <li v-if="line.rests.measurements" class="badges__item">
                {{ line.rests.measurements }} · {{ t('algorithms.measurements') }}
              </li>
              <li v-if="line.rests.documentRows" class="badges__item">
                {{ line.rests.documentRows }} · {{ t('algorithms.documentRows') }}
              </li>
              <li v-if="line.alternatives.standing" class="badges__item">
                {{ line.alternatives.standing }} · {{ t('algorithms.stillStanding') }}
              </li>
            </ul>
          </li>
        </ol>

        <p v-if="rows.length === 0" class="algorithms__state">{{ t('algorithms.noneMatch') }}</p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.algorithms {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

/* The site's own measures, not a third one written here. `--sg-measure-wide` is
   the one for a sentence or two introducing a page: read once, under a
   full-width heading and above a full-width panel. */
.algorithms__lede {
  margin: 0;
  max-width: var(--sg-measure-wide);
  font-size: 0.95rem;
  line-height: 1.75;
  color: var(--color-text-secondary);
}

.algorithms__state {
  margin: 0;
  font-size: 0.875rem;
  color: var(--color-text-tertiary);
}

.rule {
  padding: var(--space-4) var(--space-5);
  background: color-mix(in srgb, var(--vp-c-brand-1) 5%, var(--sg-panel));
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 24%, transparent);
}

.rule__head {
  margin-bottom: var(--space-2);
}

.rule__body {
  margin: 0;
  max-width: var(--sg-measure-wide);
  font-size: 0.86rem;
  line-height: 1.75;
  color: var(--color-text-secondary);
}

.rule__body + .rule__body {
  margin-top: 0.7rem;
}

.rule__more {
  margin: var(--space-3) 0 0;
  font-size: 0.82rem;
}

.tally {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
  gap: var(--space-5);
  list-style: none;
  margin: 0;
  padding: 0;
}

.tally__item {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: baseline;
  column-gap: var(--space-3);
  row-gap: 0.35rem;
}

.tally__value {
  grid-row: 1 / 3;
  font-size: 1.9rem;
  line-height: 1;
  font-weight: 500;
}

.tally__body {
  grid-column: 2;
  font-size: 0.78rem;
  line-height: 1.6;
  color: var(--color-text-tertiary);
}

.panel {
  padding: var(--space-5);
}

.panel__head {
  margin-bottom: var(--space-2);
}

.panel__lede {
  margin: 0 0 var(--space-4);
  max-width: var(--sg-measure-wide);
  font-size: 0.82rem;
  line-height: 1.7;
  color: var(--color-text-tertiary);
}

.panel__figure {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-2) var(--space-4);
  margin: 0 0 var(--space-4);
  font-size: 0.9rem;
}

.panel__aside {
  font-size: 0.8rem;
  color: var(--color-text-tertiary);
}

/* A row of marks, not a table. The cell is the size it is on the address map,
   because that is where a reader learnt what a fill and a ring mean; blown up
   to the width of the type code under it, the same mark reads as a tile and the
   strip stops being a map of anything.

   The code sits under each cell because sixty-five unlabelled marks are not
   findable, and it is set small enough that the marks are still what the eye
   lands on. */
.strip {
  display: grid;
  grid-template-columns: repeat(auto-fill, 2.6rem);
  justify-content: start;
  gap: var(--space-2) var(--space-2);
  list-style: none;
  margin: 0 0 var(--space-4);
  padding: 0;
}

/* Every cell is a link. The whole cell-and-code is the target rather than the
   code alone: a one-rem mark is not something to ask anybody to hit. */
.strip__link {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.1rem;
  border-radius: var(--radius-sm);
  text-decoration: none;
  color: inherit;
  transition: background var(--transition-fast);
}

.strip__link:hover,
.strip__link:focus-visible {
  background: color-mix(in srgb, var(--color-text-primary) 8%, transparent);
  text-decoration: none;
}

.strip__link:hover .strip__type,
.strip__link:focus-visible .strip__type {
  color: var(--color-text-primary);
}

.strip__item .sg-cell {
  inline-size: 1rem;
}

.strip__type {
  font-size: 0.58rem;
  letter-spacing: 0.01em;
  color: var(--color-text-muted);
  transition: color var(--transition-fast);
}

.strip__key .sg-cell {
  inline-size: 0.72rem;
  block-size: 0.72rem;
}

.segments {
  display: flex;
  gap: 2px;
  padding: 3px;
  margin-bottom: var(--space-4);
}

.segments__item {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  padding: 0.45rem 0.4rem;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: none;
  font: inherit;
  cursor: pointer;
  color: var(--color-text-secondary);
  transition: color var(--transition-fast), background var(--transition-fast);
}

.segments__label {
  font-size: 0.74rem;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-inline-size: 100%;
}

.segments__count {
  font-size: 0.7rem;
  color: var(--color-text-tertiary);
}

.segments__item:hover {
  color: var(--color-text-primary);
  background: color-mix(in srgb, var(--color-text-primary) 7%, transparent);
}

.segments__item--current {
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 28%, transparent);
  background: color-mix(in srgb, var(--vp-c-brand-1) 8%, transparent);
  color: var(--vp-c-brand-1);
}

.segments__item--current:hover {
  background: color-mix(in srgb, var(--vp-c-brand-1) 14%, transparent);
  color: var(--vp-c-brand-1);
}

.segments__item--current .segments__count {
  color: inherit;
}

.search {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-bottom: var(--space-5);
}

.search__input {
  padding: 0.5rem 0.65rem;
  border: 1px solid var(--sg-rule);
  border-radius: var(--radius-sm);
  background: var(--sg-panel-sunk);
  font-size: 0.85rem;
}

.search__input:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 1px;
}

.claims {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.claim {
  padding: var(--space-4) 0;
  border-top: 1px solid var(--sg-rule-soft);
}

.claim:first-child {
  border-top: none;
  padding-top: 0;
}

/* `align-items` matters here and cost a redraw to find. A column flex container
   stretches its items to its own width, and the chip is one: stretched, it took
   the reading surface's hover underline across the full width of the row, which
   read as a rule that had appeared under the cursor. The items are their own
   width, and the underline is off — this is a row of an index, not a link in a
   sentence, and what says it is live is the title changing colour. */
.claim__link {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.35rem;
  text-decoration: none;
  color: inherit;
}

.claim__link:hover,
.claim__link:focus-visible {
  text-decoration: none;
}

.claim__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.35rem 0.8rem;
  font-size: 1rem;
}

.claim__link:hover .claim__head,
.claim__link:focus-visible .claim__head {
  color: var(--vp-c-brand-1);
}

/* Two lines and no more.
 *
 * Under the manual's name for it sits the claim's own account of itself, and
 * that runs to a paragraph — eleven of the seventeen do, because a claim states
 * a whole structure. Set in full they turned the index into the pages it is
 * meant to be an index of. The whole of it is on the page the line opens.
 */
.claim__says {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  max-width: var(--sg-measure-wide);
  font-family: var(--font-reading);
  font-size: 0.84rem;
  line-height: 1.65;
  color: var(--color-text-tertiary);
}

.badges {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.35rem 0.9rem;
  list-style: none;
  margin: 0.55rem 0 0;
  padding: 0;
}

/* The addresses come first and a shade brighter than the counts beside them:
   they are what the claim is about, and the counts are what the page holds. */
.badges__item--types {
  font-size: 0.72rem;
  letter-spacing: 0.04em;
  color: var(--color-text-tertiary);
}

.badges__item--scope {
  font-family: var(--font-reading);
  font-size: 0.72rem;
  color: var(--color-text-tertiary);
}

.badges__item {
  font-family: var(--font-mono);
  font-size: 0.66rem;
  letter-spacing: 0.04em;
  color: var(--color-text-muted);
}

/* The one badge that says a page carries something a reader can take away. */
.badges__item--code {
  color: var(--vp-c-brand-1);
}

@media (max-width: 640px) {
  .panel {
    padding: var(--space-4);
  }
  .segments {
    flex-wrap: wrap;
  }
  .segments__item {
    flex: 1 1 8rem;
  }
}
</style>
