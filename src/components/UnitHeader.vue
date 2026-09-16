<script setup lang="ts">
import { computed } from 'vue';
import { unit as findUnit } from '../composables/useArchive';
import { useI18n } from '../composables/useI18n';

/**
 * The masthead every page about one unit carries.
 *
 * It answers what was measured before anything measured is shown: which
 * physical box this is, what it says it is when asked, what it claims against
 * what the archive could confirm, and how much of it has been reached. The unit
 * index is bundled, so this costs no request and can sit above a page that is
 * still fetching its own file.
 */
const props = defineProps<{
  unitId: string;
  /**
   * `unit`, `map`, `tones`, `effects`, `algorithms`, `emulator`, `observations`
   * or `documents`.
   */
  active?: string;
}>();

const { t, route } = useI18n();

const found = computed(() => findUnit(props.unitId));

const counts = computed(() => {
  const measured = found.value?.counts;
  if (!measured) return [];
  return [
    { key: 'regions', label: t('counts.regions'), value: measured.regions },
    { key: 'addresses', label: t('counts.addresses'), value: measured.addresses },
    { key: 'audible', label: t('counts.heard'), value: measured.audible },
    { key: 'banks', label: t('counts.banks'), value: measured.banks },
    { key: 'blocks', label: t('counts.blocks'), value: measured.blocks },
  ];
});

const sections = computed(() => [
  { key: 'unit', label: t('common.unit'), path: '' },
  { key: 'map', label: t('nav.map'), path: '/map' },
  { key: 'tones', label: t('nav.tones'), path: '/tones' },
  { key: 'effects', label: t('nav.effects'), path: '/effects' },
  { key: 'algorithms', label: t('nav.algorithms'), path: '/algorithms' },
  { key: 'emulator', label: t('nav.emulator'), path: '/emulator' },
  { key: 'observations', label: t('nav.observations'), path: '/observations' },
  { key: 'documents', label: t('nav.documents'), path: '/documents' },
]);

const current = computed(() => props.active ?? 'unit');
</script>

<template>
  <header v-if="found" class="unit sg-panel">
    <div class="unit__identity">
      <p class="sg-label">{{ t('common.unit') }}</p>
      <!-- Context, not the page's subject: every unit-scoped page carries its
           own h1 from the route table, so this strip identifies the unit the
           page is about without competing with it for the heading level. -->
      <p class="unit__name">
        <span class="unit__maker">{{ found.manufacturer }}</span>
        <span class="unit__model">{{ found.model }}</span>
      </p>
      <p class="unit__id sg-readout">{{ found.id }}</p>
    </div>

    <dl class="unit__facts">
      <div class="fact">
        <dt class="sg-label">{{ t('unit.identity') }}</dt>
        <dd class="fact__value">
          <span v-if="found.identityReply" class="sg-readout fact__frame">
            {{ found.identityReply }}
          </span>
          <span v-else class="fact__absent">{{ t('address.notMeasured') }}</span>
        </dd>
      </div>
      <div class="fact">
        <dt class="sg-label">{{ t('unit.specifications') }}</dt>
        <dd class="fact__value">
          <span class="fact__spec">
            <span class="fact__specLabel">{{ t('unit.claimed') }}</span>
            <span class="sg-readout">{{ found.specificationsClaimed.join(' · ') }}</span>
          </span>
          <span class="fact__spec">
            <span class="fact__specLabel">{{ t('unit.measured') }}</span>
            <span v-if="found.specificationsMeasured.length" class="sg-readout">
              {{ found.specificationsMeasured.join(' · ') }}
            </span>
            <span v-else class="fact__absent">{{ t('address.notMeasured') }}</span>
          </span>
        </dd>
      </div>
    </dl>

    <ul class="counts">
      <li v-for="count in counts" :key="count.key" class="counts__item">
        <span class="counts__value sg-readout">{{ count.value.toLocaleString() }}</span>
        <span class="sg-label">{{ count.label }}</span>
      </li>
    </ul>

    <!-- Equal segments: a Japanese label is a different length from its English
         one, and a selector that resizes under the reader is harder to aim at
         than one whose segments never move. -->
    <nav class="nav sg-sunk">
      <a
        v-for="section in sections"
        :key="section.key"
        class="nav__item"
        :class="{ 'nav__item--current': section.key === current }"
        :href="route(`/units/${found.id}${section.path}`)"
        :aria-current="section.key === current ? 'page' : undefined"
      >
        {{ section.label }}
      </a>
    </nav>
  </header>
  <p v-else class="unit__missing">{{ t('common.loadFailed') }}</p>
</template>

<style scoped>
.unit {
  padding: var(--space-5) var(--space-6) var(--space-4);
}

.unit__identity {
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--sg-rule);
}

.unit__name {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 0.3rem 0 0.35rem;
  padding: 0;
  border: none;
  font-family: var(--font-display);
  font-size: clamp(1.5rem, 4vw, 2rem);
  line-height: 1.1;
  letter-spacing: -0.01em;
}

.unit__maker {
  font-weight: 400;
  color: var(--color-text-secondary);
}

.unit__model {
  font-weight: 500;
}

.unit__id {
  margin: 0;
  font-size: 0.8125rem;
  letter-spacing: 0.04em;
  color: var(--color-text-tertiary);
}

.unit__facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--space-5);
  margin: var(--space-4) 0 0;
  padding-bottom: var(--space-5);
  border-bottom: 1px solid var(--sg-rule-soft);
}

.fact dt {
  margin-bottom: 0.4rem;
}

.fact__value {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.9rem;
}

.fact__frame {
  font-size: 0.82rem;
  line-height: 1.6;
  word-break: break-all;
}

.fact__spec {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
}

.fact__specLabel {
  min-width: 5rem;
  font-size: 0.8125rem;
  color: var(--color-text-tertiary);
}

.fact__absent {
  font-family: var(--font-reading);
  font-size: 0.78rem;
  color: var(--color-text-tertiary);
}

/* The readouts are the loudest thing in the header, so they need room to be
   that. Set tight under the hairline above them they read as an overflow of
   the block before rather than as a band of their own, and the numerals — set
   at 1.35rem with a line-height of 1 — end up all but touching the rule. The
   band therefore owns the space above it rather than borrowing a margin, and
   each figure sits far enough from its label to be read before it. */
.counts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-5) var(--space-8);
  list-style: none;
  margin: 0;
  padding: var(--space-6) 0 var(--space-2);
}

.counts__item {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.counts__value {
  font-size: 1.3rem;
  line-height: 1.1;
  font-weight: 500;
}

.nav {
  display: flex;
  gap: 2px;
  margin-top: var(--space-5);
  padding: 3px;
}

.nav__item {
  flex: 1 1 0;
  min-width: 0;
  padding: 0.5rem 0.4rem;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  font-size: 0.78rem;
  line-height: 1.3;
  text-align: center;
  text-decoration: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--color-text-secondary);
  transition: color var(--transition-fast), background var(--transition-fast);
}

/* Hover says where the pointer is, and it is tinted with the page's own ink
   rather than the brand: brand in this strip means "this is the page you are
   on", and a hovered segment wearing it put two segments in that state at once. */
.nav__item:hover {
  color: var(--color-text-primary);
  background: color-mix(in srgb, var(--color-text-primary) 7%, transparent);
}

/* A full border and a tint rather than an edge stripe, so the selected segment
   reads the same in either theme and at any width. */
.nav__item--current {
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 28%, transparent);
  background: color-mix(in srgb, var(--vp-c-brand-1) 8%, transparent);
  color: var(--vp-c-brand-1);
}

/* Stated again because the plain hover rule outranks the class on its own, and
   left to it the segment marking the current page faded under the pointer. */
.nav__item--current:hover {
  background: color-mix(in srgb, var(--vp-c-brand-1) 14%, transparent);
  color: var(--vp-c-brand-1);
}

.unit__missing {
  margin: 0;
  font-size: 0.9rem;
  color: var(--color-text-tertiary);
}

@media (max-width: 640px) {
  .unit {
    padding: var(--space-4);
  }
  .counts {
    gap: var(--space-4) var(--space-5);
  }
  .nav {
    flex-wrap: wrap;
  }
  .nav__item {
    flex: 0 1 auto;
  }
}
</style>
