<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from '../composables/useI18n';

/**
 * A word the archive uses, with its meaning within reach.
 *
 * The labels on this site are the archive's own vocabulary and stay that way:
 * an address is not renamed to something a specification calls it, and a
 * verdict is not paraphrased into a friendlier word. What a first reader is
 * missing is not a different word but the one sentence that says what this one
 * means — so the sentence is put beside the label rather than the label being
 * replaced, and the glossary entry it was taken from is one click away.
 *
 * `name` is both the string table key and the glossary anchor, which is why the
 * glossary carries explicit `{#slug}` anchors rather than ones derived from its
 * headings: a Japanese heading slugifies to a Japanese anchor, and one link
 * cannot then serve both locales. `yarn check:docs` fails when a term here has
 * no anchor to land on.
 */
const props = defineProps<{
  /** A glossary slug, e.g. `write-probe`. */
  name: string;
}>();

const { t, route } = useI18n();

const definition = computed(() => t(`terms.${props.name}`));
const href = computed(() => `${route('/docs/glossary')}#${props.name}`);
</script>

<template>
  <a class="sg-term" :href="href" :title="definition">
    <slot />
  </a>
</template>

<style scoped>
/* Inherits everything it is set in — this lands inside `.sg-label`, a table
   heading and a run of body text, and has to be the same mark in all three.
   The only thing it adds is the underline that says there is something here,
   drawn from the baseline rather than as a border so it sits identically on
   every row of a long table. */
.sg-term {
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  text-decoration: underline dotted var(--sg-rule);
  text-underline-offset: 0.3em;
  text-decoration-thickness: 1px;
  /* The pointer says "definition", not "somewhere else": the link is a way to
     read more, and the tooltip is the whole answer for most readers. */
  cursor: help;
  transition: color var(--transition-fast), text-decoration-color var(--transition-fast);
}

.sg-term:hover,
.sg-term:focus-visible {
  color: var(--vp-c-brand-1);
  text-decoration-color: currentColor;
}
</style>
