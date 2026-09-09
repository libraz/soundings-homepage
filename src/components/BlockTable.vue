<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type {
  AddressRecord,
  BlockShard,
  ClaimShard,
  Region,
  RegionIndex,
} from '../composables/useArchive';
import {
  audibleWording,
  holdWording,
  oversizeWording,
  useArchiveFile,
  writeClassWording,
} from '../composables/useArchive';
import { useI18n } from '../composables/useI18n';
import AddressCard from './AddressCard.vue';
import DocumentLink from './DocumentLink.vue';
import OffsetMatrix from './OffsetMatrix.vue';
import StateChip from './StateChip.vue';

/**
 * One block, address by address.
 *
 * A block is the largest piece of the unit a reader ever holds in view at once,
 * so the table is dense on purpose: up to 128 rows of what each address held,
 * what it took and whether it was heard. The full card for an address opens
 * under its own row rather than on a page of its own, because reading one
 * address is almost always reading it against its neighbours.
 */
const props = defineProps<{ unitId: string; block: string }>();

const { t, list, note, noteIsQuoted, short, stated, statedIsQuoted, stimulus } = useI18n();

const {
  data: regionIndex,
  error: indexError,
  loading: indexLoading,
} = useArchiveFile<RegionIndex>(() => `${props.unitId}/regions.json`);
const {
  data: shard,
  error: shardError,
  loading: shardLoading,
} = useArchiveFile<BlockShard>(() => `${props.unitId}/blocks/${props.block}.json`);

/**
 * What documents state about this block, if any were read.
 *
 * Its absence is ordinary and is not an error: a block no document reaches has
 * no claim file, and the page simply says nothing about documents. Only the
 * measurements are required for the page to be worth showing.
 */
const { data: claimShard } = useArchiveFile<ClaimShard>(
  () => `${props.unitId}/claims/${props.block}.json`,
);

const loading = computed(() => indexLoading.value || shardLoading.value);
const failed = computed(() => indexError.value || shardError.value);

function documentOf(id: string) {
  return claimShard.value?.documents.find((candidate) => candidate.id === id);
}

function claimsFor(record: AddressRecord) {
  return claimShard.value?.claims.filter((claim) => claim.a === record.a);
}

/** The block as the unit writes it: the route carries a dash, the panel a space. */
const blockLabel = computed(() => props.block.replace('-', ' '));

const regions = computed<Region[]>(
  () => regionIndex.value?.regions.filter((region) => region.block === props.block) ?? [],
);

const records = computed<AddressRecord[]>(() => shard.value?.addresses ?? []);

/** A fragment an address can be linked to directly, e.g. `40-11-30`. */
function anchor(address: string): string {
  return address.replace(/ /g, '-');
}

function regionOf(record: AddressRecord): Region | undefined {
  if (!record.g) return undefined;
  return regionIndex.value?.regions.find((region) => region.start === record.g);
}

/** The verdicts a later record has not replaced, as on the card itself. */
function standing(record: AddressRecord) {
  const entries = record.b ?? [];
  const live = entries.filter((entry) => !entry.sup);
  return live.length > 0 ? live : entries;
}

function heardState(record: AddressRecord): 'heard' | 'silent' | 'unasked' {
  const verdicts = standing(record).map((entry) => entry.v);
  if (verdicts.includes('Y')) return 'heard';
  if (verdicts.length === 0) return 'unasked';
  return 'silent';
}

function heardWording(record: AddressRecord): string | undefined {
  const first = standing(record)[0];
  return first ? audibleWording(first.v) : undefined;
}

/**
 * The MIDI messages measured to land here, named once each.
 *
 * The archive scanned some stimuli twice — once over a region prefix and once
 * over the whole map — so the same message arrives from two records. That is
 * two records establishing one fact, and the row said it twice: `CC0 then
 * program change, CC0 then program change, DT1 40 11 00`. The card has always
 * folded them; the cell they are read in first does now too.
 */
function reachedBy(record: AddressRecord): string {
  const named = (record.al ?? []).map((alias) => stimulus(alias.s));
  return list([...new Set(named)]);
}

function writeState(record: AddressRecord): 'silent' | 'refused' {
  return record.w?.c === 'F' || record.w?.c === 'U' ? 'refused' : 'silent';
}

const open = ref<string | null>(null);

function toggle(address: string): void {
  const key = anchor(address);
  open.value = open.value === key ? null : key;
}

/**
 * A cell of the grid opens its address rather than toggling it.
 *
 * The grid is an index, and an index that closed what you clicked when you
 * clicked it twice would be a switch. Scrolling is the anchor's own job.
 */
function reveal(address: string): void {
  open.value = anchor(address);
}

/**
 * The grey fill in the grid's legend, in the archive's own two wordings.
 *
 * It stands for every verdict that is not "audible", and the archive has two of
 * those: not audible under what was tried, and could not be measured. Naming
 * only the first would put a claim in the legend that ten addresses contradict.
 */
const notHeardWording = computed(() =>
  list([short(audibleWording('N')), short(audibleWording('X'))]),
);

// A link to an address should land on it opened, not merely scrolled to.
onMounted(() => {
  const hash = window.location.hash.slice(1);
  if (hash) open.value = decodeURIComponent(hash);
});
</script>

<template>
  <section class="block">
    <p v-if="loading" class="block__status">{{ t('search.loading') }}</p>
    <p v-else-if="failed" class="block__status">{{ t('common.loadFailed') }}</p>

    <template v-else>
      <!-- What the map says about this block, before what the addresses said -->
      <section class="regions sg-panel">
        <h3 class="regions__title sg-label">{{ t('map.regionsIn', { block: blockLabel }) }}</h3>
        <p v-if="regions.length === 0" class="block__absent">{{ t('address.notMeasuredBody') }}</p>
        <div v-else class="scroller">
          <table class="grid">
            <thead>
              <tr>
                <th class="sg-label" scope="col">{{ t('map.start') }}</th>
                <th class="sg-label" scope="col">{{ t('map.size') }}</th>
                <th class="sg-label" scope="col">{{ t('map.oversize') }}</th>
                <th class="sg-label" scope="col">{{ t('map.neighbours') }}</th>
                <th class="sg-label" scope="col">{{ t('map.beyond') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="region in regions" :key="region.start">
                <td class="sg-readout">{{ region.start }}</td>
                <td class="sg-readout grid__figure">{{ region.size }}</td>
                <td>
                  <StateChip
                    :state="region.oversize === 'F' ? 'refused' : 'silent'"
                    :wording="oversizeWording(region.oversize)"
                  />
                </td>
                <td>
                  <StateChip
                    v-if="region.hold"
                    :state="region.hold === 'D' ? 'silent' : 'refused'"
                    :wording="holdWording(region.hold)"
                  />
                  <span v-else class="grid__absent">{{ t('address.notMeasured') }}</span>
                </td>
                <td>
                  <span v-if="region.beyond" class="sg-readout grid__figure">{{ region.beyond }}</span>
                  <span v-else-if="region.beyond === 0" class="grid__plain">{{ t('common.no') }}</span>
                  <span v-else class="grid__absent">{{ t('address.notMeasured') }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="addresses sg-panel">
        <h3 class="addresses__title">
          <span class="sg-readout addresses__block">{{ blockLabel }}</span>
          <span class="addresses__count">{{ t('map.addresses', { count: records.length }) }}</span>
        </h3>

        <p v-if="records.length === 0" class="block__absent">{{ t('address.notMeasuredBody') }}</p>

        <!-- The block's 128 offsets before its rows: which of them the archive
             reached, which of those were listened to, and where in the table
             below any one of them is. -->
        <div v-if="records.length" class="offsets">
          <figure class="plot">
            <figcaption class="plot__title sg-label">{{ t('map.grid.measured') }}</figcaption>
            <OffsetMatrix
              :block="blockLabel"
              variant="measured"
              :records="records"
              @select="reveal"
            />
            <ul class="sg-key plot__key">
              <li>
                <span class="sg-cell sg-cell--heard" aria-hidden="true" />
                {{ short(audibleWording('Y')) }}
              </li>
              <li>
                <span class="sg-cell sg-cell--silent" aria-hidden="true" />
                {{ notHeardWording }}
              </li>
              <li>
                <span class="sg-cell sg-cell--unasked" aria-hidden="true" />
                {{ t('map.grid.unasked') }}
              </li>
              <li>
                <span class="sg-cell sg-cell--absent" aria-hidden="true" />
                {{ t('map.grid.absent') }}
              </li>
            </ul>
          </figure>

          <!-- The same 128 offsets as the document has them. Apart from the
               measurements, on the same geometry, in none of the four colours. -->
          <figure v-if="claimShard" class="plot">
            <figcaption class="plot__title sg-label">{{ t('map.grid.stated') }}</figcaption>
            <OffsetMatrix
              :block="blockLabel"
              variant="stated"
              :claims="claimShard.claims"
              :absent="claimShard.absent"
              @select="reveal"
            />
            <ul class="sg-key plot__key">
              <li>
                <span class="sg-cell sg-cell--3" aria-hidden="true" />
                {{ t('map.grid.joined') }}
              </li>
              <li>
                <span class="sg-cell sg-cell--stated-only" aria-hidden="true" />
                {{ t('map.grid.statedOnly') }}
              </li>
              <li>
                <span class="sg-cell sg-cell--absent" aria-hidden="true" />
                {{ t('map.grid.unstated') }}
              </li>
            </ul>
          </figure>
        </div>

        <div v-if="records.length" class="scroller">
          <table class="grid grid--dense">
            <thead>
              <tr>
                <th class="sg-label" scope="col">{{ t('search.address') }}</th>
                <th class="sg-label" scope="col">{{ t('address.powerOn') }}</th>
                <th class="sg-label" scope="col">{{ t('address.accepts') }}</th>
                <th class="sg-label" scope="col">{{ t('address.reachedBy') }}</th>
                <th class="sg-label" scope="col">{{ t('address.heard') }}</th>
              </tr>
            </thead>
            <!-- One body per address so the card can open as a row of its own -->
            <tbody v-for="record in records" :key="record.a">
              <tr
                :id="anchor(record.a)"
                class="row"
                :class="{ 'row--open': open === anchor(record.a) }"
                tabindex="0"
                :aria-expanded="open === anchor(record.a)"
                @click="toggle(record.a)"
                @keydown.enter.prevent="toggle(record.a)"
                @keydown.space.prevent="toggle(record.a)"
              >
                <td>
                  <a class="row__address sg-readout" :href="`#${anchor(record.a)}`">{{ record.a }}</a>
                </td>
                <td>
                  <span v-if="record.p" class="sg-readout grid__figure">{{ record.p }}</span>
                  <span v-else class="grid__absent">{{ t('address.notMeasured') }}</span>
                </td>
                <td>
                  <span v-if="record.w" class="row__accepts">
                    <span class="sg-readout grid__figure">{{ record.w.r }}</span>
                    <StateChip :state="writeState(record)" :wording="writeClassWording(record.w.c)" />
                  </span>
                  <span v-else class="grid__absent">{{ t('address.notMeasured') }}</span>
                </td>
                <td class="row__aliases">
                  <span v-if="reachedBy(record)">{{ reachedBy(record) }}</span>
                  <span v-else class="grid__absent">{{ t('address.notMeasured') }}</span>
                </td>
                <td class="row__heard">
                  <!-- A chip with no verdict to name draws a bare mark, which
                       reads as nothing at all. An address nobody listened to is
                       an absence, and the row says so in the same words as its
                       other columns. -->
                  <StateChip
                    v-if="heardWording(record)"
                    :state="heardState(record)"
                    :wording="heardWording(record)"
                  />
                  <span v-else-if="!record.nb" class="grid__absent">
                    {{ t('address.notMeasured') }}
                  </span>
                  <!-- An address that cannot be asked says why, in the archive's
                       own words, rather than standing as a bare absence. -->
                  <span
                    v-if="record.nb"
                    class="row__cannot"
                    :class="{ 'sg-quoted': noteIsQuoted(record.nb) }"
                  >
                    {{ note(record.nb) }}
                  </span>
                </td>
              </tr>
              <tr v-if="open === anchor(record.a)" class="expanded">
                <td colspan="5">
                  <AddressCard
                    :unit-id="unitId"
                    :record="record"
                    :region="regionOf(record)"
                    :index="regionIndex"
                    :claims="claimsFor(record)"
                    :documents="claimShard?.documents"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!--
          Addresses a document states in this block that the archive holds no
          record of. Listed rather than passed over, because the difference
          between an address nobody asked about and one that answered nothing is
          the distinction this whole site is built to keep.
        -->
        <section v-if="claimShard?.absent.length" class="absent sg-sunk">
          <h3 class="sg-label">{{ t('claims.absentHere') }}</h3>
          <p class="absent__body">{{ t('claims.absentBody') }}</p>
          <ul class="absent__list">
            <li v-for="row in claimShard.absent" :key="`${row.d}-${row.a}`">
              <span class="sg-readout">{{ row.a }}</span>
              <!-- A row the page gives no columns of its own says so, rather
                   than standing as a dash the document did not print. -->
              <span
                v-if="!row.parameter && row.why"
                class="absent__why"
                :class="{ 'sg-quoted': statedIsQuoted(row.why) }"
              >
                {{ stated(row.why) }}
              </span>
              <template v-else>
                <span class="absent__parameter">{{ row.parameter ?? '—' }}</span>
                <span v-if="row.data" class="sg-readout absent__range">{{ row.data }}</span>
              </template>
              <DocumentLink
                v-if="documentOf(row.d)"
                :document="documentOf(row.d)!"
                :page="row.page"
              />
            </li>
          </ul>
        </section>

        <!--
          What the document states under a table rather than beside a row. No
          verdict, and not for want of one: these say what a parameter does or
          what a message leaves behind, and the archive holds no reading that
          either agrees with that or does not. Each says so, and says what
          would have to be measured for it to be answerable at all.
        -->
        <section v-if="claimShard?.statements?.length" class="notes sg-sunk">
          <h3 class="sg-label">{{ t('claims.tableNotes') }}</h3>
          <p class="notes__body">{{ t('claims.tableNotesBody') }}</p>
          <article v-for="statement in claimShard.statements" :key="statement.id" class="note">
            <p
              class="note__restated"
              :class="{ 'sg-quoted': statedIsQuoted(statement.restated) }"
            >
              {{ stated(statement.restated) }}
            </p>
            <p class="note__open" :class="{ 'sg-quoted': statedIsQuoted(statement.open) }">
              {{ stated(statement.open) }}
            </p>
            <p class="note__reach">
              <span class="sg-readout">
                {{ t('claims.reachesHere', { count: statement.addresses?.length ?? 0 }) }}
              </span>
              <DocumentLink
                v-if="documentOf(statement.d)"
                :document="documentOf(statement.d)!"
                :page="statement.page"
              />
            </p>
          </article>
        </section>
      </section>
    </template>
  </section>
</template>

<style scoped>
/* Addresses a document states and the archive does not hold. */
.absent {
  margin-top: var(--space-6);
  padding: var(--space-4);
}

.absent__body {
  margin: 0.3rem 0 0.7rem;
  font-size: 0.85rem;
  color: var(--color-text-secondary);
}

.absent__list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.absent__list li {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  align-items: baseline;
  padding: 0.2rem 0;
  border-top: 1px dotted var(--sg-rule);
}

.absent__parameter {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: var(--color-text-secondary);
}

.absent__range {
  font-size: 0.78rem;
  color: var(--color-text-tertiary);
}

.absent__why {
  max-width: 34rem;
  font-family: var(--font-reading);
  font-size: 0.75rem;
  line-height: 1.6;
  color: var(--color-text-tertiary);
}

/* Notes the document prints under a table. Achromatic on purpose: the four
   colours mean measured things, and nothing here has been measured. */
.notes {
  margin-top: var(--space-5);
  padding: var(--space-4);
}

.notes__body {
  margin: 0.3rem 0 0.7rem;
  font-size: 0.85rem;
  color: var(--color-text-secondary);
}

.note {
  padding-top: var(--space-3);
  border-top: 1px dotted var(--sg-rule);
}

.note__restated {
  margin: 0;
  max-width: var(--sg-measure-wide);
  font-family: var(--font-reading);
  font-size: 0.85rem;
  line-height: 1.7;
}

.note__open {
  margin: 0.35rem 0 0;
  max-width: var(--sg-measure-wide);
  font-family: var(--font-reading);
  font-size: 0.78rem;
  line-height: 1.65;
  color: var(--color-text-tertiary);
}

.note__reach {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.6rem;
  margin: 0.4rem 0 0.2rem;
  font-size: 0.75rem;
  color: var(--color-text-tertiary);
}

/* The unit's header panel sits directly above, with nothing between them. */
.block {
  margin-top: var(--space-8);
}

.block__status,
.block__absent {
  margin: 0;
  padding: var(--space-4) var(--space-5);
  font-family: var(--font-reading);
  font-size: 0.85rem;
  line-height: 1.7;
  max-width: var(--sg-measure-wide);
  color: var(--color-text-tertiary);
}

.regions__title {
  margin: 0;
  padding: var(--space-4) var(--space-5) var(--space-3);
  border: none;
}

.addresses {
  margin-top: var(--space-5);
}

.addresses__title {
  display: flex;
  align-items: baseline;
  gap: var(--space-4);
  margin: 0;
  padding: var(--space-4) var(--space-5) var(--space-3);
  border: none;
  font-size: 1rem;
}

.addresses__block {
  font-size: 1.25rem;
  font-weight: 500;
  letter-spacing: 0.06em;
}

.addresses__count {
  font-size: 0.8125rem;
  font-weight: 400;
  color: var(--color-text-tertiary);
}

/* The grids of offsets, and the key to each, above the rows they index. */
.offsets {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-5) var(--space-8);
  padding: var(--space-2) var(--space-5) var(--space-5);
}

.plot {
  flex: 0 1 19rem;
  min-width: 11rem;
  margin: 0;
}

.plot__title {
  margin-bottom: var(--space-3);
}

.plot__key {
  margin-top: var(--space-4);
  max-width: 22rem;
}

/* Wide tables scroll on their own rather than pushing the page sideways. */
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
  padding: 0.4rem var(--space-5);
  text-align: left;
  vertical-align: baseline;
  border: 0;
  white-space: nowrap;
}

.grid th {
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--sg-rule);
}

.grid--dense th,
.grid--dense td {
  padding-top: 0.25rem;
  padding-bottom: 0.25rem;
  font-size: 0.8125rem;
}

.grid tbody tr + tr td,
.grid--dense tbody + tbody .row td {
  border-top: 1px solid var(--sg-rule-soft);
}

.grid__figure {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

.grid__plain {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

.grid__absent {
  font-family: var(--font-reading);
  font-size: 0.72rem;
  color: var(--color-text-tertiary);
}

.row {
  cursor: pointer;
  scroll-margin-top: var(--space-12);
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

.row__address {
  font-size: 0.85rem;
  letter-spacing: 0.05em;
  color: var(--vp-c-brand-1);
  text-decoration: none;
}

.row:hover .row__address {
  text-decoration: underline;
}

.row__accepts {
  display: inline-flex;
  align-items: baseline;
  gap: var(--space-3);
}

/* Qualified by the cell as well as the class: `.grid td` sets `nowrap` and
   carries a type selector, so a bare class here loses to it and the two columns
   meant to wrap never did. */
.grid td.row__aliases {
  white-space: normal;
  max-width: 22rem;
  font-size: 0.78rem;
  color: var(--color-text-secondary);
}

.grid td.row__heard {
  white-space: normal;
}

.row__cannot {
  /* Inline-block, not block: a table cell sized from its content gives a block
     child the cell's own width, and the width the note is meant to wrap at goes
     unused. Set on the note itself it is the note's width, and the cell is
     sized from that -- which is why it has to be narrow. This is the last
     column, so whatever width the note takes is width the whole table takes,
     and a sentence set at its comfortable reading width pushed the table past
     the panel it sits in. */
  display: inline-block;
  max-width: 15rem;
  /* Stated on the note rather than left to the cell: an own declaration beats
     an inherited one however specific the inherited one's selector is. */
  white-space: normal;
  margin-top: 0.2rem;
  font-family: var(--font-reading);
  font-size: 0.72rem;
  line-height: 1.55;
  color: var(--color-text-tertiary);
}

.expanded td {
  padding: var(--space-4) var(--space-5);
  background: var(--sg-panel-sunk);
  white-space: normal;
}

@media (max-width: 640px) {
  .grid th,
  .grid td {
    padding-left: var(--space-4);
    padding-right: var(--space-4);
  }
  .expanded td {
    padding: var(--space-3);
  }
  .grid td.row__aliases {
    max-width: 14rem;
  }
  .row__cannot {
    max-width: 12rem;
  }
}
</style>
