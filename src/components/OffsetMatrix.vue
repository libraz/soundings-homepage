<script setup lang="ts">
import { computed } from 'vue';
import type { AbsentClaim, AddressRecord, Claim } from '../composables/useArchive';
import { audibleWording } from '../composables/useArchive';
import { useI18n } from '../composables/useI18n';
import type { HexCell } from './HexGrid.vue';
import HexGrid from './HexGrid.vue';

/**
 * One block, drawn as the 128 offsets it is.
 *
 * The same grid as a bank of blocks, one byte further down: the third byte along
 * sixteen columns, which is the layout every hex dump has had for fifty years
 * and the reason a reader can find `2A` without counting. What it shows is the
 * block's two absences kept apart — an offset the archive holds no record of at
 * all, and one it holds a record of that nobody listened to. Collapsing those
 * two into one blank cell is the mistake this site exists to not make.
 *
 * It is also the index to the table below it: 128 rows is more than a screen,
 * and clicking a cell opens that address's card where it sits.
 */
const props = defineProps<{
  block: string;
  /** `measured` draws the records; `stated`, what a document says about them. */
  variant: 'measured' | 'stated';
  records?: AddressRecord[];
  claims?: Claim[];
  /** Rows a document states here that the archive holds no address for. */
  absent?: AbsentClaim[];
}>();

const emit = defineEmits<{ select: [address: string] }>();

const { t, full } = useI18n();

const HEX = '0123456789ABCDEF';

/** Records by their third byte, which is the offset the grid is drawn on. */
const records = computed(
  () => new Map((props.records ?? []).map((record) => [record.a.split(' ')[2], record])),
);

const claimed = computed(
  () => new Map((props.claims ?? []).map((claim) => [claim.a.split(' ')[2], claim])),
);

const unmatched = computed(
  () => new Map((props.absent ?? []).map((row) => [row.a.split(' ')[2], row])),
);

/** The verdicts a later record has not replaced, as the table has them. */
function standing(record: AddressRecord) {
  const entries = record.b ?? [];
  const live = entries.filter((entry) => !entry.sup);
  return live.length > 0 ? live : entries;
}

/**
 * What a record's cell is, in the archive's own words where there are any.
 *
 * A verdict is quoted rather than restated — the grid is showing the same
 * reading the row below it shows, and the two saying it differently would be
 * two claims where the archive made one.
 */
function measured(key: string, address: string): HexCell {
  const record = records.value.get(key);
  if (!record) {
    const state = t('map.grid.absent');
    return { key, kind: 'absent', title: t('map.grid.offsetCell', { address, state }) };
  }

  const verdicts = standing(record);
  let kind = 'unasked';
  let state = t('map.grid.unasked');
  if (verdicts.length > 0) {
    kind = verdicts.some((entry) => entry.v === 'Y') ? 'heard' : 'silent';
    state = full(audibleWording(verdicts[0].v));
  }

  return {
    key,
    kind,
    title: t('map.grid.offsetCell', { address, state }),
    href: `#${record.a.replace(/ /g, '-')}`,
  };
}

/**
 * What a document's cell is.
 *
 * Three states and they are not the four the measurements use: a document is not
 * a measurement, and none of its cells takes a measurement's colour. An offset
 * the document states and the archive holds an address for is filled; one it
 * states and the archive has nothing at is drawn as an outline with nothing in
 * it, which is what it is; one the document is silent about is left as the empty
 * place it is.
 */
function stated(key: string, address: string): HexCell {
  const claim = claimed.value.get(key);
  if (claim) {
    return {
      key,
      kind: '3',
      title: t('map.grid.offsetStated', { address, parameter: claim.parameter ?? '—' }),
      href: `#${claim.a.replace(/ /g, '-')}`,
    };
  }

  const row = unmatched.value.get(key);
  if (row) {
    return {
      key,
      kind: 'stated-only',
      title: t('map.grid.offsetUnmatched', { address, parameter: row.parameter ?? '—' }),
    };
  }

  const state = t('map.grid.unstated');
  return { key, kind: 'absent', title: t('map.grid.offsetCell', { address, state }) };
}

const cells = computed<HexCell[]>(() =>
  Array.from({ length: 128 }, (_, index) => {
    const key = `${HEX[Math.floor(index / 16)]}${HEX[index % 16]}`;
    const address = `${props.block} ${key}`;
    return props.variant === 'stated' ? stated(key, address) : measured(key, address);
  }),
);
</script>

<template>
  <HexGrid :corner="block" :rows="8" :cells="cells" @select="emit('select', `${block} ${$event}`)" />
</template>
