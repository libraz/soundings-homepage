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
const props = defineProps<{
  unitId: string;
  /** A path inside the unit's directory, e.g. `block/40-11.json`. */
  path: string;
  /** Show only the file name rather than the whole path. */
  compact?: boolean;
}>();

const { t } = useI18n();

const href = computed(
  () => `https://github.com/libraz/soundings/blob/main/data/units/${props.unitId}/${props.path}`,
);
const label = computed(() => (props.compact ? props.path.split('/').pop() : props.path));
</script>

<template>
  <a class="sg-record" :href="href" target="_blank" rel="noreferrer" :title="t('address.openInArchive')">
    {{ label }}
  </a>
</template>

<style scoped>
.sg-record {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.01em;
  color: var(--color-text-tertiary);
  text-decoration: none;
  border-bottom: 1px dotted var(--sg-rule);
  transition: color var(--transition-fast), border-color var(--transition-fast);
}

.sg-record:hover {
  color: var(--vp-c-brand-1);
  border-bottom-color: currentColor;
}
</style>
