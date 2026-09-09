<script lang="ts">
/**
 * The grid every scale of the address space is drawn on.
 *
 * Sixteen columns, the low nibble along the top and the high one down the side,
 * with the byte the two are read against in the corner. It holds no opinion
 * about what a cell means: the caller decides what was measured, what a document
 * states and what is simply not there, and hands over cells already named. That
 * is what lets a bank of blocks, a block of offsets and a document's coverage of
 * either be the same picture, which is the only reason a reader who has learnt
 * one can read the rest.
 */
export interface HexCell {
  /** The two nibbles this cell sits at, e.g. `1A`. */
  key: string;
  /** The `sg-cell--` modifier that draws it. */
  kind: string;
  /** A mark in the corner, when the cell has something further to say. */
  dot?: string | null;
  title: string;
  href?: string | null;
}
</script>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  /** The byte the row and column nibbles are read against. */
  corner: string;
  /** How many rows of sixteen to draw. */
  rows: number;
  /** Row-major, `rows * 16` of them. */
  cells: HexCell[];
}>();

const emit = defineEmits<{ select: [key: string] }>();

const HEX = '0123456789ABCDEF';

const columns = computed(() => Array.from({ length: 16 }, (_, lo) => HEX[lo]));

const grid = computed(() =>
  Array.from({ length: props.rows }, (_, hi) => ({
    label: `${HEX[hi]}_`,
    cells: props.cells.slice(hi * 16, hi * 16 + 16),
  })),
);
</script>

<template>
  <div class="sg-matrix">
    <div class="sg-matrix__row">
      <span class="sg-matrix__corner sg-readout" aria-hidden="true">{{ corner }}</span>
      <span v-for="column in columns" :key="column" class="sg-matrix__axis" aria-hidden="true">
        {{ column }}
      </span>
    </div>

    <div v-for="row in grid" :key="row.label" class="sg-matrix__row">
      <span class="sg-matrix__axis sg-matrix__axis--row" aria-hidden="true">{{ row.label }}</span>
      <template v-for="cell in row.cells" :key="cell.key">
        <a
          v-if="cell.href"
          class="sg-cell"
          :class="`sg-cell--${cell.kind}`"
          :href="cell.href"
          :title="cell.title"
          :aria-label="cell.title"
          @click="emit('select', cell.key)"
        >
          <span v-if="cell.dot" class="sg-cell__dot" :class="`sg-cell__dot--${cell.dot}`" />
        </a>
        <!-- Not a link and not a blank: a place nothing has been recorded about
             is drawn as one, so it can never be read as a zero. -->
        <span v-else class="sg-cell" :class="`sg-cell--${cell.kind}`" :title="cell.title">
          <span v-if="cell.dot" class="sg-cell__dot" :class="`sg-cell__dot--${cell.dot}`" />
        </span>
      </template>
    </div>
  </div>
</template>
