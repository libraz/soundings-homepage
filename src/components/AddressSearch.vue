<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { AddressRecord, BlockShard, RegionIndex } from '../composables/useArchive';
import {
  audibleWording,
  units,
  useArchiveFile,
  writeClassWording,
} from '../composables/useArchive';
import { useI18n } from '../composables/useI18n';
import AddressCard from './AddressCard.vue';

/**
 * The way into the archive.
 *
 * A reader arrives holding an address — from a sequence, a patch dump, another
 * unit's map — and wants what is known about it. Everything here is built
 * around getting from those six hex digits to the card in as few steps as
 * possible: the first two bytes name the file to fetch, so the site never loads
 * more than one block's worth of data to answer one question.
 *
 * Typing a MIDI message instead works the other way round, through the aliases
 * the archive attributed to addresses. Both routes end at the same card.
 */
const props = withDefaults(defineProps<{ unitId?: string; compact?: boolean }>(), {
  compact: false,
});

const { t, short, route } = useI18n();

const allUnits = units();
const selectedUnit = ref(props.unitId ?? allUnits[0]?.id ?? '');
const query = ref('');
const recent = ref<string[]>([]);
const chosen = ref<string | null>(null);

const RECENT_KEY = 'soundings.recent';
const RECENT_LIMIT = 6;

const unit = computed(() => allUnits.find((candidate) => candidate.id === selectedUnit.value));

/**
 * Read what was typed as an address.
 *
 * Hex is written with or without spaces in different places, so `401130`,
 * `40 11 30` and `40-11-30` are the same question. Fewer than six digits is a
 * prefix, which is what makes the box useful before the whole address is known.
 */
const typed = computed(() => {
  const digits = query.value.toUpperCase().replace(/[^0-9A-F]/g, '');
  if (digits.length === 0) return null;
  const bytes = digits.match(/.{1,2}/g) ?? [];
  // Every byte of a Roland address is seven bits wide, so 80 and above is not
  // an address at all and should find nothing rather than the nearest thing.
  if (bytes.some((byte) => byte.length === 2 && Number.parseInt(byte, 16) > 0x7f)) return null;
  return { digits, bytes, complete: digits.length === 6 };
});

/** The block whose shard could answer, once two bytes are known. */
const blockKey = computed(() => {
  const address = typed.value;
  if (!address || address.bytes.length < 2 || address.bytes[1].length < 2) return null;
  return `${address.bytes[0]}-${address.bytes[1]}`;
});

const { data: index } = useArchiveFile<RegionIndex>(() =>
  selectedUnit.value ? `${selectedUnit.value}/regions.json` : null,
);

const { data: aliasIndex } = useArchiveFile<{
  aliases: { stimulus: string; kind: string | null; channel: number | null; address: string }[];
}>(() => (selectedUnit.value ? `${selectedUnit.value}/aliases.json` : null));

const { data: shard, loading } = useArchiveFile<BlockShard>(() =>
  blockKey.value && selectedUnit.value
    ? `${selectedUnit.value}/blocks/${blockKey.value}.json`
    : null,
);

/** Addresses in the fetched shard whose text starts with what was typed. */
const addressMatches = computed<AddressRecord[]>(() => {
  const address = typed.value;
  if (!address || !shard.value) return [];
  const prefix = address.bytes.join(' ');
  return shard.value.addresses
    .filter((record) => record.a.replace(/ /g, '').startsWith(address.digits))
    .slice(0, 64);
});

/**
 * Messages whose name contains what was typed, for the other way round.
 *
 * Only when what was typed is not an address. Some of the archive's stimuli are
 * named after the message that carries them — `DT1 40 11 30` — so an address
 * query matches both routes and the reader gets each address twice, once as
 * itself and once as the name of the write that reaches it. An address query
 * has an address answer; this list is for the reader who has the message and
 * wants the address.
 *
 * Two records naming the same message and the same byte are one route measured
 * twice, so the list is by message and channel rather than by record.
 */
const aliasMatches = computed(() => {
  const text = query.value.trim().toUpperCase();
  if (text.length < 2 || typed.value) return [];
  const seen = new Set<string>();
  const rows = [];
  for (const alias of aliasIndex.value?.aliases ?? []) {
    if (!alias.stimulus.toUpperCase().includes(text)) continue;
    const key = `${alias.stimulus} ${alias.channel ?? ''} ${alias.address}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(alias);
    if (rows.length === 12) break;
  }
  return rows;
});

const hasQuery = computed(() => query.value.trim().length > 0);
const nothingFound = computed(
  () =>
    hasQuery.value &&
    !loading.value &&
    addressMatches.value.length === 0 &&
    aliasMatches.value.length === 0,
);

const chosenRecord = computed<AddressRecord | null>(() => {
  if (!chosen.value || !shard.value) return null;
  return shard.value.addresses.find((record) => record.a === chosen.value) ?? null;
});

const chosenRegion = computed(() => {
  const record = chosenRecord.value;
  if (!record?.g) return undefined;
  return index.value?.regions.find((region) => region.start === record.g);
});

/** The verdict a row shows: the first that a later record has not replaced. */
function standingVerdict(record: AddressRecord): string | null {
  const entries = record.b ?? [];
  const live = entries.filter((entry) => !entry.sup);
  return (live[0] ?? entries[0])?.v ?? null;
}

function stateOf(record: AddressRecord): 'heard' | 'silent' | 'unasked' {
  const verdict = standingVerdict(record);
  if (verdict === 'Y') return 'heard';
  if (verdict === null) return 'unasked';
  return 'silent';
}

function choose(address: string) {
  chosen.value = address;
  query.value = address;
  remember(address);
}

function remember(address: string) {
  const next = [address, ...recent.value.filter((entry) => entry !== address)].slice(
    0,
    RECENT_LIMIT,
  );
  recent.value = next;
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // A browser refusing storage costs the reader the recent list and nothing else.
  }
}

function submit() {
  const first = addressMatches.value[0];
  if (first) choose(first.a);
}

onMounted(() => {
  try {
    const stored = localStorage.getItem(RECENT_KEY);
    if (stored) recent.value = JSON.parse(stored);
  } catch {
    recent.value = [];
  }
});

// Editing the query after a card is open puts the reader back in the list.
watch(query, (value) => {
  if (chosen.value && value !== chosen.value) chosen.value = null;
});
</script>

<template>
  <div class="search" :class="{ 'search--compact': compact }">
    <div class="search__fields">
      <label v-if="allUnits.length > 1" class="field">
        <span class="sg-label">{{ t('search.unit') }}</span>
        <select v-model="selectedUnit" class="field__control field__control--select">
          <option v-for="candidate in allUnits" :key="candidate.id" :value="candidate.id">
            {{ candidate.manufacturer }} {{ candidate.model }}
          </option>
        </select>
      </label>
      <div v-else-if="unit" class="field">
        <span class="sg-label">{{ t('search.unit') }}</span>
        <p class="field__static">
          {{ unit.manufacturer }} {{ unit.model }}
          <span class="field__id sg-readout">{{ unit.id }}</span>
        </p>
      </div>

      <label class="field field--grow">
        <span class="sg-label">{{ t('search.address') }}</span>
        <!--
          No inputmode: the field takes hex bytes, and nothing in the attribute
          asks for a Latin keyboard. `latin` did, and was dropped from the spec
          without a replacement, so asking for it again only puts an invalid
          value in the markup.
        -->
        <input
          v-model="query"
          class="field__control sg-readout"
          type="search"
          autocapitalize="off"
          autocomplete="off"
          spellcheck="false"
          :placeholder="t('search.placeholder')"
          @keydown.enter.prevent="submit"
        />
      </label>
    </div>

    <p class="search__hint">{{ t('search.hint') }}</p>

    <p v-if="loading && hasQuery" class="search__status">{{ t('search.loading') }}</p>

    <div v-if="nothingFound" class="search__empty sg-sunk">
      <p class="search__empty-head">{{ t('search.noMatch') }}</p>
      <p class="search__empty-body">{{ t('search.noMatchHint') }}</p>
    </div>

    <ul v-if="aliasMatches.length" class="results">
      <li v-for="alias in aliasMatches" :key="`${alias.stimulus}-${alias.channel}-${alias.address}`">
        <button type="button" class="result" @click="choose(alias.address)">
          <span class="result__address sg-readout">{{ alias.address }}</span>
          <span class="result__alias">{{ alias.stimulus }}</span>
          <span v-if="alias.channel" class="result__channel">ch{{ alias.channel }}</span>
        </button>
      </li>
    </ul>

    <ul v-if="addressMatches.length && !chosen" class="results">
      <li v-for="record in addressMatches" :key="record.a">
        <button type="button" class="result" @click="choose(record.a)">
          <span class="result__address sg-readout">{{ record.a }}</span>
          <span class="result__value sg-readout">{{ record.p ?? '—' }}</span>
          <span v-if="record.w" class="result__write">
            {{ short(writeClassWording(record.w.c)) }}
            <span class="sg-readout">{{ record.w.r }}</span>
          </span>
          <span v-else class="result__write result__write--absent">{{
            t('address.notMeasured')
          }}</span>
          <span :class="['sg-state', `sg-state--${stateOf(record)}`]">
            {{
              standingVerdict(record)
                ? short(audibleWording(standingVerdict(record) as string))
                : t('address.notMeasured')
            }}
          </span>
        </button>
      </li>
    </ul>

    <AddressCard
      v-if="chosenRecord"
      class="search__card"
      :unit-id="selectedUnit"
      :record="chosenRecord"
      :region="chosenRegion"
      :index="index"
    />

    <div v-if="recent.length && !hasQuery" class="recent">
      <span class="sg-label">{{ t('search.recent') }}</span>
      <ul>
        <li v-for="address in recent" :key="address">
          <button type="button" class="recent__item sg-readout" @click="choose(address)">
            {{ address }}
          </button>
        </li>
      </ul>
    </div>

    <p v-if="unit && !compact" class="search__scale">
      <a :href="route(`/units/${unit.id}/map`)">
        {{ t('map.regions', { count: unit.counts.regions.toLocaleString() }) }} ·
        {{ t('map.addresses', { count: unit.counts.addresses.toLocaleString() }) }}
      </a>
    </p>
  </div>
</template>

<style scoped>
.search {
  width: 100%;
}

.search__fields {
  display: flex;
  gap: var(--space-4);
  align-items: flex-end;
  flex-wrap: wrap;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  min-width: 0;
}

.field--grow {
  flex: 1 1 16rem;
}

.field__control {
  appearance: none;
  width: 100%;
  padding: 0.7rem 0.85rem;
  font-size: 1.05rem;
  letter-spacing: 0.08em;
  color: var(--color-text-primary);
  background: var(--sg-panel);
  border: 1px solid var(--sg-rule);
  border-radius: var(--radius-sm);
  transition: border-color var(--transition-fast), background-color var(--transition-fast);
}

.field__control:focus {
  outline: none;
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-bg-elv);
}

.field__control--select {
  font-family: var(--font-body);
  font-size: 0.95rem;
  letter-spacing: 0;
}

.field__static {
  margin: 0;
  padding: 0.7rem 0;
  font-size: 0.95rem;
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.field__id {
  font-size: 0.72rem;
  color: var(--color-text-tertiary);
}

.search__hint,
.search__status {
  margin: var(--space-3) 0 0;
  font-size: 0.78rem;
  color: var(--color-text-tertiary);
}

.search__empty {
  margin-top: var(--space-4);
  padding: var(--space-4);
}

.search__empty-head {
  margin: 0 0 0.4rem;
  font-size: 0.95rem;
  color: var(--color-text-primary);
}

.search__empty-body {
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.7;
  color: var(--color-text-tertiary);
}

.results {
  list-style: none;
  margin: var(--space-4) 0 0;
  padding: 0;
  border-top: 1px solid var(--sg-rule-soft);
  max-height: 22rem;
  overflow-y: auto;
}

.result {
  display: grid;
  grid-template-columns: 6.5rem 3rem 1fr auto;
  align-items: baseline;
  gap: var(--space-3);
  width: 100%;
  padding: 0.5rem 0.6rem;
  text-align: left;
  background: none;
  border: none;
  border-bottom: 1px solid var(--sg-rule-soft);
  cursor: pointer;
  color: inherit;
  transition: background-color var(--transition-fast);
}

.result:hover,
.result:focus-visible {
  outline: none;
  background: color-mix(in srgb, var(--vp-c-brand-1) 8%, transparent);
}

.result__address {
  font-size: 0.95rem;
  letter-spacing: 0.05em;
}

.result__value {
  font-size: 0.8rem;
  color: var(--color-text-tertiary);
}

.result__write,
.result__alias {
  font-size: 0.8rem;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result__write--absent {
  color: var(--sg-unasked);
}

.result__channel {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--color-text-tertiary);
}

.search__card {
  margin-top: var(--space-5);
}

.recent {
  margin-top: var(--space-5);
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.recent ul {
  list-style: none;
  display: flex;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  flex-wrap: wrap;
}

.recent__item {
  padding: 0.2rem 0.5rem;
  font-size: 0.8rem;
  background: none;
  border: 1px solid var(--sg-rule);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: border-color var(--transition-fast), color var(--transition-fast);
}

.recent__item:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.search__scale {
  margin: var(--space-5) 0 0;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.06em;
}

.search__scale a {
  color: var(--color-text-tertiary);
  text-decoration: none;
}

.search__scale a:hover {
  color: var(--vp-c-brand-1);
}

@media (max-width: 640px) {
  .result {
    grid-template-columns: 5.5rem 1fr;
    row-gap: 0.15rem;
  }
  .result__value {
    text-align: right;
  }
}
</style>
