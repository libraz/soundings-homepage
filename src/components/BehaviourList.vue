<script setup lang="ts">
import { computed } from 'vue';
import { useArchiveFile } from '../composables/useArchive';
import { useI18n } from '../composables/useI18n';
import quirks from '../data/quirks.json';

/**
 * What the unit does that no address map would tell you.
 *
 * These are the findings a reader has to know before trusting anything else on
 * the site — a read that stops the instrument answering, an address that is a
 * command rather than a store — so each one carries the method that established
 * it and, in the same weight of type, what it did not establish. The limits are
 * part of the finding, not a footnote to it.
 */
const props = defineProps<{ unitId: string }>();

const { t, note, noteIsQuoted } = useI18n();

interface Behaviour {
  id: string;
  summary: string;
  method: string;
  note: string | null;
  reproduced: boolean;
  notEstablished: string[];
}

interface SpotCheck {
  address: string;
  largest_read_answered?: number;
  value?: string;
  readable?: boolean;
  note: string;
}

interface Stimulus {
  name: string;
  program: number;
  note: number;
  velocity: number;
  channel: number | null;
  holdSeconds: number;
  capturedSeconds: number;
  sees: string;
  blindTo: string;
}

interface Observations {
  unitId: string;
  behaviours: Behaviour[];
  spotChecks: SpotCheck[];
  stimuli: Stimulus[];
}

const { data, error, loading } = useArchiveFile<Observations>(
  () => `${props.unitId}/behaviours.json`,
);

/**
 * The emulator acts on a behaviour only where the archive's prose has been
 * restated as a rule, and the rules are keyed by the behaviour's own id. A
 * behaviour with no rule is shown and said to be unsimulated rather than
 * approximated.
 */
const rules = quirks.rules as Record<string, unknown>;

function simulated(id: string): boolean {
  return rules[id] !== undefined;
}

const stimuli = computed(() => data.value?.stimuli ?? []);
</script>

<template>
  <section class="observations">
    <p v-if="loading" class="observations__status">{{ t('search.loading') }}</p>
    <p v-else-if="error" class="observations__status">{{ t('common.loadFailed') }}</p>

    <template v-else-if="data">
      <article
        v-for="behaviour in data.behaviours"
        :id="behaviour.id"
        :key="behaviour.id"
        class="behaviour sg-panel"
      >
        <header class="behaviour__head">
          <p class="behaviour__id sg-readout">{{ behaviour.id }}</p>
          <span
            class="sg-state"
            :class="simulated(behaviour.id) ? 'sg-state--heard' : 'sg-state--unasked'"
          >
            {{ simulated(behaviour.id) ? t('unit.simulated') : t('unit.notSimulated') }}
          </span>
        </header>

        <!-- What was found and what was not, beside each other where the page
             is wide enough to hold them. Set one under the other they were a
             column of prose down the left of a panel twice its width, with the
             limits alone running the full span; the reader was asked to take a
             finding on one measure and its limits on another. -->
        <div class="behaviour__body">
          <div class="behaviour__account">
            <!-- Every sentence below is the record's, not the interface's: it
                 is shown translated where a translation exists and quoted in
                 the archive's own English where none does. -->
            <p class="behaviour__summary" :class="{ 'sg-quoted': noteIsQuoted(behaviour.summary) }">
              {{ note(behaviour.summary) }}
            </p>

            <div class="behaviour__field">
              <p class="sg-label">{{ t('unit.method') }}</p>
              <p class="behaviour__prose" :class="{ 'sg-quoted': noteIsQuoted(behaviour.method) }">
                {{ note(behaviour.method) }}
              </p>
            </div>

            <p
              v-if="behaviour.note"
              class="behaviour__prose behaviour__note"
              :class="{ 'sg-quoted': noteIsQuoted(behaviour.note) }"
            >
              {{ note(behaviour.note) }}
            </p>
          </div>

          <!-- A limit is a finding too, so it is set in the same size as the
               rest and bounded by a full border rather than tucked underneath. -->
          <div v-if="behaviour.notEstablished.length" class="limits">
            <p class="sg-label limits__label">{{ t('unit.notEstablished') }}</p>
            <ul class="limits__list">
              <li
                v-for="limit in behaviour.notEstablished"
                :key="limit"
                :class="{ 'sg-quoted': noteIsQuoted(limit) }"
              >
                {{ note(limit) }}
              </li>
            </ul>
          </div>
        </div>
      </article>

      <section class="checks">
        <h3 class="checks__title">{{ t('unit.spotChecks') }}</h3>
        <div class="scroller sg-panel">
          <table class="grid">
            <thead>
              <tr>
                <th class="sg-label" scope="col">{{ t('search.address') }}</th>
                <th class="sg-label" scope="col">{{ t('map.size') }}</th>
                <th class="sg-label" scope="col">{{ t('emulator.reply') }}</th>
                <th class="sg-label" scope="col">{{ t('emulator.why') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="check in data.spotChecks" :key="check.address">
                <td class="sg-readout grid__address">{{ check.address }}</td>
                <td>
                  <span v-if="check.largest_read_answered" class="sg-readout grid__figure">
                    {{ check.largest_read_answered }}
                  </span>
                  <span v-else-if="check.readable === false" class="grid__plain">
                    {{ t('common.none') }}
                  </span>
                  <span v-else class="grid__absent">{{ t('address.notMeasured') }}</span>
                </td>
                <td>
                  <span v-if="check.value" class="sg-readout grid__value">{{ check.value }}</span>
                  <span v-else-if="check.readable === false" class="grid__plain">
                    {{ t('emulator.noReply') }}
                  </span>
                  <span v-else class="grid__absent">{{ t('address.notMeasured') }}</span>
                </td>
                <td class="grid__note" :class="{ 'sg-quoted': noteIsQuoted(check.note) }">
                  {{ note(check.note) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="stimuli">
        <h3 class="stimuli__title">{{ t('unit.stimuli') }}</h3>
        <ul class="stimuli__list">
          <!-- A stimulus name is an identifier in the archive and is quoted, not
               translated; only what it sees and misses is interface language. -->
          <li v-for="item in stimuli" :key="item.name" class="stimulus sg-panel">
            <p class="stimulus__name sg-readout">{{ item.name }}</p>
            <div class="stimulus__field">
              <p class="sg-label">{{ t('unit.sees') }}</p>
              <p class="stimulus__prose" :class="{ 'sg-quoted': noteIsQuoted(item.sees) }">
                {{ note(item.sees) }}
              </p>
            </div>
            <div class="stimulus__field">
              <p class="sg-label">{{ t('unit.blindTo') }}</p>
              <p class="stimulus__prose" :class="{ 'sg-quoted': noteIsQuoted(item.blindTo) }">
                {{ note(item.blindTo) }}
              </p>
            </div>
          </li>
        </ul>
      </section>
    </template>
  </section>
</template>

<style scoped>
/* The unit's header panel sits directly above, with nothing between them. */
.observations {
  margin-top: var(--space-8);
}

.observations__status {
  margin: var(--space-6) 0;
  font-size: 0.9rem;
  color: var(--color-text-tertiary);
}

.behaviour {
  padding: var(--space-5);
}

.behaviour + .behaviour {
  margin-top: var(--space-4);
}

.behaviour__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-4);
  flex-wrap: wrap;
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--sg-rule-soft);
}

.behaviour__id {
  margin: 0;
  font-size: 0.72rem;
  letter-spacing: 0.02em;
  color: var(--color-text-tertiary);
  word-break: break-all;
}

.behaviour__body {
  margin-top: var(--space-4);
}

/* Two columns once there is room for two measures side by side, and one below
   that. The limits column is given a floor rather than a share: a list of two
   short sentences squeezed into a third of a narrow panel wraps every line,
   and below its floor the two go back to being stacked. */
@media (min-width: 1080px) {
  .behaviour__body:has(.limits) {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(19rem, 0.75fr);
    gap: var(--space-6);
    align-items: start;
  }

  .behaviour__body:has(.limits) .limits {
    margin-top: 0;
  }
}

.behaviour__summary {
  margin: 0;
  max-width: var(--sg-measure);
  font-family: var(--font-reading);
  font-size: 1rem;
  line-height: 1.7;
  color: var(--color-text-primary);
}

.behaviour__field {
  margin-top: var(--space-4);
}

.behaviour__field .sg-label {
  margin: 0 0 0.35rem;
}

.behaviour__prose {
  margin: 0;
  max-width: var(--sg-measure);
  font-family: var(--font-reading);
  font-size: 0.85rem;
  line-height: 1.75;
  color: var(--color-text-secondary);
}

.behaviour__note {
  margin-top: var(--space-4);
}

.limits {
  margin-top: var(--space-4);
  padding: var(--space-3) var(--space-4);
  border: 1px solid color-mix(in srgb, var(--sg-unasked) 32%, transparent);
  background: color-mix(in srgb, var(--sg-unasked) 8%, transparent);
  border-radius: var(--radius-sm);
}

.limits__label {
  margin: 0 0 var(--space-2);
}

/* Application pages drop list markers wholesale; these limits are a list of
   separate statements and are marked as one. */
.limits__list {
  margin: 0;
  padding-left: 1.1rem;
  max-width: var(--sg-measure);
  list-style: disc;
}

.limits__list li {
  margin: 0 0 var(--space-2);
  font-family: var(--font-reading);
  font-size: 0.85rem;
  line-height: 1.75;
  color: var(--color-text-secondary);
}

.limits__list li:last-child {
  margin-bottom: 0;
}

.checks,
.stimuli {
  margin-top: var(--space-8);
}

.checks__title,
.stimuli__title {
  margin: 0 0 var(--space-3);
  padding: 0;
  border: none;
  font-size: 1.05rem;
  font-weight: 500;
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
  padding: 0.45rem var(--space-5);
  text-align: left;
  vertical-align: baseline;
  border: 0;
  white-space: nowrap;
}

.grid th {
  padding-top: var(--space-4);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--sg-rule);
}

.grid tbody tr + tr td {
  border-top: 1px solid var(--sg-rule-soft);
}

.grid__address {
  font-size: 0.85rem;
  letter-spacing: 0.05em;
}

.grid__figure,
.grid__value,
.grid__plain {
  font-size: 0.78rem;
  color: var(--color-text-secondary);
}

.grid__absent {
  font-family: var(--font-reading);
  font-size: 0.72rem;
  color: var(--color-text-tertiary);
}

/* The note is the only prose in the table, so it is the only column that wraps. */
.grid__note {
  white-space: normal;
  min-width: 20rem;
  font-family: var(--font-reading);
  font-size: 0.78rem;
  line-height: 1.65;
  color: var(--color-text-secondary);
}

.stimuli__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr));
  gap: var(--space-4);
}

.stimulus {
  padding: var(--space-4);
}

.stimulus__name {
  margin: 0 0 var(--space-3);
  font-size: 0.95rem;
  letter-spacing: 0.02em;
}

.stimulus__field + .stimulus__field {
  margin-top: var(--space-3);
}

.stimulus__field .sg-label {
  margin: 0 0 0.25rem;
}

.stimulus__prose {
  margin: 0;
  font-family: var(--font-reading);
  font-size: 0.82rem;
  line-height: 1.7;
  color: var(--color-text-secondary);
}

@media (max-width: 640px) {
  .behaviour {
    padding: var(--space-4);
  }
  .grid th,
  .grid td {
    padding-left: var(--space-4);
    padding-right: var(--space-4);
  }
  .grid__note {
    min-width: 14rem;
  }
}
</style>
