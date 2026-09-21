<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import type { AlgorithmSummary, CitedDocument } from '../composables/useArchive';
import { efxParamWording, efxSortWording, useArchiveFile } from '../composables/useArchive';
import { useI18n } from '../composables/useI18n';
import ClaimTitle from './ClaimTitle.vue';
import DocumentLink from './DocumentLink.vue';
import LevelChip from './LevelChip.vue';
import RecordLink from './RecordLink.vue';
import StateChip from './StateChip.vue';

/**
 * Every insertion effect type the unit stored verbatim.
 *
 * A type number is only in this list because the unit kept it when it was
 * written and read back, so the list is what the instrument has rather than
 * what a manual enumerates. Two different questions were put to each: whether
 * it moves on its own, and what each of its twenty parameters does — and the
 * second was only asked of some, which is why most types open onto an absence.
 */
const props = defineProps<{ unitId: string }>();

const { t, note, noteIsQuoted, claimed, claimedIsQuoted, route } = useI18n();

/** What a published document prints one of these as, and the page it is on. */
interface Printed {
  name: string;
  page: number;
  document: string;
}

interface EffectParameter {
  slot: number;
  address: string;
  default: number;
  askedAt: number[];
  verdict: string;
  shape: boolean;
  level: boolean;
  conclusive: boolean;
  printed: Printed | null;
}

interface EffectMotion {
  verdict: string;
  audible: boolean;
  audibleBy: string | null;
  steadierWhenRouted: boolean;
}

interface EffectType {
  type: string;
  msb: number;
  lsb: number;
  defaults: number[];
  sends: number[];
  motion: EffectMotion;
  /** The name a document prints this type under. The archive names none. */
  printed: (Printed & { number: string | null }) | null;
  parametersFile?: string;
  stimulus?: string;
  parameters?: EffectParameter[];
}

interface EffectCatalogue {
  documents: CitedDocument[];
  asked: number;
  accepted: number;
  coverage: string;
  method: string;
  sortMethod: string;
  effects: EffectType[];
  totals: {
    effects: number;
    withParameters: number;
    audibleParameters: number;
    moving: number;
    static: number;
  };
}

const { data, error, loading } = useArchiveFile<EffectCatalogue>(
  () => `${props.unitId}/effects.json`,
);

/**
 * What anybody has claimed is behind these types.
 *
 * This page says what each parameter was heard to do; the claim says what is
 * doing it. They are different kinds of statement and stay on different pages,
 * but a reader who has just found out that a byte changes the sound is one
 * click from the page that says how — so the index is fetched here and the
 * types that carry a claim link straight into it.
 *
 * A unit with no claims has no file, and the link simply does not appear.
 */
const { data: claims } = useArchiveFile<AlgorithmSummary>(() => `${props.unitId}/algorithms.json`);

const claimsByType = computed(() => {
  const held = new Map<string, AlgorithmSummary['inferences']>();
  for (const line of claims.value?.inferences ?? []) {
    for (const type of line.types) {
      const list = held.get(type) ?? [];
      list.push(line);
      held.set(type, list);
    }
  }
  // Identified first: a type carrying one closed claim and three open ones
  // should say so with the closed one.
  for (const list of held.values()) {
    list.sort((a, b) => Number(b.level === 'identified') - Number(a.level === 'identified'));
  }
  return held;
});

function algorithmHref(slug: string): string {
  return route(`/units/${props.unitId}/algorithms/${slug}`);
}

/**
 * The edition the printed names came out of, and the page the list starts on.
 *
 * A unit no document has been read for shows the table with the name column
 * empty and no citation, which is the honest shape: the names are absent, not
 * the types.
 */
const named = computed(() => {
  const first = (data.value?.effects ?? []).find((effect) => effect.printed);
  if (!first?.printed) return null;
  const document = (data.value?.documents ?? []).find(
    (entry) => entry.id === first.printed?.document,
  );
  return document ? { document, page: first.printed.page } : null;
});

/**
 * Parameter measurements, which is what the audible count is out of. Every type
 * has its own twenty slots and each was asked separately, so these add up — the
 * figure is a count of questions put, not of distinct addresses.
 */
const askedParameters = computed(() =>
  (data.value?.effects ?? []).reduce((sum, effect) => sum + (effect.parameters?.length ?? 0), 0),
);

/**
 * "Moves" is the only one of the three that reached the signal path as motion;
 * "static" is a steady effect, not a silence, and its own wording says so on
 * the chip. "Could not say" is an absence and is drawn hollow.
 */
function motionState(verdict: string): 'heard' | 'silent' | 'unasked' {
  if (verdict === 'M') return 'heard';
  if (verdict === 'X') return 'unasked';
  return 'silent';
}

/**
 * Every code whose wording ends in "so not asked" is an absence, whatever it was
 * that stopped the question being put: no yardstick, a value the parameter is
 * not printed as having, or the parameter's own stage held out of the sound. A
 * withdrawn pair is not a silence and must never be drawn as one.
 */
const UNASKED_PARAM_VERDICTS = new Set(['X', 'P', 'O', 'Z']);

function paramState(verdict: string): 'heard' | 'silent' | 'unasked' {
  if (verdict === 'Y' || verdict === 'M') return 'heard';
  if (UNASKED_PARAM_VERDICTS.has(verdict)) return 'unasked';
  return 'silent';
}

/** An effect parameter's address, in the block table it belongs to. */
function addressHref(address: string): string {
  const block = address.slice(0, 5).replace(' ', '-');
  return route(`/units/${props.unitId}/map/${block}#${address.replace(/ /g, '-')}`);
}

const open = ref<string | null>(null);

function toggle(type: string): void {
  open.value = open.value === type ? null : type;
}

/** The anchor a link from elsewhere on the site aims a type by. */
function anchorOf(type: string): string {
  return `type-${type.replace(/ /g, '-')}`;
}

/**
 * A link that names a type opens it.
 *
 * The coverage strip on the algorithms page sends a reader here for every type
 * nothing has been claimed about, and landing on a collapsed row sixty deep in a
 * table is landing nowhere. The row is opened and brought into view, so the
 * answer to "and this one?" is the measurements themselves.
 *
 * The scroll waits for the table, and then for the router. The rows are drawn
 * from a file this component fetches, so at mount there is nothing under the
 * anchor; the router, finding nothing there either, puts the page back at the
 * top. Both have to have finished before the row is worth aiming at, which is
 * why this lands two frames after the rows do rather than on the tick they
 * arrive.
 */
const wanted = ref<string | null>(null);

onMounted(() => {
  const hash = decodeURIComponent(window.location.hash.replace(/^#/, ''));
  if (!hash.startsWith('type-')) return;
  wanted.value = hash;
  open.value = hash.slice('type-'.length).replace(/-/g, ' ');
});

watch(
  () => data.value,
  async (held) => {
    if (!held || !wanted.value) return;
    const id = wanted.value;
    wanted.value = null;
    await nextTick();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.getElementById(id)?.scrollIntoView({ block: 'center' });
      });
    });
  },
  { immediate: true },
);
</script>

<template>
  <section class="effects">
    <p class="effects__lede">{{ t('effects.lede') }}</p>

    <p v-if="loading" class="effects__status">{{ t('search.loading') }}</p>
    <p v-else-if="error" class="effects__status">{{ t('common.loadFailed') }}</p>

    <template v-else-if="data">
      <p class="effects__summary">
        {{
          t('effects.audibleParameters', {
            audible: data.totals.audibleParameters.toLocaleString(),
            total: askedParameters.toLocaleString(),
          })
        }}
      </p>

      <!-- The archive's own account of how the two questions were put -->
      <p class="effects__coverage" :class="{ 'sg-quoted': noteIsQuoted(data.coverage) }">
        {{ note(data.coverage) }}
      </p>
      <details class="effects__method">
        <summary class="sg-label">{{ t('unit.method') }}</summary>
        <p class="effects__prose" :class="{ 'sg-quoted': noteIsQuoted(data.method) }">
          {{ note(data.method) }}
        </p>
        <p class="effects__prose" :class="{ 'sg-quoted': noteIsQuoted(data.sortMethod) }">
          {{ note(data.sortMethod) }}
        </p>
      </details>

      <!-- One citation for the whole column rather than one per row. Sixty-five
           rows each carrying the same edition is noise, and the names are all
           out of the one appendix. -->
      <p v-if="named" class="effects__printed">
        <span class="sg-label">{{ t('effects.printedNames') }}</span>
        <DocumentLink :document="named.document" :page="named.page" />
      </p>

      <div class="scroller sg-panel">
        <table class="types">
          <thead>
            <tr>
              <th class="sg-label" scope="col">{{ t('effects.type') }}</th>
              <th class="sg-label" scope="col">{{ t('effects.printedAs') }}</th>
              <!-- MSB and LSB are the protocol's own names for the two bytes,
                   so they stay as written rather than being translated. -->
              <th class="sg-label" scope="col">MSB / LSB</th>
              <th class="sg-label" scope="col">{{ t('effects.motion') }}</th>
              <th class="sg-label types__sends" scope="col">{{ t('effects.sends') }}</th>
            </tr>
          </thead>
          <tbody v-for="effect in data.effects" :key="effect.type">
            <tr
              :id="anchorOf(effect.type)"
              class="row"
              :class="{ 'row--open': open === effect.type }"
              tabindex="0"
              :aria-expanded="open === effect.type"
              @click="toggle(effect.type)"
              @keydown.enter.prevent="toggle(effect.type)"
              @keydown.space.prevent="toggle(effect.type)"
            >
              <td class="sg-readout row__type">{{ effect.type }}</td>
              <!-- What a manual calls it. Not a measurement and not in the four
                   colours: the archive names none of these, because a name out
                   of a specification is not something a unit answered. -->
              <td class="row__printed">{{ effect.printed?.name ?? '' }}</td>
              <td class="sg-readout row__bytes">{{ effect.msb }} / {{ effect.lsb }}</td>
              <td>
                <StateChip
                  :state="motionState(effect.motion.verdict)"
                  :wording="efxSortWording(effect.motion.verdict)"
                />
              </td>
              <td class="sg-readout row__sends">{{ effect.sends.join(' / ') }}</td>
            </tr>

            <tr v-if="open === effect.type" class="expanded">
              <td colspan="5">
                <p
                  v-if="effect.stimulus"
                  class="detail__stimulus"
                  :class="{ 'sg-quoted': noteIsQuoted(effect.stimulus) }"
                >
                  {{ note(effect.stimulus) }}
                </p>

                <!-- The claim comes before the parameter table: what the type
                     is answers the table below it, and a reader who has scrolled
                     past twenty rows to find it has read them in the dark. -->
                <div v-if="claimsByType.get(effect.type)?.length" class="behind">
                  <p class="sg-label behind__head">{{ t('algorithms.seeAlgorithm') }}</p>
                  <ul class="behind__list">
                    <li v-for="line in claimsByType.get(effect.type)" :key="line.id">
                      <a class="behind__link" :href="algorithmHref(line.slug)">
                        <LevelChip :level="line.level" />
                        <span class="behind__name">
                          <ClaimTitle
                            :title="line.title"
                            :named="line.named"
                            :claim="line.claim"
                          />
                          <span
                            v-if="line.title"
                            class="behind__says"
                            :class="{ 'sg-quoted': claimedIsQuoted(line.named ?? line.claim) }"
                          >{{ claimed(line.named) || claimed(line.claim) }}</span>
                        </span>
                      </a>
                    </li>
                  </ul>
                </div>

                <p v-if="!effect.parameters?.length" class="detail__absent">
                  {{ t('effects.noParameters') }}
                </p>

                <table v-else class="params">
                  <thead>
                    <tr>
                      <th class="sg-label" scope="col">{{ t('effects.slot') }}</th>
                      <th class="sg-label" scope="col">{{ t('effects.address') }}</th>
                      <th class="sg-label" scope="col">{{ t('effects.printedAs') }}</th>
                      <th class="sg-label" scope="col">{{ t('effects.default') }}</th>
                      <th class="sg-label" scope="col">{{ t('effects.verdict') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="parameter in effect.parameters" :key="parameter.slot">
                      <td class="sg-readout params__slot">{{ parameter.slot }}</td>
                      <td>
                        <a class="sg-readout params__address" :href="addressHref(parameter.address)">
                          {{ parameter.address }}
                        </a>
                      </td>
                      <td class="params__printed">{{ parameter.printed?.name ?? '' }}</td>
                      <td class="sg-readout params__default">{{ parameter.default }}</td>
                      <td class="params__verdict">
                        <StateChip
                          :state="paramState(parameter.verdict)"
                          :wording="efxParamWording(parameter.verdict)"
                        />
                        <span class="params__asked">
                          {{ t('address.askedAs', { values: parameter.askedAt.join(' / ') }) }}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>

                <RecordLink
                  v-if="effect.parametersFile"
                  :unit-id="unitId"
                  :path="effect.parametersFile"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>

<style scoped>
/* The unit's header panel sits directly above, with nothing between them. */
.effects {
  margin-top: var(--space-8);
}

.effects__lede,
.effects__coverage {
  margin: 0 0 var(--space-5);
  max-width: var(--sg-measure-wide);
  font-family: var(--font-reading);
  font-size: 0.9rem;
  line-height: 1.75;
  color: var(--color-text-secondary);
}

.effects__printed {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.5rem 0.8rem;
  margin: 0 0 var(--space-3);
}

.effects__summary {
  margin: 0 0 var(--space-2);
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: 0.95rem;
  color: var(--color-text-primary);
}

.effects__coverage {
  margin-bottom: var(--space-4);
  font-size: 0.8125rem;
  color: var(--color-text-tertiary);
}

/* The method is evidence, not the page. It stays one click from the table
   rather than standing between the reader and the 65 effects. */
.effects__method {
  margin-bottom: var(--space-5);
}

.effects__method > summary {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  margin: 0 0 0.35rem;
  padding: 0.2rem 0;
  cursor: pointer;
  list-style: none;
  transition: color var(--transition-fast);
}

.effects__method > summary::-webkit-details-marker {
  display: none;
}

.effects__method > summary::before {
  content: '';
  width: 0.45em;
  height: 0.45em;
  border-right: 1px solid currentColor;
  border-bottom: 1px solid currentColor;
  transform: rotate(-45deg);
  transition: transform var(--transition-default);
}

.effects__method[open] > summary::before {
  transform: rotate(45deg);
}

.effects__method > summary:hover {
  color: var(--vp-c-brand-1);
}

.effects__prose {
  margin: 0 0 var(--space-3);
  max-width: var(--sg-measure);
  font-family: var(--font-reading);
  font-size: 0.8125rem;
  line-height: 1.75;
  color: var(--color-text-tertiary);
}

.effects__prose:last-child {
  margin-bottom: 0;
}

.effects__status {
  margin: var(--space-6) 0;
  font-size: 0.9rem;
  color: var(--color-text-tertiary);
}

.scroller {
  overflow-x: auto;
}

.types,
.params {
  width: 100%;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
}

.types th,
.types td,
.params th,
.params td {
  padding: 0.35rem var(--space-5);
  text-align: left;
  vertical-align: baseline;
  border: 0;
  white-space: nowrap;
}

.types th {
  padding-top: var(--space-4);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--sg-rule);
}

.types__sends {
  white-space: normal;
  max-width: 14rem;
}

.types tbody + tbody .row td {
  border-top: 1px solid var(--sg-rule-soft);
}

.row {
  cursor: pointer;
}

.row:hover td,
.row:focus-visible td {
  background: color-mix(in srgb, var(--vp-c-brand-1) 5%, transparent);
}

.row:focus-visible {
  outline: 1px solid var(--vp-c-brand-1);
  outline-offset: -1px;
}

.row--open td {
  background: color-mix(in srgb, var(--vp-c-brand-1) 8%, transparent);
}

.row__type {
  font-size: 0.9rem;
  letter-spacing: 0.06em;
  color: var(--vp-c-brand-1);
}

/* The manual's spelling, in the reading face. A readout face would say the unit
   answered this, and it did not — a document printed it. */
.row__printed {
  font-family: var(--font-reading);
  font-size: 0.875rem;
  color: var(--color-text-primary);
  white-space: nowrap;
}

.row__bytes,
.row__sends {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

.expanded td {
  padding: var(--space-4) var(--space-5);
  background: var(--sg-panel-sunk);
  white-space: normal;
}

.detail__stimulus {
  margin: 0 0 var(--space-3);
  max-width: var(--sg-measure);
  font-family: var(--font-reading);
  font-size: 0.78rem;
  line-height: 1.65;
  color: var(--color-text-tertiary);
}

/* The claims about this type, set above the parameter table it explains. */
.behind {
  margin: 0 0 var(--space-4);
  padding: var(--space-3) var(--space-4);
  border: 1px solid color-mix(in srgb, var(--vp-c-brand-1) 22%, transparent);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--vp-c-brand-1) 5%, transparent);
}

.behind__head {
  margin-bottom: var(--space-2);
}

/* One grid across every row rather than one per row, so the level chips share a
   column and the claims all start at the same place. Wrapped instead, a claim
   long enough to take two lines pushed its own chip onto a line of its own and
   the list stopped reading as a list. */
.behind__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: var(--space-2) var(--space-4);
  align-items: baseline;
}

.behind__list li {
  display: contents;
}

.behind__link {
  display: contents;
  text-decoration: none;
  color: inherit;
}

.behind__name {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  font-size: 0.9rem;
  line-height: 1.5;
  color: var(--color-text-primary);
}

/* What the claim says, under the name the manual gives it. Two lines: the whole
   of it is on the page this row opens. */
.behind__says {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  font-family: var(--font-reading);
  font-size: 0.8rem;
  line-height: 1.6;
  color: var(--color-text-tertiary);
}

/* The reading surface underlines a link on hover, which is right in a sentence
   and wrong on a row that is a chip beside a name beside a paragraph. What says
   the row is live is the name changing colour. */
.behind__link:hover,
.behind__link:focus-visible {
  text-decoration: none;
}

.behind__link:hover .behind__name,
.behind__link:focus-visible .behind__name {
  color: var(--vp-c-brand-1);
}

.detail__absent {
  margin: 0 0 var(--space-3);
  max-width: var(--sg-measure);
  font-family: var(--font-reading);
  font-size: 0.85rem;
  line-height: 1.7;
  color: var(--color-text-tertiary);
}

.params th,
.params td {
  padding-left: 0;
  padding-right: var(--space-5);
  font-size: 0.8125rem;
}

.params th {
  padding-top: 0;
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--sg-rule-soft);
}

.params tbody tr + tr td {
  border-top: 1px solid var(--sg-rule-soft);
}

.params__slot,
.params__default {
  color: var(--color-text-secondary);
}

.params__printed {
  font-family: var(--font-reading);
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.params__address {
  color: var(--vp-c-brand-1);
  text-decoration: none;
}

.params__address:hover {
  text-decoration: underline;
}

.params__verdict {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.params__asked {
  font-family: var(--font-reading);
  font-size: 0.72rem;
  color: var(--color-text-tertiary);
}

.expanded :deep(.sg-record) {
  display: inline-block;
  margin-top: var(--space-3);
}

@media (max-width: 640px) {
  .types th,
  .types td {
    padding-left: var(--space-4);
    padding-right: var(--space-4);
  }
  .expanded td {
    padding: var(--space-3) var(--space-4);
  }
}
</style>
