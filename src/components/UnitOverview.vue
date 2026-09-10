<script setup lang="ts">
import { computed } from 'vue';
import { unit as findUnit } from '../composables/useArchive';
import { useI18n } from '../composables/useI18n';
import RecordLink from './RecordLink.vue';
import Term from './Term.vue';

/**
 * What was measured, how far it got, and how the measuring itself held up.
 *
 * A unit's own page used to be a masthead and a search box. Every figure here
 * was already in `units.json` and every heading already had a string, so the
 * page a reader landed on from the index answered nothing the header above it
 * had not already said.
 *
 * The one thing this page adds that no other has is a denominator. A block page
 * says an address was not measured; only here does it say how many of the
 * 45,611 were not, which is the difference between an archive that looks
 * finished and one a reader can judge. The bars are the readout's own ink at
 * two strengths rather than a colour: the four hues stand for the four states a
 * measurement can be in, and "how much of the space" is not one of them.
 */
const props = defineProps<{ unitId: string }>();

const { t, route } = useI18n();

const found = computed(() => findUnit(props.unitId));

/** Every figure below is counted across the unit's records, so the whole directory is what establishes it. */
const coverage = computed(() => {
  const counts = found.value?.counts;
  if (!counts) return [];
  const whole = counts.addresses;
  const rows = [
    { key: 'answeredARead', value: whole },
    { key: 'heldAValue', value: counts.withPowerOn },
    { key: 'wasAsked', value: counts.withWriteProbe },
    { key: 'reachedByAMessage', value: counts.withAlias },
    { key: 'wasListenedTo', value: counts.audible + counts.notAudible },
  ];
  return rows.map((row) => ({
    ...row,
    label: t(`unit.${row.key}`),
    // Rounded for the bar only. The figure beside it is the figure; this is how
    // long to draw the mark, and a bar drawn to a tenth of a percent is a bar
    // drawn to a precision nobody can read off it.
    share: whole > 0 ? (row.value / whole) * 100 : 0,
  }));
});

const listened = computed(() => {
  const counts = found.value?.counts;
  if (!counts) return null;
  return t('unit.ofListened', {
    listened: (counts.audible + counts.notAudible).toLocaleString(),
    heard: counts.audible.toLocaleString(),
    notHeard: counts.notAudible.toLocaleString(),
  });
});

/**
 * The stages that produce something the glossary defines, and which entry.
 *
 * Written out rather than matched on the name. A stage and a term can share a
 * word and mean different things: `block/` is the stage that listens to every
 * address of one block, and *block* is the first two bytes of an address — a
 * link between them would send a reader to an entry that does not describe the
 * stage they clicked. A stage missing here is shown plain, which is the right
 * failure.
 */
const STAGE_TERMS: Record<string, string> = {
  sweep: 'sweep',
  boundary: 'boundary',
  'write-probe': 'write-probe',
  'hold-probe': 'hold-probe',
  'window-probe': 'window',
  'reset-probe': 'resets',
  'power-on': 'power-on-value',
  'alias-scan': 'alias',
};

/**
 * The chain and health records as rows.
 *
 * Their keys are the archive's own field names and are left as they were
 * written, the way stimulus names are: renaming them here would be this site
 * naming something the record did not. A long value is a sentence the record
 * wrote about the reading above it, so it takes the full width rather than
 * being squeezed into a value column it would wrap six times inside.
 */
const PROSE_AT = 80;

function rowsOf(table: Record<string, unknown> | null | undefined) {
  if (!table) return [];
  return Object.entries(table).map(([key, value]) => {
    const text = Array.isArray(value) ? value.join(' – ') : String(value);
    return { key, text, prose: typeof value === 'string' && text.length > PROSE_AT };
  });
}

const chain = computed(() => rowsOf(found.value?.measurementChain));
const health = computed(() => rowsOf(found.value?.measurementHealth));
</script>

<template>
  <div v-if="found" class="overview">
    <p class="overview__lede">{{ t('unit.lede') }}</p>

    <section class="panel sg-panel">
      <h2 class="sg-label panel__head">{{ t('unit.coverage') }}</h2>
      <p class="panel__lede">{{ t('unit.coverageLede') }}</p>

      <ul class="bars">
        <li v-for="row in coverage" :key="row.key" class="bar">
          <span class="bar__label">{{ row.label }}</span>
          <span class="bar__value sg-readout">{{ row.value.toLocaleString() }}</span>
          <span class="bar__track" aria-hidden="true">
            <span class="bar__fill" :style="{ inlineSize: `${row.share}%` }" />
          </span>
          <span class="bar__share sg-readout">{{ row.share.toFixed(1) }}%</span>
        </li>
      </ul>

      <p v-if="listened" class="panel__note">{{ listened }}</p>
      <RecordLink :unit-id="unitId" tree />
    </section>

    <section class="panel sg-panel">
      <h2 class="sg-label panel__head">{{ t('unit.stages') }}</h2>
      <p class="panel__lede">{{ t('unit.stagesLede') }}</p>
      <ul class="stages">
        <li v-for="stage in found.stages" :key="stage" class="stages__item sg-readout">
          <Term v-if="STAGE_TERMS[stage]" :name="STAGE_TERMS[stage]">{{ stage }}</Term>
          <template v-else>{{ stage }}</template>
        </li>
      </ul>
      <RecordLink :unit-id="unitId" tree />
    </section>

    <section v-if="chain.length" class="panel sg-panel">
      <h2 class="sg-label panel__head">{{ t('unit.chain') }}</h2>
      <p class="panel__lede">{{ t('unit.chainLede') }}</p>
      <dl class="facts">
        <div v-for="row in chain" :key="row.key" class="fact" :class="{ 'fact--prose': row.prose }">
          <dt class="fact__key">{{ row.key }}</dt>
          <dd class="fact__value" :class="row.prose ? 'fact__value--prose' : 'sg-readout'">
            {{ row.text }}
          </dd>
        </div>
      </dl>
      <RecordLink :unit-id="unitId" path="meta.json" />
    </section>

    <section v-if="health.length" class="panel sg-panel">
      <h2 class="sg-label panel__head">{{ t('unit.health') }}</h2>
      <p class="panel__lede">{{ t('unit.healthLede') }}</p>
      <dl class="facts">
        <div v-for="row in health" :key="row.key" class="fact" :class="{ 'fact--prose': row.prose }">
          <dt class="fact__key">{{ row.key }}</dt>
          <dd class="fact__value" :class="row.prose ? 'fact__value--prose' : 'sg-readout'">
            {{ row.text }}
          </dd>
        </div>
      </dl>
      <RecordLink :unit-id="unitId" path="meta.json" />
    </section>

    <p v-if="found.firstPublished" class="overview__published">
      <span class="sg-label">{{ t('unit.firstPublished') }}</span>
      <span class="sg-readout">{{ found.firstPublished }}</span>
    </p>

    <p class="overview__more">
      <a :href="route(`/units/${found.id}/map`)">{{ t('nav.map') }}</a>
      <a :href="route(`/units/${found.id}/observations`)">{{ t('nav.observations') }}</a>
      <a :href="route('/docs/')">{{ t('landing.readingLink') }}</a>
    </p>
  </div>
</template>

<style scoped>
.overview {
  margin-top: var(--space-6);
}

.overview__lede {
  margin: 0 0 var(--space-6);
  max-width: 46rem;
  font-size: 0.92rem;
  line-height: 1.85;
  color: var(--color-text-secondary);
}

.panel {
  padding: var(--space-5) var(--space-6) var(--space-5);
}

.panel + .panel {
  margin-top: var(--space-5);
}

.panel__head {
  margin: 0;
  border: none;
  padding: 0;
}

.panel__lede {
  margin: var(--space-3) 0 var(--space-5);
  max-width: 44rem;
  font-size: 0.84rem;
  line-height: 1.8;
  color: var(--color-text-tertiary);
}

/* Label, figure, bar, share — four columns so every row's numerals line up and
   the bars all start at the same place. The bar is the last thing given room:
   it says roughly how much, and the figure beside it says exactly. */
.bars {
  list-style: none;
  margin: 0;
  padding: 0;
}

.bar {
  display: grid;
  grid-template-columns: minmax(0, 17rem) 5rem minmax(4rem, 1fr) 3.5rem;
  align-items: center;
  gap: var(--space-4);
  padding: 0.5rem 0;
  border-top: 1px solid var(--sg-rule-soft);
  font-size: 0.85rem;
}

.bar__value,
.bar__share {
  text-align: right;
  font-size: 0.85rem;
}

.bar__share {
  color: var(--color-text-tertiary);
}

/* The readout's own ink at two strengths, not a fifth hue. The track has to be
   visible on its own: a row at 0.2% is a fact about the archive, and a bar with
   no track behind it reads as a row that failed to render. */
.bar__track {
  display: block;
  block-size: 6px;
  border-radius: 1px;
  background: color-mix(in srgb, var(--sg-readout) 9%, transparent);
  overflow: hidden;
}

.bar__fill {
  display: block;
  block-size: 100%;
  background: color-mix(in srgb, var(--sg-readout) 45%, transparent);
}

.panel__note {
  margin: var(--space-4) 0 var(--space-4);
  max-width: 44rem;
  font-size: 0.84rem;
  line-height: 1.8;
  color: var(--color-text-secondary);
}

.stages {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: 0 0 var(--space-4);
  padding: 0;
}

.stages__item {
  padding: 0.22rem 0.55rem;
  font-size: 0.78rem;
  border: 1px solid var(--sg-rule-soft);
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
}

.facts {
  margin: 0 0 var(--space-4);
}

.fact {
  display: grid;
  grid-template-columns: minmax(0, 18rem) minmax(0, 1fr);
  gap: var(--space-4);
  align-items: baseline;
  padding: 0.35rem 0;
  border-top: 1px solid var(--sg-rule-soft);
}

/* A sentence the record wrote about the reading above it. Given the value
   column it wraps six times against a key that is one line, and the pair stops
   reading as one row. */
.fact--prose {
  grid-template-columns: minmax(0, 1fr);
  gap: 0.3rem;
}

/* The archive's own field names, kept as they were written. Uppercased and
   tracked out like a field label they stop being legible as identifiers, so
   they are set as what they are. */
.fact__key {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  letter-spacing: 0.02em;
  color: var(--color-text-tertiary);
  word-break: break-word;
}

.fact__value {
  margin: 0;
  font-size: 0.84rem;
  line-height: 1.6;
  word-break: break-word;
}

.fact__value--prose {
  font-size: 0.82rem;
  line-height: 1.8;
  color: var(--color-text-secondary);
}

.overview__published {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  margin: var(--space-5) 0 0;
  font-size: 0.8rem;
}

.overview__more {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-5);
  margin: var(--space-4) 0 0;
  padding-top: var(--space-4);
  border-top: 1px solid var(--sg-rule-soft);
  font-size: 0.85rem;
}

.overview__more a {
  color: var(--vp-c-brand-1);
  text-decoration: none;
}

.overview__more a::after {
  content: ' →';
}

@media (max-width: 720px) {
  .panel {
    padding: var(--space-4);
  }
  /* The bar is the first thing to go: the figure and the share say the same
     thing exactly, and at this width the track has no room to be read. */
  .bar {
    grid-template-columns: minmax(0, 1fr) 5rem 3.5rem;
    gap: var(--space-3);
  }
  .bar__track {
    display: none;
  }
  .fact {
    grid-template-columns: minmax(0, 1fr);
    gap: 0.2rem;
  }
}
</style>
