<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue';
import { useArchiveFile } from '../composables/useArchive';
import { useI18n } from '../composables/useI18n';
import type { Citation, Device, DeviceDataset, MessageResult, Outcome } from '../emulator';
import {
  createDevice,
  findQuirk,
  formatHexBytes,
  indexDataset,
  parseAddress,
  parseHexBytes,
} from '../emulator';
import RecordLink from './RecordLink.vue';

/**
 * The archive, run backwards.
 *
 * Every other page answers "what did the unit do at this address". This one
 * takes the question in the form the unit itself took it — a MIDI message — and
 * answers with what the archive says came back, including the ways it came back
 * wrong. Ask it for 256 bytes and it stops responding until it is power-cycled,
 * because that is what the unit did.
 *
 * The console holds no knowledge of any instrument. It loads one unit's
 * `device.json`, hands it to `createDevice`, and renders whatever comes out —
 * so a second unit needs no change here, and nothing shown can be truer than
 * the record it cites.
 */
const props = defineProps<{ unitId: string }>();

const { t, route } = useI18n();

const {
  data: dataset,
  loading,
  error,
} = useArchiveFile<DeviceDataset>(() => `${props.unitId}/device.json`);

const device = shallowRef<Device | null>(null);
const log = ref<{ id: number; message: MessageResult; sent: number[] }[]>([]);
const input = ref('');
const state = ref<'alive' | 'silent'>('alive');
let nextId = 0;

watch(
  dataset,
  (value) => {
    if (!value) return;
    device.value = createDevice(value);
    state.value = device.value.state;
    log.value = [];
  },
  { immediate: true },
);

/**
 * The messages worth putting in front of someone who has not read the archive.
 *
 * They are not a demo reel: each one leads somewhere the archive has something
 * surprising to say, so working down the list is a tour of what was measured.
 */
const presets = computed(() => {
  const data = dataset.value;
  if (!data) return [];
  // Everything below comes out of the archive: the device id from the ids this
  // unit was measured to answer, the model id and the frame shape from the
  // frames it answered them in, and every address from a region or a quirk that
  // names one. No address, size or behaviour id is written down here, so a unit
  // measured through frames this site cannot read still gets the presets that
  // are recorded whole — its resets and an identity request — and no others.
  const index = indexDataset(data);
  const { protocol, modelId } = index;
  const deviceId = Number.parseInt(data.deviceId.respondsTo[0] ?? '10', 16);

  const entries: { label: string; bytes: number[]; note?: string }[] = [
    {
      label: 'Identity Request',
      bytes: [0xf0, 0x7e, 0x7f, 0x06, 0x01, 0xf7],
    },
  ];

  /** An address the write probe reached, which is what makes a write worth showing. */
  const writable = index.order.find((address) => index.addresses.get(address)?.rule);
  /** An address the unit was measured refusing or clamping a value at. */
  const outOfRange = index.order.find((address) => {
    const rule = index.addresses.get(address)?.rule;
    return rule && (rule[0] === 'C' || rule[0] === 'F');
  });

  if (protocol && modelId !== null) {
    const read = (address: string, size: number) =>
      protocol.buildRead(deviceId, modelId, parseAddress(address), size);
    const write = (address: string, data: number[]) =>
      protocol.buildWrite(deviceId, modelId, parseAddress(address), data);

    const probe = writable ?? index.order[0];
    if (probe) {
      entries.push({ label: `read ${probe}, 1 byte`, bytes: read(probe, 1) });
      entries.push({ label: `write ${probe} = 7F`, bytes: write(probe, [0x7f]) });
    }
    if (outOfRange && outOfRange !== probe) {
      entries.push({
        label: `write ${outOfRange} = 7F (outside the range measured)`,
        bytes: write(outOfRange, [0x7f]),
      });
    }

    const oversize = findQuirk(data.quirks, 'silence-on-oversized-read');
    if (oversize && probe) {
      entries.push({
        label: `read ${probe}, ${oversize.rule.minSize} bytes`,
        bytes: read(probe, oversize.rule.minSize),
        note: oversize.id,
      });
    }

    const notARead = findQuirk(data.quirks, 'not-a-read');
    if (notARead) {
      entries.push({
        label: `read ${notARead.rule.address}, 1 byte`,
        bytes: read(notARead.rule.address, 1),
        note: notARead.id,
      });
    }
  }

  entries.push({ label: 'CC7 = 100, ch 1', bytes: [0xb0, 0x07, 100] });

  const scaled = findQuirk(data.quirks, 'scaled-alias');
  if (scaled) {
    entries.push({
      label: 'RPN 00 05 = 3, ch 1',
      bytes: [0xb0, 0x65, 0x00, 0xb0, 0x64, 0x05, 0xb0, 0x06, 3],
      note: scaled.id,
    });
  }

  const bankLatch = findQuirk(data.quirks, 'bank-latch');
  if (bankLatch) {
    entries.push({
      label: 'CC0 = 3, then Program Change 0',
      bytes: [0xb0, 0x00, 3, 0xc0, 0x00],
      note: bankLatch.id,
    });
  }

  for (const reset of data.resets) {
    if (!reset.message) continue;
    entries.push({ label: reset.name, bytes: parseHexBytes(reset.message) });
  }
  return entries;
});

function send(bytes: number[]) {
  const current = device.value;
  if (!current || bytes.length === 0) return;
  const result = current.receive(bytes);
  state.value = result.state;
  for (const message of result.messages) {
    nextId += 1;
    log.value.unshift({ id: nextId, message, sent: message.bytes });
  }
}

function sendTyped() {
  try {
    send(parseHexBytes(input.value));
  } catch {
    // A half-typed frame is the ordinary state of the box, not an error worth
    // interrupting for; the log simply gains nothing until the bytes parse.
  }
}

function powerCycle() {
  device.value?.powerCycle();
  state.value = device.value?.state ?? 'alive';
}

function reset() {
  device.value?.reset();
  state.value = device.value?.state ?? 'alive';
}

/** Outcomes map onto the site's four states, so a reply reads like a card does. */
function stateFor(outcome: Outcome): 'heard' | 'silent' | 'refused' | 'unasked' {
  if (outcome === 'applied') return 'heard';
  if (outcome === 'refused' || outcome === 'silenced') return 'refused';
  if (outcome === 'unmeasured') return 'unasked';
  return 'silent';
}

function citationLabel(citation: Citation): string {
  if (citation.kind === 'behaviour') return citation.id;
  if (citation.kind === 'record') return citation.path;
  return citation.field;
}
</script>

<template>
  <section class="console">
    <p class="console__lede">{{ t('emulator.lede') }}</p>

    <p v-if="loading" class="console__status">{{ t('search.loading') }}</p>
    <p v-else-if="error" class="console__status">{{ t('common.loadFailed') }}</p>

    <template v-if="device">
      <div class="panel sg-panel">
        <div class="panel__row">
          <div class="panel__state">
            <span class="sg-label">{{ t('emulator.state') }}</span>
            <span :class="['sg-state', state === 'alive' ? 'sg-state--heard' : 'sg-state--refused']">
              {{ state === 'alive' ? t('emulator.alive') : t('emulator.silent') }}
            </span>
          </div>
          <div class="panel__actions">
            <button type="button" @click="powerCycle">{{ t('emulator.powerCycle') }}</button>
            <button type="button" @click="reset">{{ t('emulator.reset') }}</button>
            <button type="button" :disabled="log.length === 0" @click="log = []">
              {{ t('emulator.clear') }}
            </button>
          </div>
        </div>

        <label class="panel__input">
          <span class="sg-label">{{ t('emulator.input') }}</span>
          <span class="panel__field">
            <input
              v-model="input"
              class="sg-readout"
              type="text"
              autocomplete="off"
              spellcheck="false"
              placeholder="F0 41 10 42 11 40 11 30 00 00 01 5E F7"
              @keydown.enter.prevent="sendTyped"
            />
            <button type="button" class="panel__send" @click="sendTyped">
              {{ t('emulator.send') }}
            </button>
          </span>
        </label>
        <p class="panel__hint">{{ t('emulator.inputHint') }}</p>

        <div class="presets">
          <span class="sg-label">{{ t('emulator.presets') }}</span>
          <div class="presets__list">
            <button
              v-for="preset in presets"
              :key="preset.label"
              type="button"
              class="preset"
              :class="{ 'preset--quirk': preset.note }"
              @click="
                input = formatHexBytes(preset.bytes);
                send(preset.bytes);
              "
            >
              {{ preset.label }}
            </button>
          </div>
          <!-- The mark meant something and said so nowhere: a reader met a row
               of chips of which five were picked out and had no way to find out
               what by. -->
          <p v-if="presets.some((preset) => preset.note)" class="presets__key">
            {{ t('emulator.marked') }}
            <a :href="route(`/units/${unitId}/observations`)">{{ t('nav.observations') }}</a>
          </p>
        </div>
      </div>

      <ol v-if="log.length" class="log">
        <li v-for="entry in log" :key="entry.id" class="entry sg-sunk">
          <header class="entry__head">
            <span class="entry__kind sg-label">{{ entry.message.kind }}</span>
            <span class="entry__sent sg-readout">{{ formatHexBytes(entry.sent) }}</span>
            <span :class="['sg-state', `sg-state--${stateFor(entry.message.outcome)}`]">
              {{ entry.message.outcome }}
            </span>
          </header>

          <dl class="entry__body">
            <div v-if="entry.message.reply">
              <dt class="sg-label">{{ t('emulator.reply') }}</dt>
              <dd class="sg-readout">{{ formatHexBytes(entry.message.reply) }}</dd>
            </div>
            <div v-else-if="entry.message.stream">
              <dt class="sg-label">{{ t('emulator.reply') }}</dt>
              <dd>
                {{ entry.message.stream.messages }} messages ·
                {{ entry.message.stream.seconds }} s ·
                {{ entry.message.stream.spacingMs }} ms apart
              </dd>
            </div>
            <div v-else>
              <dt class="sg-label">{{ t('emulator.reply') }}</dt>
              <dd class="entry__absent">{{ t('emulator.noReply') }}</dd>
            </div>

            <div v-if="entry.message.changes.length">
              <dt class="sg-label">{{ t('emulator.changed') }}</dt>
              <dd>
                <ul class="changes">
                  <li v-for="change in entry.message.changes" :key="change.address">
                    <a
                      class="sg-readout"
                      :href="`${route(`/units/${unitId}/map/${change.address.slice(0, 5).replace(' ', '-')}`)}#${change.address.replace(/ /g, '-')}`"
                    >
                      {{ change.address }}
                    </a>
                    <span class="sg-readout changes__pair">
                      {{ change.before ?? '—' }} → {{ change.after ?? '—' }}
                    </span>
                  </li>
                </ul>
              </dd>
            </div>

            <div v-if="entry.message.bankLatch">
              <dt class="sg-label">Bank latch</dt>
              <dd class="sg-readout">
                ch{{ entry.message.bankLatch.channel }} ·
                MSB {{ entry.message.bankLatch.msb ?? '—' }} ·
                LSB {{ entry.message.bankLatch.lsb ?? '—' }} ·
                {{ entry.message.bankLatch.committed ? 'committed' : 'held' }}
              </dd>
            </div>

            <div v-if="entry.message.note || entry.message.outcome === 'unmeasured'">
              <dt class="sg-label">{{ t('emulator.outcome') }}</dt>
              <dd class="entry__note">
                {{ entry.message.note ?? t('emulator.unmeasured') }}
              </dd>
            </div>

            <div v-if="entry.message.citations.length">
              <dt class="sg-label">{{ t('emulator.why') }}</dt>
              <dd>
                <ul class="citations">
                  <li v-for="citation in entry.message.citations" :key="citationLabel(citation)">
                    <RecordLink
                      v-if="citation.kind === 'record'"
                      :unit-id="unitId"
                      :path="citation.path"
                    />
                    <a
                      v-else-if="citation.kind === 'behaviour'"
                      class="citations__behaviour"
                      :href="`${route(`/units/${unitId}/observations`)}#${citation.id}`"
                    >
                      {{ citation.id }}
                    </a>
                    <span v-else class="citations__dataset">{{ citation.field }}</span>
                    <span v-if="citation.note" class="citations__note">{{ citation.note }}</span>
                  </li>
                </ul>
              </dd>
            </div>
          </dl>
        </li>
      </ol>
    </template>
  </section>
</template>

<style scoped>
.console h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 500;
  border: none;
  padding: 0;
}

.console__lede {
  margin: var(--space-3) 0 var(--space-6);
  max-width: var(--sg-measure-wide);
  font-family: var(--font-reading);
  font-size: 0.92rem;
  line-height: 1.8;
  color: var(--color-text-secondary);
}

.console__status {
  font-size: 0.85rem;
  color: var(--color-text-tertiary);
}

.panel {
  padding: var(--space-5);
}

.panel__row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-4);
  flex-wrap: wrap;
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--sg-rule-soft);
}

.panel__state {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.panel__state .sg-state {
  font-size: 0.85rem;
}

.panel__actions {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}

button {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.04em;
  padding: 0.4rem 0.7rem;
  color: var(--color-text-secondary);
  background: none;
  border: 1px solid var(--sg-rule);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: border-color var(--transition-fast), color var(--transition-fast);
}

button:hover:not(:disabled) {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

button:disabled {
  opacity: 0.4;
  cursor: default;
}

.panel__input {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-top: var(--space-4);
}

.panel__field {
  display: flex;
  gap: var(--space-2);
}

.panel__field input {
  flex: 1 1 auto;
  min-width: 0;
  padding: 0.6rem 0.75rem;
  font-size: 0.9rem;
  letter-spacing: 0.06em;
  color: var(--color-text-primary);
  background: var(--sg-panel-sunk);
  border: 1px solid var(--sg-rule);
  border-radius: var(--radius-sm);
}

.panel__field input:focus {
  outline: none;
  border-color: var(--vp-c-brand-1);
}

.panel__send {
  flex: none;
}

.panel__hint {
  margin: 0.4rem 0 0;
  font-size: 0.72rem;
  color: var(--color-text-tertiary);
}

.presets {
  margin-top: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.presets__list {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.presets__key {
  margin: var(--space-3) 0 0;
  font-family: var(--font-reading);
  font-size: 0.75rem;
  line-height: 1.7;
  color: var(--color-text-tertiary);
}

.presets__key a {
  color: var(--vp-c-brand-1);
  text-decoration: none;
}

.presets__key a:hover {
  text-decoration: underline;
}

/* A preset that leads somewhere the archive recorded a behaviour for is marked,
   because those are the ones worth pressing first.

   In ink, not in `--sg-heard`. That token means one thing — a parameter reached
   the signal path — and "there is a recorded behaviour behind this message" is
   not it. Borrowing it here made amber say two things on one site, which is the
   one thing the four are for. The mark is the readout's own colour at full
   strength against neighbours that are not, the way a differing claim is set
   apart on the address card. */
.preset--quirk {
  border-color: color-mix(in srgb, var(--sg-readout) 45%, transparent);
  color: var(--color-text-primary);
  font-weight: 500;
}

.preset--quirk:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.log {
  list-style: none;
  margin: var(--space-5) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.entry {
  padding: var(--space-4);
}

.entry__head {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  flex-wrap: wrap;
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--sg-rule-soft);
}

.entry__sent {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 0.78rem;
  overflow-wrap: anywhere;
}

.entry__body {
  margin: 0;
  display: grid;
  gap: var(--space-3);
}

.entry__body > div {
  display: grid;
  grid-template-columns: 8rem 1fr;
  gap: var(--space-3);
  align-items: baseline;
}

.entry__body dt {
  margin: 0;
}

.entry__body dd {
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.entry__absent,
.entry__note {
  color: var(--color-text-tertiary);
}

.changes,
.citations {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.changes li {
  display: flex;
  gap: var(--space-3);
  align-items: baseline;
}

.changes a {
  color: var(--vp-c-brand-1);
  text-decoration: none;
}

.changes a:hover {
  text-decoration: underline;
}

.changes__pair {
  font-size: 0.75rem;
  color: var(--color-text-tertiary);
}

.citations li {
  display: flex;
  gap: var(--space-3);
  align-items: baseline;
  flex-wrap: wrap;
}

.citations__behaviour {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--color-text-tertiary);
  text-decoration: none;
  border-bottom: 1px dotted var(--sg-rule);
}

.citations__behaviour:hover {
  color: var(--vp-c-brand-1);
}

.citations__dataset {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--sg-unasked);
}

.citations__note {
  font-family: var(--font-reading);
  font-size: 0.75rem;
  color: var(--color-text-tertiary);
}

@media (max-width: 640px) {
  .entry__body > div {
    grid-template-columns: 1fr;
    gap: 0.25rem;
  }
}
</style>
