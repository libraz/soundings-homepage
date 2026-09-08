<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from '../composables/useI18n';

/**
 * One measurement state, drawn the same way everywhere on the site.
 *
 * `state` is the semantic, not the wording: a chip is heard, silent, refused or
 * unasked, and the four are the only colours the site uses. `wording` is the
 * archive's own phrase, which the chip shortens for display and keeps in full
 * as its title so the exact finding is always one hover away.
 */
const props = defineProps<{
  state: 'heard' | 'silent' | 'refused' | 'unasked';
  wording?: string;
  /** Show the archive's full sentence beside the chip rather than only on hover. */
  expanded?: boolean;
}>();

const { short, full } = useI18n();
const label = computed(() => (props.wording ? short(props.wording) : ''));
const sentence = computed(() => (props.wording ? full(props.wording) : ''));
</script>

<template>
  <span class="sg-chip">
    <span :class="['sg-state', `sg-state--${state}`]" :title="sentence">{{ label }}</span>
    <span v-if="expanded && sentence && sentence !== label" class="sg-chip__full">{{ sentence }}</span>
  </span>
</template>

<style scoped>
.sg-chip {
  display: inline-flex;
  align-items: baseline;
  gap: 0.55em;
  flex-wrap: wrap;
}

.sg-chip__full {
  font-family: var(--font-reading);
  font-size: 0.8125rem;
  line-height: 1.5;
  color: var(--color-text-secondary);
}
</style>
