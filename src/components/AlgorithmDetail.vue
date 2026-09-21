<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { AlgorithmShard } from '../composables/useArchive';
import { useArchiveFile } from '../composables/useArchive';
import { useI18n } from '../composables/useI18n';
import ArchiveProse from './ArchiveProse.vue';
import ByteMapChart from './ByteMapChart.vue';
import ByteTable from './ByteTable.vue';
import ClaimLedger from './ClaimLedger.vue';
import ClaimSummary from './ClaimSummary.vue';
import ClaimTitle from './ClaimTitle.vue';
import DocumentLink from './DocumentLink.vue';
import LevelChip from './LevelChip.vue';
import RecordLink from './RecordLink.vue';

/**
 * One claim about what is behind the measurements, in full.
 *
 * The page is ordered by what a reader came for. What the claim is about and
 * how far it got, then the ledger of what was checked and what was not, then
 * the figures with the numbers behind them, then the implementation. The
 * archive's own argument — the claim at length, the comparison in detail, the
 * evidence, the readings still standing — sits below all of that, folded shut.
 *
 * **Folding is not shortening.** Every word the record wrote is inside, in the
 * order it wrote it; what changes is that a reader chooses to meet it. A
 * `<summary>` says how much each fold holds, as a count rather than a sentence,
 * so the page does not describe its own contents at length in the act of
 * putting them away.
 *
 * Two languages sit on this page and the seam between them is marked rather
 * than hidden. The four short statements — what it claims, what it is called,
 * what it adds, what would show it wrong — are translated. The paragraphs under
 * them are the archive arguing in its own voice and are revised as the reading
 * goes on, so they are shown as written, inside the same quotation rule the
 * rest of the site uses for an untranslated record.
 */
const props = defineProps<{ unitId: string; id: string }>();

const { t, claimedIsQuoted, claimedProse, verbatimProse, route, locale } = useI18n();

const { data, error, loading } = useArchiveFile<AlgorithmShard>(
  () => `${props.unitId}/algorithms/${props.id}.json`,
);

/** Where the archive's own words are shown rather than translated. */
const quoting = computed(() => locale.value !== 'en');

/**
 * The edition the printed name in the heading was read from.
 *
 * A name off a page is a statement a document makes, and every one of those on
 * this site says which edition and which page. It is not a link: the document is
 * not this project's to publish.
 */
const printedIn = computed(() => {
  const title = data.value?.title;
  if (!title) return null;
  const document = (data.value?.documents ?? []).find((entry) => entry.id === title.document);
  if (!document) return null;
  return { document, page: title.names[0]?.page ?? 0 };
});

/** An insertion effect type, in the catalogue of what was measured of it. */
function typeHref(type: string): string {
  return route(`/units/${props.unitId}/effects#type-${type.replace(/ /g, '-')}`);
}

function addressHref(address: string): string {
  const block = address.slice(0, 5).replace(' ', '-');
  return route(`/units/${props.unitId}/map/${block}#${address.replace(/ /g, '-')}`);
}

/** A model or inference file, in the archive rather than in a copy of it. */
function archiveHref(path: string): string {
  return `https://github.com/libraz/soundings/blob/main/${path}`;
}

const copied = ref<string | null>(null);

async function copy(code: string, key: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(code);
    copied.value = key;
    setTimeout(() => {
      if (copied.value === key) copied.value = null;
    }, 1600);
  } catch {
    // A refused clipboard is the browser's decision, and the code is on the
    // page to be selected. Nothing is worth saying about it.
  }
}

/** A residual's figures, where it carries the ones the schema asks for. */
const residual = computed(() => {
  const held = data.value?.reproduces?.residual as Record<string, unknown> | null | undefined;
  if (!held || typeof held.median !== 'number') return null;
  return {
    median: held.median as number,
    worst: held.worst as number,
    unit: String(held.unit ?? ''),
    structured: held.structured === true,
    why: typeof held.why === 'string' ? held.why : null,
  };
});

/**
 * Everything else the residual carried.
 *
 * Several classes record it in their own shape — per side, per address, read one
 * way and also another — and a reader that only understood the schema's three
 * fields would drop them. They are the record's own words and are shown as such.
 */
const residualExtra = computed(() => {
  const held = data.value?.reproduces?.residual as Record<string, unknown> | null | undefined;
  if (!held) return [];
  const own = ['median', 'worst', 'unit', 'structured', 'why'];
  return Object.entries(held)
    .filter((entry) => !own.includes(entry[0]))
    .map(([key, value]) => ({
      key: key.replace(/_/g, ' '),
      prose: typeof value === 'string' ? value : null,
      // A residual recorded per side or per address is a handful of figures, and
      // set as a block of JSON it reads as something that failed to render. Flat
      // enough to be rows, it is shown as rows; anything deeper keeps its own
      // shape rather than being flattened into something it is not.
      rows: flat(value),
      text: JSON.stringify(value, null, 2),
    }));
});

/** A flat object of figures as rows, or null where it is anything else. */
function flat(value: unknown): { key: string; text: string }[] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.some(([, held]) => held !== null && typeof held === 'object')) return null;
  return entries.map(([key, held]) => ({ key: key.replace(/_/g, ' '), text: String(held) }));
}

/**
 * Why the residual leans the way it does, read apart from the figures.
 *
 * Several classes record the figures under their own names and carry the same
 * `why` beside them. Read only off the shape the schema asks for, that sentence
 * would be on the page for some claims and gone for others — and a sentence the
 * record wrote that no page shows is the one thing this site may not do.
 */
const residualWhy = computed(() => {
  const held = data.value?.reproduces?.residual as Record<string, unknown> | null | undefined;
  return held && typeof held.why === 'string' ? held.why : null;
});

const domain = computed(() => {
  const held = data.value?.reproduces?.domain as Record<string, unknown> | null | undefined;
  if (!held) return null;
  return {
    settings: Object.entries((held.settings ?? {}) as Record<string, unknown>).map(
      ([key, value]) => ({
        key,
        text: Array.isArray(value) ? value.join(', ') : String(value),
      }),
    ),
    stimulus: (held.stimulus ?? []) as string[],
    outside: typeof held.outside === 'string' ? held.outside : null,
  };
});

/** What a published implementation is, and what nothing here checked about it. */
const CODE_STATUS = ['generatedFrom', 'arithmetic', 'checkedBy', 'notComparedWithHardware'];

/**
 * How much each folded section holds.
 *
 * A count rather than a description: the summary line of a fold is read while
 * deciding whether to open it, and a sentence there is the same paragraph the
 * fold was closed to put away. Each is the number of separate things inside —
 * statements, records, gates, readings — so two folds of the same size read as
 * the same size.
 */
const statements = computed(() => {
  const held = data.value;
  if (!held) return 0;
  return [
    held.claim,
    held.named ?? held.whyNotNamed,
    held.adds,
    held.refutedBy,
    held.couldHaveBeenRefutedBy,
  ].filter((sentence) => typeof sentence === 'string' && sentence.length > 0).length;
});

const reproduced = computed(() => {
  const held = data.value?.reproduces;
  if (!held) return 0;
  return (
    (data.value?.models.length ?? 0) +
    (held.comparedAgainst.records.length > 0 ? 1 : 0) +
    (domain.value ? 1 : 0) +
    (residual.value || residualWhy.value ? 1 : 0) +
    residualExtra.value.length +
    held.gates.length
  );
});

const grounded = computed(() => {
  const held = data.value?.grounds;
  if (!held) return 0;
  return (
    held.measurements.length +
    held.documentRows.length +
    held.eraPriors.length +
    held.community.length
  );
});

/**
 * A fragment that lands inside a fold opens it.
 *
 * Safari and Firefox scroll to a target inside a closed `<details>` without
 * opening it, so the ledger's links into the sections below would land a reader
 * on a shut fold and nothing else. Every ancestor of the target is opened, on
 * arrival and on every later change of the fragment, because the first is a
 * link followed from another page and the second is one followed from this one.
 */
function openTo(fragment: string): void {
  if (typeof document === 'undefined' || fragment.length < 2) return;
  const target = document.getElementById(decodeURIComponent(fragment.slice(1)));
  if (!target) return;
  for (let node: Element | null = target; node; node = node.parentElement) {
    if (node.tagName === 'DETAILS') node.setAttribute('open', '');
  }
  target.scrollIntoView?.();
}

function openToHash(): void {
  if (typeof window !== 'undefined') openTo(window.location.hash);
}

onMounted(() => {
  window.addEventListener('hashchange', openToHash);
});

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') window.removeEventListener('hashchange', openToHash);
});

// The shard arrives after the page does, so the section a fragment names does
// not exist until it has been rendered.
watch(
  data,
  async () => {
    await nextTick();
    openToHash();
  },
  { immediate: true },
);
</script>

<template>
  <div class="claim">
    <p v-if="loading && !data" class="claim__state">{{ t('common.loading') }}</p>
    <p v-else-if="error" class="claim__state">{{ t('common.loadFailed') }}</p>

    <template v-else-if="data">
      <p class="claim__back" data-section="back">
        <a :href="route(`/units/${unitId}/algorithms`)">{{ t('algorithms.backToAll') }}</a>
      </p>

      <!-- How far it got, before anything it says: every section below reads
           differently at each level, and a reader meeting the claim first would
           have to come back and re-read it. -->
      <header class="head sg-panel" data-section="header">
        <LevelChip :level="data.level" :why="data.why" expanded />

        <!-- The name a manual prints is the page's own `h1`, supplied by the
             route: a heading that arrives with the body is a heading the
             browser tab never sees, and seventeen tabs reading "What is behind
             the measurements" are seventeen nobody can tell apart. What stands
             here is only what no document reaches. -->
        <h2 v-if="!data.title" class="head__title">
          <ClaimTitle :title="null" :named="data.named" :claim="data.claim" />
        </h2>
        <p v-if="printedIn" class="head__printed">
          <span class="sg-label">{{ t('algorithms.printedAs') }}</span>
          <DocumentLink :document="printedIn.document" :page="printedIn.page" />
        </p>

        <dl class="facts">
          <div class="fact">
            <dt class="sg-label">{{ t('algorithms.state') }}</dt>
            <dd class="sg-readout">{{ data.state }}</dd>
          </div>
          <div class="fact">
            <dt class="sg-label">{{ t('algorithms.scope') }}</dt>
            <dd class="sg-readout">{{ data.about.scope }}</dd>
          </div>
          <div v-if="data.about.class" class="fact">
            <dt class="sg-label">{{ t('algorithms.parameterClass') }}</dt>
            <dd class="sg-readout">{{ data.about.class }}</dd>
          </div>
          <div v-if="data.rounds !== null" class="fact">
            <dt class="sg-label">{{ t('algorithms.rounds') }}</dt>
            <dd class="sg-readout">{{ t('algorithms.roundsOf', { rounds: data.rounds }) }}</dd>
          </div>
          <!-- Each type opens what was measured of it. A claim about twenty-one
               of them is where a reader most wants to go and look, and a row of
               codes with nowhere to click is the page refusing to say. -->
          <div v-if="data.printedTypes.length" class="fact fact--wide">
            <dt class="sg-label">{{ t('algorithms.types') }}</dt>
            <dd class="fact__types">
              <a
                v-for="entry in data.printedTypes"
                :key="entry.type"
                class="fact__type"
                :href="typeHref(entry.type)"
              >
                <span class="sg-readout">{{ entry.type }}</span>
                <span v-if="entry.name" class="fact__name">{{ entry.name }}</span>
              </a>
            </dd>
          </div>
          <div v-if="data.about.addresses.length" class="fact fact--wide">
            <dt class="sg-label">{{ t('algorithms.addresses') }}</dt>
            <dd>
              <a
                v-for="address in data.about.addresses"
                :key="address"
                class="fact__address sg-readout"
                :href="addressHref(address)"
              >{{ address }}</a>
            </dd>
          </div>
        </dl>

        <p class="head__record">
          <a :href="archiveHref(data.path)" target="_blank" rel="noreferrer" class="head__source">
            {{ data.path }}
          </a>
        </p>
      </header>

      <ClaimSummary data-section="summary" :unit-id="unitId" :shard="data" />
      <ClaimLedger data-section="ledger" :unit-id="unitId" :shard="data" />

      <!-- The figures, and under each of them the numbers it was drawn from. A
           reader arrives holding a byte and wanting what it answers; the
           implementation is how that answer is produced rather than what was
           asked for, so it comes after. -->
      <section v-if="data.charts.length" class="panel sg-panel" data-section="figures">
        <h2 class="sg-label panel__head">{{ t('algorithms.charts') }}</h2>
        <p class="panel__lede">{{ t('algorithms.chartsLede') }}</p>
        <div class="charts">
          <div v-for="chart in data.charts" :key="chart.id" class="figure">
            <ByteMapChart :chart="chart" :unit-id="unitId" />
            <ByteTable :unit-id="unitId" :shard="data" :chart="chart" />
          </div>
        </div>
      </section>

      <!-- The implementation. Published for an identified claim and no other. -->
      <section class="panel sg-panel" data-section="implementation">
        <h2 class="sg-label panel__head">{{ t('algorithms.example') }}</h2>

        <template v-if="data.examples.length">
          <!-- Where the code stands, as four statements rather than a
               paragraph. Two of them say what nothing here checked, which is
               the half a paragraph loses first. -->
          <ul class="status">
            <li v-for="line in CODE_STATUS" :key="line" class="status__item">
              {{ t(`algorithms.codeStatus.${line}`) }}
            </li>
          </ul>
          <article v-for="example in data.examples" :key="example.model" class="code">
            <div class="code__head">
              <span class="sg-label">
                cpp
                <template v-if="example.label">· {{ t('algorithms.exampleOf', { label: example.label }) }}</template>
              </span>
              <span class="code__actions">
                <a :href="archiveHref(example.model)" target="_blank" rel="noreferrer" class="code__model">
                  {{ t('algorithms.model') }}
                </a>
                <button
                  v-if="example.code"
                  type="button"
                  class="code__copy"
                  @click="copy(example.code, example.model)"
                >
                  {{ copied === example.model ? t('algorithms.copied') : t('algorithms.copy') }}
                </button>
              </span>
            </div>
            <!-- Set by the same highlighter the docs pages are set with, at
                 sync time. `v-html` is safe here in the one sense that matters:
                 the markup is generated by this repository's own script from a
                 record in the archive, and nothing a reader can reach writes
                 either of them. -->
            <div v-if="example.codeHtml" class="code__body" v-html="example.codeHtml" />
            <pre v-else-if="example.code" class="code__body"><code>{{ example.code }}</code></pre>
            <p v-else class="panel__lede code__none">
              {{ t('algorithms.noExampleIdentified', { why: example.unsupported }) }}
            </p>
          </article>
        </template>

        <!-- The absence, and the archive's own reason for it. One sentence
             covering every open claim said only that the claim was open; the
             standing says which of the six situations it is, and they fail in
             different ways. -->
        <template v-else>
          <p class="none">{{ t('algorithms.noExample') }}</p>
          <p class="panel__lede">{{ t(`algorithms.standingBody.${data.standing}`) }}</p>
        </template>
      </section>

      <details class="fold sg-panel" data-section="claim">
        <summary class="fold__summary">
          <span class="sg-label">{{ t('algorithms.claim') }}</span>
          <span class="sg-readout fold__count">{{ statements }}</span>
        </summary>
        <ArchiveProse
          class="prose"
          :class="{ 'sg-quoted': claimedIsQuoted(data.claim) }"
          :runs="claimedProse(data.claim)"
        />

        <template v-if="data.named">
          <h3 class="sg-label panel__sub">{{ t('algorithms.named') }}</h3>
          <ArchiveProse
            class="prose"
            :class="{ 'sg-quoted': claimedIsQuoted(data.named) }"
            :runs="claimedProse(data.named)"
          />
        </template>
        <template v-else-if="data.whyNotNamed">
          <h3 class="sg-label panel__sub">{{ t('algorithms.notNamed') }}</h3>
          <p class="panel__lede">{{ t('algorithms.notNamedBody') }}</p>
          <ArchiveProse
            class="prose"
            :class="{ 'sg-quoted': quoting }"
            :runs="verbatimProse(data.whyNotNamed)"
          />
        </template>

        <h3 class="sg-label panel__sub">{{ t('algorithms.adds') }}</h3>
        <p class="panel__lede">{{ t('algorithms.addsBody') }}</p>
        <ArchiveProse
          class="prose"
          :class="{ 'sg-quoted': claimedIsQuoted(data.adds) }"
          :runs="claimedProse(data.adds)"
        />

        <!-- The ledger reports that this statement exists and never quotes it,
             so its link has to arrive here. -->
        <h3 id="refuted-by" class="sg-label panel__sub">{{ t('algorithms.refutedBy') }}</h3>
        <ArchiveProse
          class="prose"
          :class="{ 'sg-quoted': claimedIsQuoted(data.refutedBy) }"
          :runs="claimedProse(data.refutedBy)"
        />

        <template v-if="data.couldHaveBeenRefutedBy">
          <h3 class="sg-label panel__sub">{{ t('algorithms.couldHaveBeenRefutedBy') }}</h3>
          <ArchiveProse
            class="prose"
            :class="{ 'sg-quoted': quoting }"
            :runs="verbatimProse(data.couldHaveBeenRefutedBy)"
          />
        </template>
      </details>

      <details
        v-if="data.reproduces"
        id="reproduces"
        class="fold sg-panel"
        data-section="reproduces"
      >
        <summary class="fold__summary">
          <span class="sg-label">{{ t('algorithms.reproduces') }}</span>
          <span class="sg-readout fold__count">{{ reproduced }}</span>
        </summary>
        <p class="panel__lede">{{ t('algorithms.reproducesLede') }}</p>

        <dl class="facts">
          <div v-for="model in data.models" :key="model.path" class="fact fact--wide">
            <dt class="sg-label">
              {{ t('algorithms.model') }}
              <template v-if="model.label">· {{ model.label }}</template>
            </dt>
            <dd>
              <a :href="archiveHref(model.path)" target="_blank" rel="noreferrer" class="fact__link">
                {{ model.path }}
              </a>
            </dd>
          </div>
          <div v-if="data.reproduces.comparedAgainst.records.length" class="fact fact--wide">
            <dt class="sg-label">{{ t('algorithms.comparedAgainst') }}</dt>
            <dd>
              {{ t('algorithms.comparedAgainstCount', { count: data.reproduces.comparedAgainst.records.length }) }}
            </dd>
          </div>
        </dl>

        <template v-if="domain">
          <h3 class="sg-label panel__sub">{{ t('algorithms.domain') }}</h3>
          <dl class="facts">
            <div v-for="setting in domain.settings" :key="setting.key" class="fact">
              <dt class="sg-label">{{ setting.key }}</dt>
              <dd class="sg-readout">{{ setting.text }}</dd>
            </div>
            <div v-if="domain.stimulus.length" class="fact">
              <dt class="sg-label">stimulus</dt>
              <dd class="sg-readout">{{ domain.stimulus.join(', ') }}</dd>
            </div>
          </dl>
          <template v-if="domain.outside">
            <h4 class="sg-label panel__sub">{{ t('algorithms.outside') }}</h4>
            <ArchiveProse
              class="prose"
              :class="{ 'sg-quoted': quoting }"
              :runs="verbatimProse(domain.outside)"
            />
          </template>
        </template>

        <template v-if="residual || residualWhy">
          <h3 class="sg-label panel__sub">{{ t('algorithms.residual') }}</h3>
          <template v-if="residual">
            <p class="figures">
              <span class="figures__item">
                <span class="sg-readout figures__value">{{ residual.median }}</span>
                <span class="sg-label">{{ t('algorithms.residualMedian') }}</span>
              </span>
              <span class="figures__item">
                <span class="sg-readout figures__value">{{ residual.worst }}</span>
                <span class="sg-label">{{ t('algorithms.residualWorst') }}</span>
              </span>
              <span class="figures__unit">{{ residual.unit }}</span>
            </p>
            <p class="panel__lede">
              {{ residual.structured ? t('algorithms.structured') : t('algorithms.unstructured') }}
            </p>
          </template>
          <ArchiveProse
            v-if="residualWhy"
            class="prose"
            :class="{ 'sg-quoted': quoting }"
            :runs="verbatimProse(residualWhy)"
          />
        </template>

        <dl v-if="residualExtra.length" class="notes">
          <template v-for="note in residualExtra" :key="note.key">
            <dt class="sg-label">{{ note.key }}</dt>
            <dd>
              <ArchiveProse
                v-if="note.prose"
                class="prose"
                :class="{ 'sg-quoted': quoting }"
                :runs="verbatimProse(note.prose)"
              />
              <ul v-else-if="note.rows" class="figures figures--rows">
                <li v-for="row in note.rows" :key="row.key" class="figures__item">
                  <span class="sg-label">{{ row.key }}</span>
                  <span class="sg-readout">{{ row.text }}</span>
                </li>
              </ul>
              <pre v-else class="notes__data"><code>{{ note.text }}</code></pre>
            </dd>
          </template>
        </dl>

        <template v-if="data.reproduces.gates.length">
          <h3 class="sg-label panel__sub">{{ t('algorithms.gates') }}</h3>
          <p class="panel__lede">{{ t('algorithms.gatesLede') }}</p>
          <ul class="gates">
            <li v-for="gate in data.reproduces.gates" :key="gate.name" class="gate">
              <p class="gate__head">
                <span class="gate__name">{{ t(`algorithms.gate.${gate.name}`) }}</span>
                <span
                  class="gate__verdict"
                  :class="{
                    'gate__verdict--passed': gate.passed === true,
                    'gate__verdict--failed': gate.passed === false,
                  }"
                >
                  {{ gate.passed === null ? t('algorithms.notStated') : gate.passed ? t('algorithms.passed') : t('algorithms.failed') }}
                </span>
              </p>
              <ul v-if="Object.keys(gate.figures).length" class="gate__figures">
                <li v-for="(value, key) in gate.figures" :key="key">
                  <span class="sg-label">{{ String(key).replace(/_/g, ' ') }}</span>
                  <span class="sg-readout">{{ value }}</span>
                </li>
              </ul>
              <ArchiveProse
                v-if="gate.why"
                class="prose prose--small"
                :class="{ 'sg-quoted': quoting }"
                :runs="verbatimProse(gate.why)"
              />
            </li>
          </ul>
        </template>
      </details>

      <details class="fold sg-panel" data-section="grounds">
        <summary class="fold__summary">
          <span class="sg-label">{{ t('algorithms.grounds') }}</span>
          <span class="sg-readout fold__count">{{ grounded }}</span>
        </summary>
        <p class="panel__lede">{{ t('algorithms.groundsLede') }}</p>

        <template v-if="data.grounds.measurements.length">
          <h3 class="sg-label panel__sub">{{ t('algorithms.measurements') }}</h3>
          <p class="panel__lede">{{ t('algorithms.measurementsBody') }}</p>
          <ul class="evidence">
            <li v-for="entry in data.grounds.measurements" :key="entry.file" class="evidence__item">
              <RecordLink v-if="entry.within" :unit-id="unitId" :path="entry.within" />
              <span v-else class="sg-readout evidence__path">{{ entry.file }}</span>
              <table v-if="entry.keys.length" class="readings">
                <tbody>
                  <tr v-for="(key, index) in entry.keys" :key="key">
                    <th scope="row" class="readings__key sg-readout">{{ key }}</th>
                    <td class="readings__value sg-readout">{{ entry.values[index] }}</td>
                  </tr>
                </tbody>
              </table>
            </li>
          </ul>
        </template>

        <template v-if="data.grounds.documentRows.length">
          <h3 class="sg-label panel__sub">{{ t('algorithms.documentRows') }}</h3>
          <ul class="evidence">
            <li v-for="entry in data.grounds.documentRows" :key="entry.file" class="evidence__item">
              <span class="sg-readout evidence__path">{{ entry.file }}</span>
              <p class="evidence__rows sg-readout">{{ entry.rows.join('  ') }}</p>
            </li>
          </ul>
        </template>

        <template v-if="data.grounds.eraPriors.length">
          <h3 class="sg-label panel__sub">{{ t('algorithms.eraPriors') }}</h3>
          <p class="panel__lede">{{ t('algorithms.eraPriorsBody') }}</p>
          <ul class="priors">
            <li v-for="(prior, index) in data.grounds.eraPriors" :key="index" class="prior">
              <ArchiveProse
                class="prose"
                :class="{ 'sg-quoted': quoting }"
                :runs="verbatimProse(prior.claim)"
              />
              <ArchiveProse
                v-if="prior.why"
                class="prose prose--small"
                :class="{ 'sg-quoted': quoting }"
                :runs="verbatimProse(prior.why)"
              />
              <p v-if="prior.wouldBeWrongIf" class="prior__wrong">
                <span class="sg-label">{{ t('algorithms.wouldBeWrongIf') }}</span>
                <ArchiveProse
                  tag="span"
                  class="prose prose--small"
                  :class="{ 'sg-quoted': quoting }"
                  :runs="verbatimProse(prior.wouldBeWrongIf)"
                />
              </p>
            </li>
          </ul>
        </template>

        <template v-if="data.grounds.community.length">
          <h3 class="sg-label panel__sub">{{ t('algorithms.community') }}</h3>
          <p class="panel__lede">{{ t('algorithms.communityBody') }}</p>
          <ul class="priors">
            <li v-for="(entry, index) in data.grounds.community" :key="index" class="prior">
              <ArchiveProse
                class="prose"
                :class="{ 'sg-quoted': quoting }"
                :runs="verbatimProse(entry.claim)"
              />
              <p class="prior__wrong">
                <span class="sg-label">{{ t('algorithms.traceableTo') }}</span>
                <span class="sg-readout">{{ entry.traceableTo }}</span>
              </p>
              <p v-if="entry.source" class="prior__wrong">
                <span class="sg-readout">{{ entry.source }}</span>
              </p>
            </li>
          </ul>
        </template>
      </details>

      <details
        v-if="data.alternatives.length"
        id="alternatives"
        class="fold sg-panel"
        data-section="alternatives"
      >
        <summary class="fold__summary">
          <span class="sg-label">{{ t('algorithms.alternatives') }}</span>
          <span class="sg-readout fold__count">{{ data.alternatives.length }}</span>
        </summary>
        <p class="panel__lede">{{ t('algorithms.alternativesLede') }}</p>
        <ul class="priors">
          <li v-for="(alternative, index) in data.alternatives" :key="index" class="prior">
            <p class="alternative__head">
              <span
                class="sg-level"
                :class="alternative.standing ? 'sg-level--investigating' : 'sg-level--parked'"
              >
                {{ alternative.standing ? t('algorithms.stillStanding') : t('algorithms.ruledOut') }}
              </span>
              <span v-if="alternative.candidate" class="sg-readout alternative__candidate">
                {{ alternative.candidate }}
              </span>
            </p>
            <ArchiveProse
              class="prose"
              :class="{ 'sg-quoted': quoting }"
              :runs="verbatimProse(alternative.reading)"
            />
            <p v-if="alternative.equivalent" class="panel__lede">{{ t('algorithms.equivalentHere') }}</p>
            <p v-if="alternative.ruledOutBy" class="prior__wrong">
              <span class="sg-label">{{ t('algorithms.ruledOutBy') }}</span>
              <ArchiveProse
                tag="span"
                class="prose prose--small"
                :class="{ 'sg-quoted': quoting }"
                :runs="verbatimProse(alternative.ruledOutBy)"
              />
            </p>
          </li>
        </ul>
      </details>

      <details v-if="data.extra.length" class="fold sg-panel" data-section="notes">
        <summary class="fold__summary">
          <span class="sg-label">{{ t('algorithms.notes') }}</span>
          <span class="sg-readout fold__count">{{ data.extra.length }}</span>
        </summary>
        <p class="panel__lede">{{ t('algorithms.archiveWordsBody') }}</p>
        <dl class="notes">
          <template v-for="note in data.extra" :key="note.key">
            <dt class="sg-label">{{ note.key }}</dt>
            <dd>
              <ArchiveProse
                class="prose"
                :class="{ 'sg-quoted': quoting }"
                :runs="verbatimProse(note.text)"
              />
            </dd>
          </template>
        </dl>
      </details>

      <p v-if="data.whatItWouldChange.length" class="reach" data-section="reach">
        <span class="sg-label">{{ t('algorithms.whatItWouldChange') }}</span>
        <a
          v-for="other in data.whatItWouldChange"
          :key="other"
          class="reach__item sg-readout"
          :href="archiveHref(other)"
          target="_blank"
          rel="noreferrer"
        >{{ other }}</a>
      </p>
    </template>
  </div>
</template>

<style scoped>
.claim {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.claim__state {
  margin: 0;
  font-size: 0.875rem;
  color: var(--color-text-tertiary);
}

.claim__back {
  margin: 0;
  font-size: 0.82rem;
}

.head {
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.head__title {
  margin: 0;
  padding: 0;
  border: none;
  font-family: var(--font-display);
  font-size: clamp(1.1rem, 2.4vw, 1.4rem);
  font-weight: 500;
  line-height: 1.5;
  letter-spacing: -0.005em;
}

.head__printed {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.5rem 0.8rem;
  margin: calc(var(--space-4) * -1 + 0.35rem) 0 0;
}

.head__record {
  margin: 0;
}

.head__source {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--color-text-tertiary);
  text-decoration: underline dotted var(--sg-rule);
  text-underline-offset: 0.28em;
}

.facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
  gap: var(--space-4);
  margin: 0;
}

.fact--wide {
  grid-column: 1 / -1;
}

.fact dt {
  margin-bottom: 0.35rem;
}

.fact dd {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.6;
  word-break: break-word;
}

.fact__address {
  display: inline-block;
  margin-right: 0.8rem;
  font-size: 0.8rem;
}

.fact__types {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 1.1rem;
}

/* The code and the printed name as one target: the two name one thing, and a
   reader aiming at either wants the same page. */
.fact__type {
  display: inline-flex;
  align-items: baseline;
  gap: 0.4rem;
  font-size: 0.8rem;
  text-decoration: none;
}

.fact__name {
  font-family: var(--font-reading);
  font-size: 0.78rem;
  color: var(--color-text-tertiary);
}

.fact__type:hover .fact__name,
.fact__type:focus-visible .fact__name {
  color: var(--vp-c-brand-1);
}

.fact__link {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  word-break: break-all;
}

.panel,
.fold {
  padding: var(--space-5);
}

/* A fold is a panel that starts shut. The marker is the site's own hairline
   rather than the browser's triangle, which is the one piece of chrome on the
   page that belongs to a different instrument. */
.fold__summary {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
  cursor: pointer;
  list-style: none;
}

.fold__summary::-webkit-details-marker {
  display: none;
}

.fold[open] .fold__summary {
  margin-bottom: var(--space-3);
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--sg-rule-soft);
}

/* How much is inside, as a figure. A sentence here is the paragraph the fold
   was closed to put away. */
.fold__count {
  font-size: 0.78rem;
  color: var(--color-text-tertiary);
}

.fold__summary:hover .sg-label,
.fold__summary:focus-visible .sg-label {
  color: var(--vp-c-brand-1);
}

.panel__head {
  margin-bottom: var(--space-3);
}

.panel__sub {
  margin: var(--space-5) 0 var(--space-2);
}

.panel__lede {
  margin: 0 0 var(--space-3);
  max-width: var(--sg-measure);
  font-size: 0.8rem;
  line-height: 1.7;
  color: var(--color-text-tertiary);
}

/* The site's own measure for sustained prose — `--sg-measure`, the one set for
   reading line after line, and not the wide one a page's opening sentence
   takes. A claim runs to seventeen lines, and at the wide measure those lines
   were a hundred and fifty characters each: the eye tracking back from the end
   of one lands two lines down. A claim, its lede and a gate's reason all take
   this one, so that three sizes of text inside one panel land on one column
   rather than on three — wrapped at three widths they read as three unrelated
   blocks. */
.prose {
  margin: 0 0 var(--space-3);
  max-width: var(--sg-measure);
  font-size: 0.9rem;
  line-height: 1.8;
  color: var(--color-text-secondary);
  white-space: pre-wrap;
}

.prose--small {
  font-size: 0.82rem;
  line-height: 1.75;
}

.code {
  margin: 0 0 var(--space-4);
  border: 1px solid var(--sg-rule);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.code__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--sg-panel-sunk);
  border-bottom: 1px solid var(--sg-rule-soft);
}

.code__actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.code__model {
  font-family: var(--font-mono);
  font-size: 0.66rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.code__copy {
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

.code__copy:hover {
  color: var(--vp-c-brand-1);
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 40%, transparent);
}

/* The one place on the site with a long horizontal readout. It scrolls rather
   than wrapping: a wrapped line of C++ reads as two statements. */
.code__body {
  margin: 0;
  background: var(--vp-code-block-bg);
  font-size: 0.72rem;
  line-height: 1.7;
  tab-size: 2;
}

/* The highlighted block arrives as Shiki's own `<pre class="shiki vp-code">`,
   which VitePress's global rules already colour for both appearances. What is
   set here is only the box it sits in. */
.code__body :deep(pre),
.code__body > code {
  display: block;
  margin: 0;
  padding: var(--space-4);
  overflow-x: auto;
  font-family: var(--font-mono);
  color: var(--sg-readout);
}

.code__none {
  margin: 0;
  padding: var(--space-4);
}

.charts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(19rem, 1fr));
  gap: var(--space-4);
}

/* The curve and the numbers it was drawn from are one thing, so they sit in one
   cell of the grid rather than in two columns that scroll apart. */
.figure {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

/* What the published code is, and what nothing here checked about it. */
.status {
  list-style: none;
  margin: 0 0 var(--space-4);
  padding: 0;
  display: grid;
  gap: 0.35rem;
  max-width: var(--sg-measure);
  font-size: 0.8rem;
  line-height: 1.6;
  color: var(--color-text-tertiary);
}

/* An absence, said plainly and set in the reading face: it is this site
   speaking about the claim rather than the archive speaking. */
.none {
  margin: 0 0 var(--space-2);
  font-size: 0.85rem;
  color: var(--color-text-secondary);
}

.figures {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-2) var(--space-5);
  margin: 0 0 var(--space-3);
}

.figures__item {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.figures__value {
  font-size: 1.25rem;
  line-height: 1;
}

.figures__unit {
  font-size: 0.78rem;
  color: var(--color-text-tertiary);
}

/* The same band, used as a list rather than as a headline. */
.figures--rows {
  list-style: none;
  padding: 0;
  gap: var(--space-2) var(--space-5);
}

.figures--rows .figures__item {
  gap: 0.45rem;
}

.gates,
.evidence,
.priors {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.gate,
.evidence__item,
.prior {
  padding: var(--space-4) 0;
  border-top: 1px solid var(--sg-rule-soft);
}

.gate:first-child,
.evidence__item:first-child,
.prior:first-child {
  border-top: none;
  padding-top: 0;
}

.gate__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
  margin: 0 0 var(--space-2);
}

.gate__name {
  font-size: 0.88rem;
  color: var(--color-text-primary);
}

/* Passed and failed are ink at two strengths, not a hue. A gate is a step in a
   reading rather than a thing a measurement can be, and the four colours are
   spoken for. */
.gate__verdict {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.gate__verdict--passed {
  color: var(--sg-readout);
}

.gate__verdict--failed {
  color: var(--color-text-tertiary);
  text-decoration: line-through;
  text-decoration-thickness: 1px;
}

.gate__figures {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-5);
  list-style: none;
  margin: 0 0 var(--space-2);
  padding: 0;
}

.gate__figures li {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  font-size: 0.8rem;
}

.evidence__path {
  font-size: 0.72rem;
  word-break: break-all;
  color: var(--color-text-tertiary);
}

.readings {
  margin: var(--space-2) 0 0;
  border-collapse: collapse;
  font-size: 0.75rem;
}

.readings__key {
  padding: 0.2rem 1rem 0.2rem 0;
  text-align: left;
  font-weight: 400;
  color: var(--color-text-tertiary);
}

.readings__value {
  padding: 0.2rem 0;
  text-align: right;
}

.evidence__rows {
  margin: var(--space-2) 0 0;
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.prior__wrong {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.5rem;
  margin: 0;
}

.alternative__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-3);
  margin: 0 0 var(--space-2);
}

.alternative__candidate {
  font-size: 0.72rem;
  color: var(--color-text-tertiary);
}

.notes {
  margin: 0;
}

.notes dt {
  margin: var(--space-4) 0 var(--space-2);
}

.notes dd {
  margin: 0;
}

.notes__data {
  margin: 0;
  padding: var(--space-3);
  overflow-x: auto;
  background: var(--sg-panel-sunk);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 0.7rem;
  line-height: 1.6;
}

.reach {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.5rem var(--space-3);
  margin: 0;
}

.reach__item {
  font-size: 0.7rem;
  word-break: break-all;
}

@media (max-width: 640px) {
  .head,
  .panel {
    padding: var(--space-4);
  }
}
</style>
