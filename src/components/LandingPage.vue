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
    powerOn: sum((unit) => unit.counts.withPowerOn),
    // Every address a stimulus was put to, whichever way the verdict fell. The
    // two are counted apart in the archive because they are different findings;
    // here they are the denominator the one big number needs, and a page that
    // prints 149 without it is printing a numerator on its own.
    listened: sum((unit) => unit.counts.audible + unit.counts.notAudible),
    units: all.length,
  };
});

/** The four figures read back as a sentence, so none of them stands alone. */
const coverage = computed(() =>
  t('landing.coverage', {
    addresses: totals.value.addresses.toLocaleString(),
    powerOn: totals.value.powerOn.toLocaleString(),
    listened: totals.value.listened.toLocaleString(),
    heard: totals.value.audible.toLocaleString(),
  }),
);

const primary = computed(() => all[0]);

/**
 * The five things the archive can be read as, each linking into it.
 *
 * Algorithms sits second because it is the only one of them that answers the
 * question a reader most often arrives with — what is this effect actually
 * doing — and because it is the only part of the site that publishes something
 * a reader can take away and run.
 *
 * Observations is one of them rather than a tab six along, because it is the
 * only part of the archive that is already prose: a reader who has not yet
 * learned what a region is can read that a 256-byte request stops the unit
 * answering, and that is the shortest path from arriving to understanding what
 * kind of thing this is.
 */
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
    key: 'algorithms',
    title: t('nav.algorithms'),
    href: route(`/units/${primary.value?.id}/algorithms`),
    body: t('landing.algorithmsBody'),
  },
  {
    key: 'observations',
    title: t('nav.observations'),
    href: route(`/units/${primary.value?.id}/observations`),
    body: t('landing.observationsBody'),
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
      <!-- No eyebrow above the wordmark. The nav carries the site's name and its
           tagline on every page including this one, and repeating the tagline
           word for word two lines below it read as a page that had been
           assembled rather than written. What the hero says is the one thing
           the nav has no room for. -->
      <div class="hero__inner">
        <h1 class="hero__title">soundings</h1>
        <p class="hero__lede">{{ t('site.lede') }}</p>

        <!-- The line above is what the archive is for; this is what it is. A
             reader who has not seen the site before cannot act on the first
             without the second, and the box below asks them to act. -->
        <p class="hero__what">{{ t('landing.what') }}</p>
        <p class="hero__reading">
          <a :href="route('/docs/')">{{ t('landing.readingLink') }}</a>
        </p>

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
      <!-- The readouts above are numerators. This is what each is out of, which
           is the difference between "149 heard" meaning something and meaning
           nothing at all. -->
      <p class="strip__reading">{{ coverage }}</p>
    </section>

    <!-- The column count is the entry count, so adding one to the list above is
         the whole of adding it to the lattice. -->
    <section class="entries" :style="{ '--entries': entries.length }">
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

/* Set below the lede rather than beside it: the two say different things about
   the same archive, and side by side they read as one paragraph broken in the
   wrong place. Narrower measure than the lede, because it is the longer of the
   two and a line of this size wants fewer characters, not more. */
.hero__what {
  margin: var(--space-4) 0 0;
  max-width: 38rem;
  font-size: 0.9rem;
  line-height: 1.8;
  color: var(--color-text-tertiary);
}

.hero__reading {
  margin: var(--space-3) 0 0;
  font-size: 0.82rem;
}

.hero__reading a {
  color: var(--vp-c-brand-1);
  text-decoration: none;
}

/* The arrow is the affordance, not decoration: the link sits in a block of
   prose the same colour as the sentence above it and needs to read as a place
   to go rather than as a phrase that happens to be tinted. */
.hero__reading a::after {
  content: ' →';
  transition: padding-left var(--transition-fast);
}

.hero__reading a:hover::after {
  padding-left: 0.25em;
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
  padding: var(--space-5) 0 0;
}

.strip__inner dd {
  margin: 0.35rem 0 0;
  font-size: clamp(1.3rem, 3vw, 1.7rem);
  font-weight: 400;
  letter-spacing: 0.02em;
}

.strip__reading {
  margin: 0;
  padding: var(--space-4) 0 var(--space-5);
  max-width: 46rem;
  font-size: 0.82rem;
  line-height: 1.8;
  color: var(--color-text-tertiary);
}

/* Butt the panels together so the grid reads as one instrument face rather
   than four floating cards; only the hovered one lifts out of the lattice.

   The rule is the container showing through a 1px gap, not a border on each
   cell. Four cells wrap to two rows on a narrow desktop, and cells that carry
   their own border double it wherever two meet — the negative margin that hid
   that for a single row put the seam in the wrong place as soon as there were
   two. A gap is one line however the grid breaks. */
/* One column, then two, then one column per entry — never a count that leaves a
   cell empty. `auto-fit` counts how many fit and stops there, which at a desktop
   width just under the full measure is one short, and the last card sat alone
   against an empty plate. The wide count is the number of entries, taken from
   the list itself: written as a number it went stale the first time one was
   added, and a fifth card spent a release beside three empty plates. */
.entries {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  margin-top: var(--space-10);
  background: var(--sg-rule-soft);
  border: 1px solid var(--sg-rule-soft);
}

.entry {
  display: block;
  padding: var(--space-5) var(--space-5) var(--space-6);
  color: inherit;
  text-decoration: none;
  background: var(--vp-c-bg);
  transition: box-shadow var(--transition-default), background-color var(--transition-default);
}

.entry:hover,
.entry:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--vp-c-brand-1) 45%, transparent);
  background: color-mix(in srgb, var(--vp-c-brand-1) 5%, var(--vp-c-bg));
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

/* Two columns and an odd number of entries leave the last one alone on its row.
   It takes the row rather than the half of it, which is the same rule the wide
   layout follows: a plate is either a card or it is not there. */
.entry:nth-child(odd):last-child {
  grid-column: 1 / -1;
}

@media (min-width: 72rem) {
  .entries {
    grid-template-columns: repeat(var(--entries, 4), minmax(0, 1fr));
  }
  .entry:nth-child(odd):last-child {
    grid-column: auto;
  }
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

/* The identifier belongs to the model, so it sits against it rather than in a
   column of its own: given a third of the row it drifted into the middle of an
   empty band with the name at one end and the counts at the other, and the row
   read as three unrelated things instead of one unit. */
.units__list a {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: baseline;
  gap: var(--space-3) var(--space-4);
  padding: var(--space-4) var(--space-2);
  border-bottom: 1px solid var(--sg-rule-soft);
  color: inherit;
  text-decoration: none;
  transition: background-color var(--transition-fast);
}

.units__list a:hover {
  background: color-mix(in srgb, var(--vp-c-brand-1) 6%, transparent);
}

/* The list needs no rule to close it: the section below opens with one, and
   two hairlines a few pixels apart read as a border drawn twice. */
.units__list li:last-child a {
  border-bottom: none;
}

.units__model {
  font-size: 1rem;
}

.units__id,
.units__counts {
  font-size: 0.75rem;
  color: var(--color-text-tertiary);
}

/* The rule runs the width of the page and the text does not. A rule cut to the
   measure of the paragraph under it stops two thirds of the way across, level
   with nothing, and reads as a border that failed rather than as the end of the
   page — which is what it did here. */
.caveat {
  margin-top: var(--space-10);
  padding-top: var(--space-5);
  border-top: 1px solid var(--sg-rule-soft);
}

.caveat p {
  margin: 0 0 var(--space-3);
  max-width: 44rem;
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
  .entries {
    grid-template-columns: minmax(0, 1fr);
  }
  .units__list a {
    grid-template-columns: 1fr;
    gap: 0.25rem;
  }
}
</style>
