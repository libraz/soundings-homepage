<script setup lang="ts">
import { computed } from 'vue';
import type { AlgorithmTitle } from '../composables/useArchive';
import { useI18n } from '../composables/useI18n';

/**
 * What to call a claim about an algorithm, drawn the same way in all three
 * places one appears.
 *
 * The claim's own first sentence states a whole structure, because that is what
 * the claim is, and a list of those is not an index — it is the pages the index
 * was supposed to lead to. What a reader is looking for at that point is the
 * effect they already know the name of, and the only record of that name is the
 * appendix a manual prints. So the head of a claim is the document's words.
 *
 * It is a printed statement and is drawn as one: the manual's spelling, kept as
 * printed and never translated, with the page it was read from beside it. It
 * takes none of the four colours, which stand for what a *measurement* can be.
 *
 * Where no document reaches what the claim is about — one of these is about
 * every parameter on the unit at once — there is no printed name to give, and
 * the archive's own words stand in, marked as the archive's.
 */
const props = defineProps<{
  title: AlgorithmTitle | null;
  named: string | null;
  claim: string | null;
}>();

const { t, claimed, claimedIsQuoted } = useI18n();

/** The archive's own words, for a claim no printed page names. */
const fallback = computed(() => claimed(props.named) || claimed(props.claim) || '');

const quoted = computed(() => claimedIsQuoted(props.named ? props.named : props.claim));
</script>

<template>
  <span v-if="title" class="name">
    <span class="name__printed">
      <template v-for="(entry, index) in title.names" :key="entry.name">
        <span v-if="index > 0" class="name__join">{{ ' · ' }}</span>
        <span class="name__type">{{ entry.name }}</span>
      </template>
      <span v-if="title.more" class="name__more"
        ><span class="name__join">{{ ' ' }}</span
        >{{ t('algorithms.andMoreTypes', { count: title.more }) }}</span
      >
    </span>

    <span v-if="title.parameters.length" class="name__params"
      ><span class="name__join">{{ ' ' }}</span>
      <template v-for="(entry, index) in title.parameters" :key="entry.name">
        <span v-if="index > 0" class="name__join">{{ ' / ' }}</span>
        <span>{{ entry.name }}</span>
      </template>
      <span v-if="title.parametersMore" class="name__more"
        ><span class="name__join">{{ ' ' }}</span
        >{{ t('algorithms.andMoreParameters', { count: title.parametersMore }) }}</span
      >
    </span>
  </span>

  <span v-else class="name name--unprinted" :class="{ 'sg-quoted': quoted }">{{ fallback }}</span>
</template>

<style scoped>
.name {
  display: inline;
  font-family: var(--font-display);
  line-height: 1.5;
  color: var(--color-text-primary);
}

/* The manual's own spelling. Kept in the reading face rather than the readout
   face: a readout is what the unit answered, and this is what a page printed. */
.name__type {
  font-weight: 500;
}

/* The parameter inside the type, a shade back from it. Same line: "Phaser" and
   "Reso" are one name for one thing, and set on two lines they read as a
   heading with a subheading under it, which is a claim about two things. */
.name__params {
  margin-left: 0.2em;
  font-size: 0.92em;
  font-weight: 400;
  color: var(--color-text-secondary);
}

/* Every boundary in this name carries its own space rather than being drawn by
   a margin alone. Drawn by a margin, the parts came out of a screen reader as
   one word: "Stereo-EQStereo ChorusStereo Delay", "PhaserReso". The margins
   that remain widen a space that is already in the text. */
.name__join {
  color: var(--color-text-muted);
  white-space: pre;
}

.name__more {
  margin-left: 0.15em;
  font-family: var(--font-mono);
  font-size: 0.74em;
  letter-spacing: 0.02em;
  color: var(--color-text-tertiary);
}

/* A claim nothing printed reaches. Set in the reading face at the same size:
   it is standing in for a name, not being quoted as evidence. */
.name--unprinted {
  font-family: var(--font-reading);
  font-weight: 400;
}
</style>
