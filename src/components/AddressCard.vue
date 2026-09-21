<script setup lang="ts">
import { computed } from 'vue';
import type {
  AddressRecord,
  AlgorithmLine,
  CitedDocument,
  Claim,
  Region,
  RegionIndex,
} from '../composables/useArchive';
import {
  audibleWording,
  holdWording,
  windowWording,
  writeClassWording,
} from '../composables/useArchive';
import { useI18n } from '../composables/useI18n';
import ClaimTitle from './ClaimTitle.vue';
import DocumentLink from './DocumentLink.vue';
import RecordLink from './RecordLink.vue';
import RecordLinks from './RecordLinks.vue';
import StateChip from './StateChip.vue';
import Term from './Term.vue';

/**
 * Everything the archive holds about one address, on one card.
 *
 * The archive is written stage by stage, so answering "what is at 40 11 30"
 * from it means opening eight files. This is the other side of that: the eight
 * answers side by side, each still carrying the record it came from, and each
 * absence shown as an absence rather than closed over with a default.
 */
const props = defineProps<{
  unitId: string;
  record: AddressRecord;
  region?: Region;
  index?: RegionIndex | null;
  /** What published documents state about this address, if any were read. */
  claims?: Claim[];
  /** The documents those claims came from, for the citation under each. */
  documents?: CitedDocument[];
  /**
   * The claims about what is behind this address, already narrowed to it.
   *
   * A third kind of record, kept apart from the measurements and from what a
   * document states as it is in the archive. Empty where nothing claims this
   * address, which is most of them: a claim is about a handful of addresses.
   */
  algorithms?: AlgorithmLine[];
}>();

const { t, full, list, resetOutcome, stated, statedIsQuoted, stimulus, route } = useI18n();

/** The verdicts a later record has not replaced. */
const standing = computed(() => {
  const entries = props.record.b ?? [];
  const live = entries.filter((entry) => !entry.sup);
  return live.length > 0 ? live : entries;
});

const heardState = computed<'heard' | 'silent' | 'unasked'>(() => {
  const verdicts = standing.value.map((entry) => entry.v);
  if (verdicts.includes('Y')) return 'heard';
  if (verdicts.length === 0) return 'unasked';
  return 'silent';
});

const writeState = computed<'heard' | 'silent' | 'refused' | 'unasked'>(() => {
  if (!props.record.w) return 'unasked';
  return props.record.w.c === 'F' || props.record.w.c === 'U' ? 'refused' : 'silent';
});

/**
 * The record that established what this address accepts.
 *
 * The write probe ran over the whole map once and over a few families since,
 * and an address reached only by one of the later runs is one the map-wide pass
 * never asked. Which run it was is the difference between a range measured with
 * everything else and one measured on its own, so the card names it rather than
 * letting both read alike.
 */
const probedBy = computed(() => props.record.w?.f ?? props.index?.probedBy ?? null);

/**
 * The MIDI messages measured to land here, one row per message.
 *
 * The archive scanned some stimuli twice — once over a region prefix and once
 * over the whole map — so the same message arrives from two records. That is
 * two records establishing one fact, not two facts: the message is listed once
 * and both records are cited.
 */
const aliases = computed(() => {
  const rows = new Map<string, { stimulus: string; channel: number | null; sources: string[] }>();
  for (const alias of props.record.al ?? []) {
    const key = `${alias.s} ${alias.c ?? ''}`;
    const existing = rows.get(key);
    if (existing) {
      if (!existing.sources.includes(alias.f)) existing.sources.push(alias.f);
    } else {
      rows.set(key, { stimulus: alias.s, channel: alias.c, sources: [alias.f] });
    }
  }
  return [...rows.values()];
});

/** Whether the unit has resets to say anything about, whatever this address holds. */
const hasResets = computed(() => (props.index?.resets ?? []).length > 0);

/**
 * The unit's resets, paired with what each did to this address.
 *
 * Empty where the address carries no reset record at all, which is an absence
 * in the archive rather than an outcome and is answered as one. Filling the
 * missing positions with `-` would read as the archive having found the mark
 * would not write here — a statement about the unit that no record makes, and
 * one most of these addresses contradict by accepting every value written to
 * them. Where a record is present the data gate has already held it to one code
 * per reset, so every position is a code the archive put there.
 */
const resets = computed(() => {
  const codes = props.record.r;
  if (!codes) return [];
  return (props.index?.resets ?? []).map((reset, position) => ({
    name: reset.name,
    outcome: resetOutcome(codes[position]),
    differedBy: props.record.rp?.[String(position)] ?? null,
  }));
});

const isWindow = computed(
  () => props.index?.window?.blocks.includes(props.record.a.slice(0, 2)) ?? false,
);

const blockRoute = computed(
  () => `/units/${props.unitId}/map/${props.record.a.slice(0, 5).replace(' ', '-')}`,
);

function documentOf(id: string): CitedDocument | undefined {
  return props.documents?.find((candidate) => candidate.id === id);
}

/** Whether the restated note says what any reset leaves this address at. */
function namesAReset(claim: Claim): boolean {
  return (claim.q?.resets ?? []).some((reset) => reset.stated !== null);
}

/**
 * Whether the two sides were actually held against each other.
 *
 * Only then is the measured value worth showing beside the stated one. Under
 * every other verdict there is nothing to show it against, and putting a
 * measurement next to a claim nobody compared it with would read as a
 * comparison.
 */
function compared(verdict: string): boolean {
  return verdict === 'agrees' || verdict === 'differs';
}

/**
 * How firmly a verdict is put, for emphasis rather than for colour.
 *
 * The four colours this site uses are the states a measurement can be in, and
 * the relation between a document and a measurement is not one of them. So a
 * difference is set apart by weight and a rule, and everything else is quiet.
 */
function verdictKind(verdict: string): string {
  if (verdict === 'differs') return 'differs';
  if (verdict === 'agrees') return 'agrees';
  return 'open';
}
</script>

<template>
  <article class="card sg-panel">
    <header class="card__head">
      <div>
        <p class="sg-label">{{ t('search.address') }}</p>
        <h2 class="card__address sg-readout">{{ record.a }}</h2>
        <p v-if="region" class="card__where">
          <a :href="route(blockRoute)">{{ t('map.block', { block: record.a.slice(0, 5) }) }}</a>
          <span class="card__sep">·</span>
          <span class="sg-readout">{{ region.start }}</span>
          <span class="card__sep">·</span>
          {{ t('address.offset', { offset: (record.o ?? 0) + 1, size: region.size }) }}
        </p>
        <!-- No region because no sweep put one here. That was once only true of
             addresses an offset probe found past a region's end; a targeted
             write probe reaches them too, and both mean the same thing. -->
        <p v-else class="card__where">{{ t('address.notInARegion') }}</p>
      </div>
      <StateChip :state="heardState" :wording="heardState === 'unasked' ? undefined : audibleWording(standing[0]?.v ?? '')" />
    </header>

    <p v-if="isWindow" class="card__window">
      <strong>{{ t('address.window') }}</strong>
      {{
        t('address.windowBody', {
          blocks: index?.window?.blocks.join(', '),
          onto: index?.window?.onto.join(' / '),
        })
      }}
    </p>

    <!-- What it holds, what it takes, and whether its neighbours are it -->
    <dl class="card__readouts">
      <div class="readout">
        <dt class="sg-label"><Term name="power-on-value">{{ t('address.powerOn') }}</Term></dt>
        <dd class="readout__value">
          <span class="sg-readout">{{ record.p ?? '—' }}</span>
          <!-- Named only where the map-wide read is not among the reads that got
               it: those addresses were reached by a later run and by nothing
               else, the same distinction the write probe's own record draws. -->
          <RecordLink v-if="record.pf" :unit-id="unitId" :path="record.pf" compact />
          <!-- The stage asked the space in more than one shape, and two blocks
               of this unit answer a region read and a single read differently.
               Both readings were measured, so the other one is shown here
               rather than the first being left to stand as the state. -->
          <span v-for="other in record.pd ?? []" :key="other.f" class="readout__note">
            {{ t('address.powerOnAlso', { value: other.v }) }}
            <RecordLink :unit-id="unitId" :path="other.f" compact />
          </span>
        </dd>
      </div>
      <!-- Whether this one address holds anything, asked against two named
           stores. The banner above says the same of a whole block where a
           finding covers one; this is the address's own answer, and it carries
           the pair it was measured against because it means nothing without. -->
      <div v-if="record.wd" class="readout">
        <dt class="sg-label">{{ t('address.windowProbe') }}</dt>
        <dd class="readout__value">
          <span class="readout__note">{{ full(windowWording(record.wd.v)) }}</span>
          <span class="readout__note">
            {{ t('address.windowAgainst', { stores: record.wd.s.join(' / ') }) }}
          </span>
          <span v-if="record.wd.w" class="readout__note">
            {{ t('address.windowWriteReached', { address: record.wd.w }) }}
          </span>
          <RecordLink :unit-id="unitId" :path="record.wd.f" compact />
        </dd>
      </div>
      <!-- What the read that found this address got back. A different fact from
           the power-on value and often the only one there is: an address past a
           region's mapped end was reached by one read and by nothing since. -->
      <div class="readout">
        <dt class="sg-label"><Term name="sweep">{{ t('address.sweepValue') }}</Term></dt>
        <dd class="readout__value sg-readout">{{ record.s ?? '—' }}</dd>
      </div>
      <div class="readout">
        <dt class="sg-label"><Term name="write-probe">{{ t('address.accepts') }}</Term></dt>
        <dd class="readout__value">
          <template v-if="record.w">
            <span class="sg-readout readout__range">{{ record.w.r }}</span>
            <StateChip :state="writeState" :wording="writeClassWording(record.w.c)" />
            <span class="readout__note">
              {{ t('address.acceptedOf', { accepted: record.w.n, tried: record.w.t }) }}
            </span>
            <!-- Which run established this. Most addresses were reached by the
                 map-wide pass and say so through the index; the ones a targeted
                 run reached name it themselves, and are the only addresses here
                 the map-wide pass never asked at all. -->
            <RecordLink v-if="probedBy" :unit-id="unitId" :path="probedBy" compact />
          </template>
          <span v-else class="readout__absent">{{ t('address.notMeasured') }}</span>
        </dd>
      </div>
      <div class="readout">
        <dt class="sg-label"><Term name="hold-probe">{{ t('address.neighbours') }}</Term></dt>
        <dd class="readout__value">
          <!-- A run asked on its own answers for this address; the region's own
               verdict is about a different set of addresses and does not. -->
          <template v-if="record.h">
            <StateChip
              :state="record.h.v === 'D' ? 'silent' : 'refused'"
              :wording="holdWording(record.h.v)"
            />
            <span class="readout__note">
              {{ t('address.askedAsARun', { length: record.h.l, start: record.h.s }) }}
            </span>
            <RecordLink :unit-id="unitId" :path="record.h.f" compact />
          </template>
          <StateChip
            v-else-if="region?.hold"
            :state="region.hold === 'D' ? 'silent' : 'refused'"
            :wording="holdWording(region.hold)"
          />
          <span v-else class="readout__absent">{{ t('address.notMeasured') }}</span>
        </dd>
      </div>
    </dl>

    <!-- Which MIDI message was measured to land here -->
    <section v-if="aliases.length" class="card__section">
      <h3 class="sg-label"><Term name="alias">{{ t('address.reachedBy') }}</Term></h3>
      <ul class="alias">
        <li v-for="alias in aliases" :key="`${alias.stimulus}-${alias.channel}`">
          <span class="alias__stimulus sg-readout">{{ alias.stimulus }}</span>
          <span v-if="alias.channel" class="alias__channel">ch{{ alias.channel }}</span>
          <RecordLinks :unit-id="unitId" :paths="alias.sources" compact />
        </li>
      </ul>
    </section>

    <!-- What each reset put back -->
    <section v-if="hasResets" class="card__section">
      <h3 class="sg-label"><Term name="resets">{{ t('address.resets') }}</Term></h3>
      <p v-if="!resets.length" class="card__absent">{{ t('address.notMeasuredBody') }}</p>
      <ul v-else class="resets">
        <li v-for="reset in resets" :key="reset.name">
          <span class="resets__name">{{ reset.name }}</span>
          <span class="resets__outcome" :title="reset.outcome.full">{{ reset.outcome.short }}</span>
          <span v-if="reset.differedBy" class="sg-readout resets__pair">
            {{ reset.differedBy[0] }} → {{ reset.differedBy[1] }}
          </span>
        </li>
      </ul>
    </section>

    <!-- Whether it changed what the unit sounded like -->
    <section class="card__section">
      <h3 class="sg-label"><Term name="audible">{{ t('address.heard') }}</Term></h3>
      <p v-if="!record.b?.length && !record.nb" class="card__absent">
        {{ t('address.notMeasuredBody') }}
      </p>
      <p v-else-if="record.nb" class="card__absent">
        <strong>{{ t('address.cannotBeAsked') }}</strong> {{ record.nb }}
      </p>
      <div v-for="entry in record.b ?? []" :key="entry.f" class="verdict" :class="{ 'verdict--superseded': entry.sup }">
        <StateChip
          :state="entry.v === 'Y' ? 'heard' : entry.v === 'N' ? 'silent' : 'unasked'"
          :wording="audibleWording(entry.v)"
          expanded
        />
        <p v-if="entry.val" class="verdict__values">
          {{ t('address.askedAs', { values: entry.val.join(' / ') }) }}
        </p>
        <p v-if="entry.hb.length" class="verdict__line">
          <span class="sg-label">{{ t('address.heardBy') }}</span>
          <span>{{ list(entry.hb.map(stimulus)) }}</span>
        </p>
        <p v-if="entry.nb.length" class="verdict__line">
          <span class="sg-label">{{ t('address.notHeardBy') }}</span>
          <span>{{ list(entry.nb.map(stimulus)) }}</span>
        </p>
        <p v-if="entry.iu.length" class="verdict__line">
          <span class="sg-label">{{ t('address.inconclusiveUnder') }}</span>
          <span>{{ list(entry.iu.map(stimulus)) }}</span>
        </p>
        <p v-if="entry.how" class="verdict__how">{{ entry.how }}</p>
        <p v-if="entry.sup" class="verdict__superseded">
          {{ t('address.supersededBy', { record: entry.sup }) }}
        </p>
        <RecordLink :unit-id="unitId" :path="entry.f" />
      </div>
    </section>

    <!--
      What a document states about this address, below everything measured and
      visibly apart from it. No colour: the four the site uses are the states a
      measurement can be in, and a document's claim is not one of them. What is
      coloured is what was measured; what is not is what was merely written down.
    -->
    <section v-if="claims?.length" class="card__section stated">
      <h3 class="sg-label">{{ t('claims.stated') }}</h3>
      <div v-for="claim in claims" :key="`${claim.d}-${claim.t}`" class="stated__entry">
        <p class="stated__head">
          <span class="stated__parameter">{{ claim.parameter ?? '—' }}</span>
          <span v-if="claim.t !== claim.a" class="sg-readout stated__template">{{ claim.t }}</span>
        </p>
        <dl class="stated__rows">
          <!--
            Both sides named, never two values left to be told apart by their
            order. A verdict of `differs` that does not show what it differs
            from asks a reader to hold two halves of the card in their head,
            and one that shows both without saying which is which asks worse.
            The measured side appears only where the two were actually held
            against each other: under every other verdict there is nothing to
            show it against, and a measurement set beside a claim nobody
            compared it with would read as a comparison.
          -->
          <div v-if="claim.data" class="stated__row">
            <dt class="sg-label">{{ t('claims.range') }}</dt>
            <dd>
              <span class="stated__side">
                <span class="stated__sideLabel">{{ t('claims.inDocument') }}</span>
                <span class="sg-readout">{{ claim.data }}</span>
              </span>
              <span v-if="compared(claim.range) && claim.measuredRange" class="stated__side">
                <span class="stated__sideLabel">{{ t('claims.asMeasured') }}</span>
                <span class="sg-readout">{{ claim.measuredRange }}</span>
              </span>
              <span class="stated__verdict" :class="`stated__verdict--${verdictKind(claim.range)}`">
                {{ t(`claims.verdict.${claim.range}`) }}
              </span>
            </dd>
          </div>
          <div v-if="claim.default" class="stated__row">
            <dt class="sg-label">{{ t('claims.initial') }}</dt>
            <dd>
              <span class="stated__side">
                <span class="stated__sideLabel">{{ t('claims.inDocument') }}</span>
                <span class="sg-readout">{{ claim.default }}</span>
                <span v-if="claim.defaultDescription" class="stated__gloss">
                  ({{ claim.defaultDescription }})
                </span>
              </span>
              <span v-if="compared(claim.initial) && claim.poweredOn" class="stated__side">
                <span class="stated__sideLabel">{{ t('claims.asMeasured') }}</span>
                <span class="sg-readout">{{ claim.poweredOn }}</span>
              </span>
              <span class="stated__verdict" :class="`stated__verdict--${verdictKind(claim.initial)}`">
                {{ t(`claims.verdict.${claim.initial}`) }}
              </span>
            </dd>
          </div>
          <div v-if="claim.description" class="stated__row">
            <dt class="sg-label">{{ t('claims.describedAs') }}</dt>
            <dd>{{ claim.description }}</dd>
          </div>
          <div v-if="(claim.bytes ?? 1) > 1" class="stated__row">
            <dt class="sg-label">{{ t('claims.width') }}</dt>
            <dd>{{ t('claims.widthBody', { bytes: claim.bytes }) }}</dd>
          </div>
          <!--
            Why a hand-read row carries the columns it does. Usually because the
            page states them once, on the line above: without this the row reads
            as a document saying nothing about an address it does name.
          -->
          <div v-if="claim.why" class="stated__row">
            <dt class="sg-label">{{ t('claims.howItIsPrinted') }}</dt>
            <dd :class="{ 'sg-quoted': statedIsQuoted(claim.why) }">{{ stated(claim.why) }}</dd>
          </div>
        </dl>

        <!-- A note the page printed about this row, restated rather than copied. -->
        <div v-if="claim.q" class="stated__note">
          <p :class="{ 'sg-quoted': statedIsQuoted(claim.q.restated) }">
            {{ stated(claim.q.restated) }}
          </p>
          <!--
            Only where the note names a reset. A note about something else has
            nothing to say about any of them, and three rows of "not stated" is
            not an absence worth showing -- it is the absence of a question.
          -->
          <ul v-if="namesAReset(claim)" class="stated__resets">
            <li v-for="reset in claim.q.resets" :key="reset.name">
              <span class="resets__name">{{ reset.name }}</span>
              <span class="sg-readout">{{ reset.stated ?? '—' }}</span>
              <span class="stated__arrow">/</span>
              <span class="sg-readout">{{ reset.measured ?? '—' }}</span>
              <span class="stated__verdict" :class="`stated__verdict--${verdictKind(reset.verdict)}`">
                {{ t(`claims.verdict.${reset.verdict}`) }}
              </span>
            </li>
          </ul>
        </div>

        <p v-if="claim.unresolved?.length" class="stated__unresolved">
          {{ t('claims.unresolved', { cells: claim.unresolved.join(' · ') }) }}
        </p>

        <DocumentLink
          v-if="documentOf(claim.d)"
          :document="documentOf(claim.d)!"
          :page="claim.page"
        />
      </div>
    </section>

    <!--
      What is claimed to be behind what was measured here, and how far
      identifying it got. Last on the card and apart from both halves above it:
      a measurement says what the unit answered and a document says what was
      printed, and this says what is driving the byte -- which can be wrong in
      ways neither of the others can. An address no claim reaches carries no
      section at all, because there is no claim here to be absent.
    -->
    <section v-if="algorithms?.length" class="card__section behind">
      <h3 class="sg-label">{{ t('algorithms.seeAlgorithm') }}</h3>
      <ul class="behind__list">
        <li v-for="line in algorithms" :key="line.id" class="behind__entry">
          <a class="behind__link" :href="route(`/units/${unitId}/algorithms/${line.slug}`)">
            <ClaimTitle :title="line.title" :named="line.named" :claim="line.claim" />
          </a>
          <!--
            Where the archive stands on it, said on the way rather than on
            arrival: a reader must not be sent from a measurement to a claim
            the archive has withdrawn without being told so first. Ink for five
            of the six standings; the accent for the one that means a model was
            compared and it closed, which is the single thing it ever says.
          -->
          <span
            class="behind__standing"
            :class="{ 'behind__standing--closed': line.standing === 'closed' }"
            :title="t(`algorithms.standingBody.${line.standing}`)"
          >
            {{ t(`algorithms.standing.${line.standing}`) }}
          </span>
        </li>
      </ul>
    </section>
  </article>
</template>

<style scoped>
.card {
  padding: var(--space-5) var(--space-6) var(--space-6);
}

.card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--sg-rule);
}

.card__address {
  margin: 0.25rem 0 0.35rem;
  font-size: clamp(1.6rem, 4vw, 2.1rem);
  font-weight: 500;
  letter-spacing: 0.04em;
  line-height: 1;
}

.card__where {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--color-text-tertiary);
}

.card__where a {
  color: var(--vp-c-brand-1);
  text-decoration: none;
}

.card__where a:hover {
  text-decoration: underline;
}

.card__sep {
  margin: 0 0.5em;
  opacity: 0.5;
}

/* A full border plus a tint, never a one-sided stripe on a rounded box. */
.card__window {
  margin: var(--space-4) 0 0;
  padding: var(--space-3) var(--space-4);
  border: 1px solid color-mix(in srgb, var(--sg-refused) 28%, transparent);
  background: color-mix(in srgb, var(--sg-refused) 8%, transparent);
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
  line-height: 1.65;
  color: var(--color-text-secondary);
}

.card__window strong {
  display: block;
  margin-bottom: 0.2rem;
  color: var(--sg-refused);
}

.card__readouts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-5);
  margin: var(--space-5) 0 0;
  padding-bottom: var(--space-5);
  border-bottom: 1px solid var(--sg-rule-soft);
}

.readout dt {
  margin-bottom: 0.4rem;
}

.readout__value {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 1.05rem;
}

.readout__range {
  font-size: 1.1rem;
  letter-spacing: 0.05em;
}

.readout__note,
.readout__absent {
  font-family: var(--font-reading);
  font-size: 0.78rem;
  line-height: 1.5;
  color: var(--color-text-tertiary);
}

.card__section {
  margin-top: var(--space-5);
}

.card__section h3 {
  margin: 0 0 var(--space-3);
}

.card__absent {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.7;
  color: var(--color-text-tertiary);
}

.alias,
.resets {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.alias li,
.resets li {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  flex-wrap: wrap;
  font-size: 0.875rem;
}

.alias__stimulus {
  font-size: 0.9rem;
}

.alias__channel,
.resets__pair {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--color-text-tertiary);
}

.resets__name {
  min-width: 10rem;
  font-family: var(--font-mono);
  font-size: 0.8rem;
}

.resets__outcome {
  color: var(--color-text-secondary);
}

.verdict + .verdict {
  margin-top: var(--space-4);
  padding-top: var(--space-4);
  border-top: 1px solid var(--sg-rule-soft);
}

.verdict--superseded {
  opacity: 0.55;
}

.verdict__values,
.verdict__line,
.verdict__how,
.verdict__superseded {
  margin: 0.35rem 0 0;
  font-size: 0.82rem;
  line-height: 1.6;
  color: var(--color-text-secondary);
}

.verdict__line {
  display: flex;
  gap: 0.6rem;
  align-items: baseline;
  flex-wrap: wrap;
}

.verdict__line .sg-label {
  min-width: 8rem;
}

.verdict__how,
.verdict__superseded {
  color: var(--color-text-tertiary);
}

.verdict :deep(.sg-record) {
  display: inline-block;
  margin-top: 0.5rem;
}

/*
  What a document states, set apart from what was measured without borrowing any
  of the four colours the measurements use. The separation is done with a rule
  and with restraint: nothing in here is tinted, so a reader can tell at a glance
  which half of the card the unit itself answered for.
*/
.stated {
  border-top: 1px solid var(--sg-rule);
  padding-top: var(--space-4);
}

.stated__entry + .stated__entry {
  margin-top: var(--space-4);
  padding-top: var(--space-4);
  border-top: 1px dotted var(--sg-rule);
}

.stated__head {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  margin: 0 0 0.4rem;
}

.stated__parameter {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  color: var(--color-text-secondary);
}

.stated__template {
  font-size: 0.72rem;
  color: var(--color-text-tertiary);
}

.stated__rows {
  margin: 0;
}

.stated__row {
  display: flex;
  gap: 0.6rem;
  align-items: baseline;
  padding: 0.15rem 0;
}

.stated__row dt {
  min-width: 7.5rem;
}

.stated__row dd {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: baseline;
}

/* One side of the comparison, its name set against it. The label is quiet and
   the value is not: which side this is has to be readable, but the two values
   are what the row is for. */
.stated__side {
  display: inline-flex;
  align-items: baseline;
  gap: 0.4rem;
}

.stated__sideLabel {
  font-family: var(--font-reading);
  font-size: 0.7rem;
  color: var(--color-text-muted);
}

.stated__gloss,
.stated__arrow {
  color: var(--color-text-tertiary);
  font-size: 0.8rem;
}

.stated__verdict {
  font-size: 0.72rem;
  letter-spacing: 0.02em;
  color: var(--color-text-tertiary);
}

.stated__verdict--differs {
  color: var(--color-text-primary);
  font-weight: 600;
  border-bottom: 1px solid currentColor;
}

.stated__verdict--agrees {
  color: var(--color-text-secondary);
}

.stated__note {
  margin-top: 0.6rem;
  padding-left: 0.75rem;
  border-left: 1px solid var(--sg-rule);
  font-size: 0.85rem;
  color: var(--color-text-secondary);
}

.stated__note p {
  margin: 0 0 0.4rem;
}

.stated__resets {
  list-style: none;
  margin: 0;
  padding: 0;
}

.stated__resets li {
  display: flex;
  gap: 0.5rem;
  align-items: baseline;
  padding: 0.1rem 0;
}

.stated__unresolved {
  margin: 0.5rem 0 0;
  font-size: 0.78rem;
  color: var(--color-text-tertiary);
}

.stated :deep(.sg-cite) {
  display: inline-block;
  margin-top: 0.5rem;
}

/* The way out of this address and into what is claimed to drive it. Ruled off
   from the two halves above rather than tinted: nothing here was measured, and
   nothing here was printed either. */
.behind {
  border-top: 1px solid var(--sg-rule);
  padding-top: var(--space-4);
}

.behind__list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.behind__entry {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem 0.75rem;
  align-items: baseline;
  padding: 0.3rem 0;
}

.behind__entry + .behind__entry {
  border-top: 1px dotted var(--sg-rule);
}

.behind__link {
  color: var(--vp-c-brand-1);
  text-decoration: none;
}

.behind__link:hover {
  text-decoration: underline;
}

/* Five of the six standings are what the archive says and nothing more, so they
   are set in ink: the site's four hues say what a measurement was, which is a
   different question from how far a reading of several of them got. */
.behind__standing {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.04em;
  color: var(--color-text-tertiary);
}

/* The one exception, and the same mark the claim page puts on the same fact. */
.behind__standing--closed {
  color: var(--sg-accent-600);
  font-weight: 500;
}

@media (max-width: 640px) {
  .card {
    padding: var(--space-4);
  }
  .stated__row {
    flex-direction: column;
    gap: 0.1rem;
  }
  .stated__row dt {
    min-width: 0;
  }
  .card__head {
    flex-direction: column;
  }
  .resets__name {
    min-width: 0;
  }
  .verdict__line .sg-label {
    min-width: 0;
  }
}
</style>
