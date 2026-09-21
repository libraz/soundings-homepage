<script setup lang="ts">
import { computed } from 'vue';
import type { AlgorithmShard, CitedDocument, PrintedParameter } from '../composables/useArchive';
import { useArchiveFile } from '../composables/useArchive';
import { useI18n } from '../composables/useI18n';
import ArchiveProse from './ArchiveProse.vue';
import DocumentLink from './DocumentLink.vue';
import RecordLink from './RecordLink.vue';

/**
 * What a claim is about, how far it got, and the numbers a reader came for.
 *
 * Every line here is a value the shard already carries. The site states nothing
 * of its own: what the claim is about is the archive's own words for the model
 * it built, and the two axes below are read off `standing` and off the model's
 * own verdict rather than worked out here.
 *
 * The two axes are drawn apart on purpose. A claim the archive stopped standing
 * behind can hold a model that reproduced the readings, and a claim that still
 * stands can hold one that did not; merged into a sentence, one of the two
 * always ends up speaking for the other.
 *
 * The numbers never enter a sentence. Each is a row of its own carrying the
 * model file it was read out of, and the record too where the chart names one,
 * so a figure can always be taken back to what established it.
 */
const props = defineProps<{ unitId: string; shard: AlgorithmShard }>();

const { t, verbatimProse, locale } = useI18n();

/**
 * The effect catalogue, for the unit a document prints against a parameter.
 *
 * A model that does not name the quantity it answers in is not given a name
 * here; the only other thing on this site that states one is a manual, and this
 * is where what a manual printed is carried.
 */
const { data: catalogue } = useArchiveFile<{
  effects: { type: string; parameters: { address: string; printed: PrintedParameter | null }[] }[];
  documents: CitedDocument[];
}>(() => `${props.unitId}/effects.json`);

/** Where the archive's own words stand in for a translation. */
const quoting = computed(() => locale.value !== 'en');

/** A model or inference file, in the archive rather than in a copy of it. */
function archiveHref(path: string): string {
  return `https://github.com/libraz/soundings/blob/main/${path}`;
}

/**
 * A record path as `RecordLink` wants it: relative to the unit's own directory.
 * A chart names the whole path, and the link component builds the rest.
 */
function within(path: string): string {
  const prefix = `data/units/${props.unitId}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

/**
 * What the model says it is about, in the archive's own terms.
 *
 * Thirteen of the models state a class and no `of`. The absent one is said to
 * be absent rather than filled in from the claim around it — the claim is about
 * a structure and the model is about a quantity, and the two are not the same
 * sentence.
 */
const about = computed(() =>
  props.shard.models.map((model) => ({
    path: model.path,
    class: model.class,
    of: model.of,
  })),
);

interface Citation {
  document: CitedDocument;
  page: number;
}

interface Figures {
  id: string;
  label: string | null;
  model: string;
  record: string | null;
  quantity: string;
  quantityStated: boolean;
  /** The pages behind a unit read off a manual, and nothing where it was not. */
  cited: Citation[];
  from: string;
  to: string;
  steps: number;
}

/** Every parameter the catalogue prints, keyed the way the archive names a slot. */
const printed = computed(() => {
  const index = new Map<string, PrintedParameter>();
  for (const effect of catalogue.value?.effects ?? []) {
    for (const parameter of effect.parameters ?? []) {
      if (parameter.printed) index.set(`${effect.type} ${parameter.address}`, parameter.printed);
    }
  }
  return index;
});

/**
 * The parameters a printed unit may be read off.
 *
 * The settings the comparison was run at, where the record names them as a type
 * and an address — those are the parameters the claim's own numbers came from.
 * A claim's addresses are otherwise a union over every type it reaches, and the
 * same address byte is a different parameter under a different type: the byte
 * this unit's delay times are read off is a rate under four of the types the
 * same claim reaches, and the union puts hertz and milliseconds in one set.
 */
const slots = computed(() => {
  const domain = props.shard.reproduces?.domain;
  const settings = domain && typeof domain === 'object' ? domain.settings : null;
  const named =
    settings && typeof settings === 'object'
      ? Object.keys(settings as object).filter((key) => printed.value.has(key))
      : [];
  if (named.length > 0) return named;
  const reached: string[] = [];
  for (const type of props.shard.about.types) {
    for (const address of props.shard.about.addresses) reached.push(`${type} ${address}`);
  }
  return reached;
});

/**
 * The unit a manual prints for what this claim is about.
 *
 * Every slot that states one has to state the same one. Two that disagree are
 * two different parameters, and picking between them would be this site naming
 * a quantity out of a page that is not about it.
 */
const printedUnit = computed<{ unit: string; cited: Citation[] } | null>(() => {
  const stating = slots.value.flatMap((slot) => {
    const parameter = printed.value.get(slot);
    if (!parameter || parameter.unit === null) return [];
    return [{ unit: parameter.unit, page: parameter.page, document: parameter.document }];
  });
  const units = new Set(stating.map((parameter) => parameter.unit));
  if (units.size !== 1) return null;
  const documents = catalogue.value?.documents ?? [];
  const cited: Citation[] = [];
  for (const parameter of stating) {
    const document = documents.find((held) => held.id === parameter.document);
    if (!document) continue;
    if (cited.some((held) => held.document.id === document.id && held.page === parameter.page)) {
      continue;
    }
    cited.push({ document, page: parameter.page });
  }
  // A printed statement carries the edition it was printed in. One that cannot
  // be traced to an edition is not shown at all rather than shown uncited.
  if (cited.length === 0) return null;
  cited.sort((first, second) => first.page - second.page);
  return { unit: [...units][0], cited };
});

const figures = computed<Figures[]>(() =>
  props.shard.charts.map((chart) => {
    const values = chart.series.map(([, value]) => value);
    const stated = chart.quantity === null ? printedUnit.value : null;
    const named = chart.quantity ?? stated?.unit ?? null;
    return {
      id: chart.id,
      label: chart.label ?? chart.of,
      model: chart.model,
      record: chart.from,
      quantity: named ?? t('algorithms.notStated'),
      quantityStated: named !== null,
      cited: stated?.cited ?? [],
      from: String(values[0] ?? ''),
      to: String(values[values.length - 1] ?? ''),
      steps: new Set(values).size,
    };
  }),
);

/**
 * The verdict of the model built from this claim.
 *
 * Only where one was built. A comparison that never ran has no verdict, not
 * even an empty one, and `algorithms.verdict.null` is the sentence for a
 * comparison that ran and carries no verdict yet — a different fact.
 */
const verdict = computed(() => {
  if (!props.shard.reproduces) return null;
  return t(`algorithms.verdict.${props.shard.reproduces.verdict ?? 'null'}`);
});
</script>

<template>
  <section class="summary sg-panel">
    <dl class="rows">
      <div v-if="about.length" class="row" data-row="about">
        <dt class="sg-label">{{ t('algorithms.summary.about') }}</dt>
        <dd class="row__value">
          <p v-for="model in about" :key="model.path" class="about">
            <span class="sg-readout about__class">{{ model.class ?? t('algorithms.notStated') }}</span>
            <ArchiveProse
              v-if="model.of"
              tag="span"
              class="about__of"
              :class="{ 'sg-quoted': quoting }"
              :runs="verbatimProse(model.of)"
            />
            <span v-else class="about__of about__of--absent">{{ t('algorithms.notStated') }}</span>
            <a :href="archiveHref(model.path)" target="_blank" rel="noreferrer" class="about__model">
              {{ model.path }}
            </a>
          </p>
        </dd>
      </div>

      <div class="row" data-row="standing">
        <dt class="sg-label">{{ t('algorithms.summary.standingAxis') }}</dt>
        <dd class="row__value">
          <p class="standing" :class="`standing--${shard.standing}`">
            {{ t(`algorithms.standing.${shard.standing}`) }}
          </p>
          <p class="body">{{ t(`algorithms.standingBody.${shard.standing}`) }}</p>
        </dd>
      </div>

      <div v-if="verdict" class="row" data-row="verdict">
        <dt class="sg-label">{{ t('algorithms.summary.verdictAxis') }}</dt>
        <dd class="row__value">
          <p class="body">{{ verdict }}</p>
        </dd>
      </div>
    </dl>

    <div v-if="figures.length" class="charts">
      <div v-for="figure in figures" :key="figure.id" class="chart sg-sunk" :data-chart="figure.id">
        <p v-if="figure.label" class="sg-readout chart__of">{{ figure.label }}</p>
        <dl class="rows rows--figures">
          <div class="row" data-row="quantity">
            <dt class="sg-label">{{ t('algorithms.summary.quantity') }}</dt>
            <dd class="row__value">
              <span class="sg-readout" :class="{ 'figure--absent': !figure.quantityStated }">
                {{ figure.quantity }}
              </span>
              <DocumentLink
                v-for="cite in figure.cited"
                :key="`${cite.document.id}-${cite.page}`"
                :document="cite.document"
                :page="cite.page"
              />
              <span class="sources">
                <a :href="archiveHref(figure.model)" target="_blank" rel="noreferrer" class="sources__model">
                  {{ figure.model }}
                </a>
                <RecordLink v-if="figure.record" :unit-id="unitId" :path="within(figure.record)" compact />
              </span>
            </dd>
          </div>
          <div class="row" data-row="range">
            <dt class="sg-label">{{ t('algorithms.summary.range') }}</dt>
            <dd class="row__value">
              <span class="sg-readout">{{ figure.from }} – {{ figure.to }}</span>
              <span class="sources">
                <a :href="archiveHref(figure.model)" target="_blank" rel="noreferrer" class="sources__model">
                  {{ figure.model }}
                </a>
                <RecordLink v-if="figure.record" :unit-id="unitId" :path="within(figure.record)" compact />
              </span>
            </dd>
          </div>
          <div class="row" data-row="steps">
            <dt class="sg-label">{{ t('algorithms.summary.steps') }}</dt>
            <dd class="row__value">
              <span class="sg-readout">{{ figure.steps }}</span>
              <span class="sources">
                <a :href="archiveHref(figure.model)" target="_blank" rel="noreferrer" class="sources__model">
                  {{ figure.model }}
                </a>
                <RecordLink v-if="figure.record" :unit-id="unitId" :path="within(figure.record)" compact />
              </span>
            </dd>
          </div>
        </dl>
      </div>
    </div>
  </section>
</template>

<style scoped>
.summary {
  padding: 1.25rem 1.35rem;
  display: grid;
  gap: 1.15rem;
}

.rows {
  display: grid;
  gap: 0.9rem;
  margin: 0;
}

.row {
  display: grid;
  gap: 0.3rem;
}

.row__value {
  margin: 0;
  display: grid;
  gap: 0.35rem;
  font-family: var(--font-reading);
  font-size: 0.875rem;
  line-height: 1.6;
  color: var(--color-text-secondary);
}

.about {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.5em;
}

.about__class {
  font-size: 0.8125rem;
}

.about__of--absent {
  color: var(--color-text-tertiary);
}

.about__model {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--color-text-tertiary);
  text-decoration: underline dotted var(--sg-rule);
  text-underline-offset: 0.28em;
}

/* Ink, at the weight the rest of the panel is set in. Five of the six standings
   are nothing more than what the archive says, and the site's four hues say
   what a *measurement* was, which is a different question. */
.standing {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  letter-spacing: 0.04em;
  color: var(--color-text-secondary);
}

/* The one exception, and the only place this panel spends the accent: a model
   was compared and it closed. It is the same mark the coverage strip and the
   level chip put on the same fact, so the three cannot drift apart. */
.standing--closed {
  color: var(--sg-accent-600);
  font-weight: 500;
}

.body {
  margin: 0;
}

.charts {
  display: grid;
  gap: 0.7rem;
}

.chart {
  padding: 0.85rem 0.95rem;
  display: grid;
  gap: 0.6rem;
}

.chart__of {
  margin: 0;
  font-size: 0.8125rem;
}

.rows--figures {
  gap: 0.55rem;
}

.rows--figures .row__value {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.6em;
}

/* A quantity nobody named is set back, so it does not read as the name. */
.figure--absent {
  color: var(--color-text-tertiary);
  font-size: 0.8125rem;
}

.sources {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.6em;
}

.sources__model {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--color-text-tertiary);
  text-decoration: underline dotted var(--sg-rule);
  text-underline-offset: 0.28em;
}

.sources__model:hover,
.about__model:hover {
  color: var(--vp-c-brand-1);
  text-decoration-color: currentColor;
}
</style>
