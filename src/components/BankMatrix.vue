<script setup lang="ts">
import { computed } from 'vue';
import { audibleWording } from '../composables/useArchive';
import { useI18n } from '../composables/useI18n';
import type { HexCell } from './HexGrid.vue';
import HexGrid from './HexGrid.vue';

/**
 * One bank, drawn as the grid of blocks its second byte actually is.
 *
 * The list of blocks the archive holds is a list because that is how the sweep
 * wrote it, and reading it as one gives no sense of the space: eighty-five rows
 * say nothing about the fact that bank 40 is mapped in two runs with a gap
 * between them, or that the twelve window banks are the same shape as each
 * other. Laid out at sixteen columns the second byte is where it belongs, and
 * the shape of what was reached is legible before a single number is read.
 *
 * The same bank is drawn twice, once for each of the two things the site holds
 * about it, and never as one picture with both in it: what a document states is
 * shown apart from what was measured. Side by side and on the same geometry, a
 * block the manual covers and a block the archive reached are the same square in
 * two grids, so the reader compares them by looking rather than by being told.
 */
const props = defineProps<{
  unitId: string;
  bank: string;
  /**
   * How many rows of sixteen to draw. Set from the bank's mapped extent by the
   * caller and passed to both grids, so a block sits at the same square in each.
   */
  rows: number;
  /** `measured` counts addresses the archive holds; `stated`, claims joined. */
  variant: 'measured' | 'stated';
  blocks: {
    block: string;
    /** Addresses held, or claims joined, depending on the variant. */
    count: number;
    /** Audibility, on the measured grid only. */
    heard?: { y: number; n: number; x: number } | null;
    /** Rows the document states here that the archive holds no address for. */
    absent?: number;
  }[];
}>();

const { t, list, short, route } = useI18n();

/** A block is one byte of offset, so this many addresses wide at most. */
const BLOCK_WIDTH = 128;

const HEX = '0123456789ABCDEF';

const held = computed(() => new Map(props.blocks.map((row) => [row.block.split('-')[1], row])));

/**
 * How full the cell is drawn.
 *
 * Four steps rather than a continuous ramp: the reader is being told that this
 * block holds more of itself than that one does, not asked to read a number off
 * a shade. The lightest step is still plainly a fill, because the alternative is
 * that a block holding two addresses looks like a block holding none.
 */
function depthOf(count: number): number {
  const fraction = count / BLOCK_WIDTH;
  if (fraction >= 0.75) return 4;
  if (fraction >= 0.375) return 3;
  if (fraction >= 0.125) return 2;
  return 1;
}

/** The tally in the archive's own words, as the cell's title carries it. */
function tallyOf(heard: { y: number; n: number; x: number }): string {
  return list([
    `${short(audibleWording('Y'))} ${heard.y}`,
    `${short(audibleWording('N'))} ${heard.n}`,
    `${short(audibleWording('X'))} ${heard.x}`,
  ]);
}

/** The mark a cell carries in its corner, and the sentence that goes with it. */
function marked(row: { heard?: { y: number; n: number; x: number } | null; absent?: number }) {
  if (row.heard) return { dot: row.heard.y > 0 ? 'heard' : 'silent', tally: tallyOf(row.heard) };
  if (row.absent) return { dot: 'gap', tally: null };
  return { dot: null, tally: null };
}

const cells = computed<HexCell[]>(() =>
  Array.from({ length: props.rows * 16 }, (_, index) => {
    const key = `${HEX[Math.floor(index / 16)]}${HEX[index % 16]}`;
    const row = held.value.get(key);
    const block = t('map.block', { block: `${props.bank} ${key}` });

    if (!row || row.count === 0) {
      return {
        key,
        kind: 'absent',
        title: t(props.variant === 'stated' ? 'map.grid.cellUnstated' : 'map.grid.cellUnmapped', {
          block,
        }),
      };
    }

    const cell = t(props.variant === 'stated' ? 'map.grid.cellStated' : 'map.grid.cell', {
      block,
      count: row.count.toLocaleString(),
    });
    const mark = marked(row);

    let title = cell;
    if (mark.tally) title = t('map.grid.cellHeard', { cell, tally: mark.tally });
    else if (mark.dot === 'gap')
      title = t('map.grid.cellGap', { cell, count: (row.absent ?? 0).toLocaleString() });

    return {
      key,
      kind: String(depthOf(row.count)),
      dot: mark.dot,
      title,
      href: route(`/units/${props.unitId}/map/${row.block}`),
    };
  }),
);
</script>

<template>
  <HexGrid :corner="bank" :rows="rows" :cells="cells" />
</template>
