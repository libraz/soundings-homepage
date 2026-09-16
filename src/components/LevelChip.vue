<script setup lang="ts">
import { computed } from 'vue';
import type { AlgorithmLevel } from '../composables/useArchive';
import { useI18n } from '../composables/useI18n';

/**
 * How far a claim about an algorithm got, drawn the same way everywhere.
 *
 * It is the archive's own state and the archive's own verdict, never a reading
 * taken here, and it carries none of the site's four hues: those stand for the
 * four things a *measurement* can be, and how far a reading of several of them
 * reached is a different question with a different shape.
 *
 * `why` is the archive's word for the state it is in — the verdict that closed
 * it, or the thing still open — and is offered on hover rather than printed,
 * because the chip appears in lists where a sentence per row would be the list.
 */
const props = defineProps<{
  level: AlgorithmLevel;
  /** The archive's own reason, shown on hover. */
  why?: string | null;
  /** Print the reason beside the chip rather than only on hover. */
  expanded?: boolean;
}>();

const { t } = useI18n();

const label = computed(() => t(`algorithms.level.${props.level}`));

/**
 * A verdict has a sentence written for it; anything else is the archive's own
 * phrase and is shown as it stands.
 */
const reason = computed(() => {
  if (!props.why) return '';
  const written = t(`algorithms.verdict.${props.why}`);
  return written === `algorithms.verdict.${props.why}` ? props.why : written;
});
</script>

<template>
  <span class="chip">
    <span :class="['sg-level', `sg-level--${level}`]" :title="reason || label">{{ label }}</span>
    <span v-if="expanded && reason" class="chip__why">{{ reason }}</span>
  </span>
</template>

<style scoped>
.chip {
  display: inline-flex;
  align-items: baseline;
  gap: 0.55em;
  flex-wrap: wrap;
}

.chip__why {
  font-family: var(--font-reading);
  font-size: 0.8125rem;
  line-height: 1.5;
  color: var(--color-text-secondary);
}
</style>
