<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from '../composables/useI18n';

/**
 * A link to the record a statement came from.
 *
 * Nothing on this site is asserted without one. The archive is the authority
 * and this page is a rearrangement of it, so every verdict, every accepted
 * range and every reply the emulator produces carries the path of the file that
 * established it, pointing at the archive rather than at a copy.
 */
const props = withDefaults(
  defineProps<{
    unitId: string;
    /** A path inside the unit's directory, e.g. `block/40-11.json`. Empty for the unit itself. */
    path?: string;
    /** Show only the file name rather than the whole path. */
    compact?: boolean;
    /**
     * Point at a directory rather than a file.
     *
     * A figure counted across every record a unit holds has no one file behind
     * it, and naming an arbitrary one of them would cite a record that does not
     * establish it. The directory is what does.
     */
    tree?: boolean;
  }>(),
  { path: '', compact: false, tree: false },
);

const { t } = useI18n();

const href = computed(() => {
  const kind = props.tree ? 'tree' : 'blob';
  const within = props.path ? `/${props.path}` : '';
  return `https://github.com/libraz/soundings/${kind}/main/data/units/${props.unitId}${within}`;
});

const label = computed(() => {
  if (!props.path) return `${props.unitId}/`;
  return props.compact ? props.path.split('/').pop() : props.path;
});
</script>

<template>
  <a class="sg-record" :href="href" target="_blank" rel="noreferrer" :title="t('address.openInArchive')">
    {{ label }}
  </a>
</template>

<style scoped>
/* Underlined by the text decoration rather than by a bottom border. A 1px
   dotted border lands on whatever fraction of a pixel the row it is in happens
   to sit at, so down a table of seventy rows it appeared on some and not on
   others; the decoration is drawn from the baseline and is the same on every
   row. */
.sg-record {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.01em;
  color: var(--color-text-tertiary);
  text-decoration: underline dotted var(--sg-rule);
  text-underline-offset: 0.28em;
  transition: color var(--transition-fast), text-decoration-color var(--transition-fast);
}

.sg-record:hover {
  color: var(--vp-c-brand-1);
  text-decoration-color: currentColor;
}
</style>
