<script setup lang="ts">
import type { ProseRun } from '../composables/prose';

/**
 * A block of the archive's prose, set the way the record wrote it.
 *
 * The record heads the part of an argument it wants read first with a sentence
 * of its own, and that is the only mark its prose carries. Everything about how
 * the block reads — its measure, its colour, whether it is marked as a quotation
 * — is the caller's, and arrives on the element as an ordinary class.
 *
 * `tag` is there for the few places the prose sits inside a sentence the page
 * wrote, where a paragraph would not be legal markup.
 */
withDefaults(defineProps<{ runs: ProseRun[]; tag?: string }>(), { tag: 'p' });
</script>

<template>
  <component :is="tag">
    <template v-for="(run, at) in runs" :key="at">
      <strong v-if="run.emphasised">{{ run.text }}</strong>
      <template v-else>{{ run.text }}</template>
    </template>
  </component>
</template>

<style scoped>
/* The record's own emphasis, at the ink the page already uses rather than in a
   colour. The four colours say what a measurement is and the accent says a
   model closed; a sentence the archive wants read first says neither. */
strong {
  font-weight: 600;
  color: var(--color-text-primary);
}
</style>
