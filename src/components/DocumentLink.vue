<script setup lang="ts">
import { computed } from 'vue';
import type { CitedDocument } from '../composables/useArchive';
import { useI18n } from '../composables/useI18n';

/**
 * A citation of the page a claim was read from.
 *
 * `RecordLink` points at the record that established a measurement; this points
 * at the page that stated a claim, and every claim on this site carries one for
 * the same reason. The difference is that it is not a link: the document is not
 * this project's to publish and is not hosted here, so what is offered is what a
 * reader needs to find the page in their own copy — the edition, and the number
 * printed on the page it was read from.
 */
const props = defineProps<{ document: CitedDocument; page: number }>();

const { t } = useI18n();

const title = computed(() =>
  [props.document.publisher, props.document.printing, `© ${props.document.copyright}`]
    .filter(Boolean)
    .join(' · '),
);
</script>

<template>
  <span class="sg-cite" :title="title">
    {{ document.title }}
    <span class="sg-cite__page">{{ t('claims.page', { page }) }}</span>
  </span>
</template>

<style scoped>
/* No underline. This is a citation and not a link — the document is not hosted
   here and there is nowhere to go — so an underline would be an affordance
   offering something that is not there. Down a table of seventy rows all
   citing the same edition it was noise as well; what carries the citation is
   the monospace and the page number set a shade brighter than the title. */
.sg-cite {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.01em;
  color: var(--color-text-muted);
  cursor: help;
}

.sg-cite__page {
  color: var(--color-text-tertiary);
}
</style>
