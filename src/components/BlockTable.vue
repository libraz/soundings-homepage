<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { AddressRecord, BlockShard, Region, RegionIndex } from '../composables/useArchive';
import {
  audibleWording,
  holdWording,
  oversizeWording,
  useArchiveFile,
  writeClassWording,
} from '../composables/useArchive';
import { useI18n } from '../composables/useI18n';
import AddressCard from './AddressCard.vue';
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

const { t, note, noteIsQuoted, stimulus } = useI18n();

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

const loading = computed(() => indexLoading.value || shardLoading.value);
const failed = computed(() => indexError.value || shardError.value);

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

function writeState(record: AddressRecord): 'silent' | 'refused' {
  return record.w?.c === 'F' || record.w?.c === 'U' ? 'refused' : 'silent';
}

const open = ref<string | null>(null);

function toggle(address: string): void {
  const key = anchor(address);
  open.value = open.value === key ? null : key;
}

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

        <div v-else class="scroller">
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
                  <span v-if="record.al?.length">
                    {{ record.al.map((alias) => stimulus(alias.s)).join('、') }}
                  </span>
                  <span v-else class="grid__absent">{{ t('address.notMeasured') }}</span>
                </td>
                <td class="row__heard">
                  <StateChip :state="heardState(record)" :wording="heardWording(record)" />
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
                  />
                </td>
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

.row__aliases {
  white-space: normal;
  max-width: 22rem;
  font-size: 0.78rem;
  color: var(--color-text-secondary);
}

.row__heard {
  white-space: normal;
}

.row__cannot {
  display: block;
  max-width: 26rem;
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
  .row__aliases {
    max-width: 14rem;
  }
  .row__cannot {
    max-width: 14rem;
  }
}
</style>
