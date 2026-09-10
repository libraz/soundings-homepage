<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from '../composables/useI18n';
import RecordLink from './RecordLink.vue';

/**
 * Several records establishing one statement, without three file names
 * outweighing the statement.
 *
 * The archive scanned some stimuli twice — once over a region prefix and once
 * over the whole map — so one message arrives from three records whose names
 * differ by a word. Set out in full they took more of the row than the finding
 * did, and three near-identical paths read as noise rather than as provenance:
 * a reader scanning "what reaches this address" was scanning past them.
 *
 * The first record is always shown, so every statement still carries a link to
 * a record that established it. The rest are one keystroke away and counted, so
 * the fact that there are more is on the page rather than hidden.
 */
const props = defineProps<{
  unitId: string;
  /** Paths inside the unit's directory, in the order the archive lists them. */
  paths: string[];
  /** Show only file names rather than whole paths. */
  compact?: boolean;
}>();

const { t } = useI18n();

const open = ref(false);

const first = computed(() => props.paths[0]);
const rest = computed(() => props.paths.slice(1));
</script>

<template>
  <span v-if="first" class="records">
    <RecordLink :unit-id="unitId" :path="first" :compact="compact" />
    <template v-if="rest.length">
      <RecordLink
        v-for="path in open ? rest : []"
        :key="path"
        :unit-id="unitId"
        :path="path"
        :compact="compact"
      />
      <button
        type="button"
        class="records__more"
        :aria-expanded="open"
        :title="t('address.alsoIn', { count: rest.length })"
        @click="open = !open"
      >
        {{ open ? '−' : t('address.moreRecords', { count: rest.length }) }}
      </button>
    </template>
  </span>
</template>

<style scoped>
.records {
  display: inline-flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.5rem;
}

/* The same size and colour as the record links it stands for, so it reads as
   one more of them rather than as a control that wandered into the row. */
.records__more {
  padding: 0 0.25rem;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  line-height: 1.4;
  color: var(--color-text-muted);
  background: none;
  border: 1px solid var(--sg-rule-soft);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: color var(--transition-fast), border-color var(--transition-fast);
}

.records__more:hover,
.records__more:focus-visible {
  outline: none;
  color: var(--vp-c-brand-1);
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 45%, transparent);
}
</style>
