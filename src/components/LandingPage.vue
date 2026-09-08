<script setup lang="ts">
import { computed } from 'vue';
import { units } from '../composables/useArchive';
import { useI18n } from '../composables/useI18n';
import AddressSearch from './AddressSearch.vue';

/**
 * The front page.
 *
 * It is a lookup, not a pitch. The one thing a reader wants on arriving is to
 * put an address in, so the box is the first thing under the title and the
 * rest of the page sits below it as context for what came back. The counts are
 * read off the archive rather than written down, so a page that says the
 * archive holds 854 regions is saying what this build actually contains.
 */
const { t, route } = useI18n();

const all = units();

const totals = computed(() => {
  const sum = (pick: (unit: (typeof all)[number]) => number) =>
    all.reduce((total, unit) => total + pick(unit), 0);
  return {
    addresses: sum((unit) => unit.counts.addresses),
    regions: sum((unit) => unit.counts.regions),
    audible: sum((unit) => unit.counts.audible),
    units: all.length,
  };
});

const primary = computed(() => all[0]);

/** The three things the archive can be read as, each linking into it. */
const entries = computed(() => [
  {
    key: 'map',
    title: t('nav.map'),
    href: route(`/units/${primary.value?.id}/map`),
    body: t('landing.mapBody'),
  },
  {
    key: 'catalogues',
    title: `${t('nav.tones')} / ${t('nav.effects')}`,
    href: route(`/units/${primary.value?.id}/tones`),
    body: t('landing.cataloguesBody'),
  },
  {
    key: 'emulator',
    title: t('nav.emulator'),
    href: route(`/units/${primary.value?.id}/emulator`),
    body: t('landing.emulatorBody'),
  },
]);
</script>

<template>
  <div class="landing">
    <section class="hero">
      <div class="hero__inner">
        <p class="hero__eyebrow sg-label">{{ t('site.tagline') }}</p>
        <h1 class="hero__title">soundings</h1>
        <p class="hero__lede">{{ t('site.lede') }}</p>

        <div class="hero__console sg-panel">
          <AddressSearch />
        </div>
      </div>
    </section>

    <section class="strip">
      <dl class="strip__inner">
        <div>
          <dt class="sg-label">{{ t('counts.addresses') }}</dt>
          <dd class="sg-readout">{{ totals.addresses.toLocaleString() }}</dd>
        </div>
        <div>
          <dt class="sg-label">{{ t('counts.regions') }}</dt>
          <dd class="sg-readout">{{ totals.regions.toLocaleString() }}</dd>
        </div>
        <div>
          <dt class="sg-label">{{ t('counts.heard') }}</dt>
          <dd class="sg-readout">{{ totals.audible.toLocaleString() }}</dd>
        </div>
        <div>
          <dt class="sg-label">{{ t('counts.units') }}</dt>
          <dd class="sg-readout">{{ totals.units }}</dd>
        </div>
      </dl>
    </section>

    <section class="entries">
      <a v-for="entry in entries" :key="entry.key" class="entry" :href="entry.href">
        <h2 class="entry__title">{{ entry.title }}</h2>
        <p class="entry__body">{{ entry.body }}</p>
      </a>
    </section>

    <section class="units">
      <h2 class="units__head sg-label">{{ t('nav.units') }}</h2>
      <ul class="units__list">
        <li v-for="unit in all" :key="unit.id">
          <a :href="route(`/units/${unit.id}`)">
            <span class="units__model">{{ unit.manufacturer }} {{ unit.model }}</span>
            <span class="units__id sg-readout">{{ unit.id }}</span>
            <span class="units__counts">
              {{ t('map.regions', { count: unit.counts.regions.toLocaleString() }) }} ·
              {{ t('map.addresses', { count: unit.counts.addresses.toLocaleString() }) }}
            </span>
          </a>
        </li>
      </ul>
    </section>

    <section class="caveat">
      <p>{{ t('landing.caveat') }}</p>
      <p class="caveat__legal">{{ t('common.notAffiliated') }}</p>
    </section>
  </div>
</template>

<style scoped>
.landing {
  max-width: 68rem;
  margin: 0 auto;
  padding: 0 var(--space-6) var(--space-12);
}

/* The graticule is the only ornament on the page: a faint dot lattice, the
   scale of a panel's silk-screen, fading out before it reaches the content. */
.hero {
  position: relative;
  padding: clamp(3rem, 9vw, 6rem) 0 var(--space-10);
}

.hero::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: radial-gradient(currentColor 1px, transparent 1px);
  background-size: 22px 22px;
  color: var(--color-text-primary);
  opacity: 0.05;
  mask-image: radial-gradient(ellipse 80% 70% at 50% 30%, #000 20%, transparent 75%);
  pointer-events: none;
}

.hero__inner {
  position: relative;
}

.hero__eyebrow {
  margin: 0 0 var(--space-4);
}

.hero__title {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(2.6rem, 7vw, 4.2rem);
  font-weight: 300;
  letter-spacing: -0.015em;
  line-height: 1;
  color: var(--color-text-primary);
}

.hero__lede {
  margin: var(--space-4) 0 0;
  max-width: 34rem;
  font-size: 1.02rem;
  line-height: 1.7;
  color: var(--color-text-secondary);
}

.hero__console {
  margin-top: var(--space-8);
  padding: var(--space-5) var(--space-6) var(--space-6);
  box-shadow: var(--shadow-raised);
}

.strip {
  border-top: 1px solid var(--sg-rule);
  border-bottom: 1px solid var(--sg-rule);
}

.strip__inner {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  gap: var(--space-5);
  margin: 0;
  padding: var(--space-5) 0;
}

.strip__inner dd {
  margin: 0.35rem 0 0;
  font-size: clamp(1.3rem, 3vw, 1.7rem);
  font-weight: 400;
  letter-spacing: 0.02em;
}

.entries {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
  gap: 0;
  margin-top: var(--space-10);
}

.entry {
  display: block;
  padding: var(--space-5) var(--space-5) var(--space-6);
  color: inherit;
  text-decoration: none;
  border: 1px solid var(--sg-rule-soft);
  transition: border-color var(--transition-default), background-color var(--transition-default);
}

/* Butt the panels together so the grid reads as one instrument face rather
   than three floating cards; only the hovered one lifts out of the lattice. */
.entries .entry + .entry {
  margin-left: -1px;
}

.entry:hover {
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 45%, transparent);
  background: color-mix(in srgb, var(--vp-c-brand-1) 5%, transparent);
}

.entry__title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.05rem;
  font-weight: 500;
  letter-spacing: 0;
  border: none;
  padding: 0;
}

.entry__body {
  margin: var(--space-3) 0 0;
  font-size: 0.85rem;
  line-height: 1.7;
  color: var(--color-text-secondary);
}

.units {
  margin-top: var(--space-10);
}

.units__head {
  margin: 0 0 var(--space-3);
  border: none;
  padding: 0;
}

.units__list {
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--sg-rule);
}

.units__list a {
  display: grid;
  grid-template-columns: minmax(10rem, 1fr) minmax(0, 12rem) auto;
  align-items: baseline;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-2);
  border-bottom: 1px solid var(--sg-rule-soft);
  color: inherit;
  text-decoration: none;
  transition: background-color var(--transition-fast);
}

.units__list a:hover {
  background: color-mix(in srgb, var(--vp-c-brand-1) 6%, transparent);
}

.units__model {
  font-size: 1rem;
}

.units__id,
.units__counts {
  font-size: 0.75rem;
  color: var(--color-text-tertiary);
}

.caveat {
  margin-top: var(--space-10);
  padding-top: var(--space-5);
  border-top: 1px solid var(--sg-rule-soft);
  max-width: 44rem;
}

.caveat p {
  margin: 0 0 var(--space-3);
  font-size: 0.82rem;
  line-height: 1.8;
  color: var(--color-text-tertiary);
}

.caveat__legal {
  font-size: 0.75rem;
}

@media (max-width: 768px) {
  .landing {
    padding: 0 var(--space-4) var(--space-10);
  }
  .hero__console {
    padding: var(--space-4);
  }
  .entries .entry + .entry {
    margin-left: 0;
    margin-top: -1px;
  }
  .units__list a {
    grid-template-columns: 1fr;
    gap: 0.25rem;
  }
}
</style>
