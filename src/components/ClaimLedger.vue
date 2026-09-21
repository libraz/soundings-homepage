<script setup lang="ts">
import { computed } from 'vue';
import type { AlgorithmGate, AlgorithmShard } from '../composables/useArchive';
import { useI18n } from '../composables/useI18n';

/**
 * What was checked, and what was not, in two columns.
 *
 * No sentence here is new: the values are the ones the shard already carries,
 * sorted into the two columns and counted. The prose behind each of them stays
 * where it was written, further down the page, and every row that has something
 * to show links to it rather than restating it.
 *
 * Every row is three-valued — a figure, none, or not stated — and the third is
 * the reason the panel exists. A gate carrying no verdict has not been failed
 * and has not been passed; drawn as a zero it would read as four gates none of
 * which the model got through. An empty gate list is read the same way: the
 * four gates are what a comparison is scored on, so a comparison recording none
 * of them recorded no gate verdicts rather than four negative ones. A list the
 * archive does keep — the records it left out — is read the other way, because
 * an empty exclusion list is a statement that nothing was excluded.
 *
 * A gate has a fourth thing it can be, and it is not an absence: the comparison
 * ran, the gate returned a verdict, and the archive declined to read a pass or a
 * failure into what came back. Those sit in their own row with the words the
 * archive returned beside them, because the words are the whole of what the row
 * has to say and one of them distinguishes two halves of a filter.
 *
 * The four measurement hues say what a reading was and the accent says a model
 * closed. This panel says neither, so it is drawn in ink throughout.
 */
const props = defineProps<{ unitId: string; shard: AlgorithmShard }>();

const { t } = useI18n();

/**
 * Where a row's prose lives on the page around this panel.
 *
 * The ledger carries presence and counts; the sections below carry the words.
 */
const ANCHORS: Record<string, string> = {
  comparedAgainst: '#reproduces',
  domain: '#reproduces',
  residual: '#reproduces',
  gatesPassed: '#reproduces',
  outsideDomain: '#reproduces',
  gatesFailed: '#reproduces',
  gatesUnread: '#reproduces',
  gatesNotStated: '#reproduces',
  alternatives: '#alternatives',
  refutedBy: '#refuted-by',
  excluded: '#reproduces',
};

/** A gate verdict that settled the question it was put to ask. */
const CLOSING = ['reproduces', 'separated'];

interface Cell {
  key: string;
  state: 'value' | 'none' | 'notStated';
  /** Only read where the state is `value`. */
  text: string;
  /** A second figure the same row carries, where the record names one. */
  aside: string | null;
  /** The archive's own words, where they are what the row has to say. */
  words: string[];
  /** What the row means, where it needs saying. */
  note: string | null;
}

function cell(
  key: string,
  state: Cell['state'],
  text = '',
  aside: string | null = null,
  note: string | null = null,
  words: string[] = [],
): Cell {
  return { key, state, text, aside, words, note };
}

/**
 * A count, against whether the record stated the thing being counted at all.
 * Unstated is not zero, and zero is not unstated.
 */
function counted(
  key: string,
  stated: boolean,
  total: number,
  note: string | null = null,
  words: string[] = [],
): Cell {
  if (!stated) return cell(key, 'notStated', '', null, note);
  if (total === 0) return cell(key, 'none', '', null, note);
  return cell(key, 'value', String(total), null, note, words);
}

/** A block of prose, which the ledger reports the presence of and never quotes. */
function present(key: string, prose: string | null | undefined): Cell {
  if (typeof prose !== 'string' || prose.trim() === '') return cell(key, 'notStated');
  return cell(key, 'value', t('algorithms.open'));
}

const reproduces = computed(() => props.shard.reproduces);
const gates = computed<AlgorithmGate[]>(() => reproduces.value?.gates ?? []);

/**
 * Which of the four a gate landed in.
 *
 * Several of the claims that closed carry gates with no `passed` flag and the
 * verdict in their figures instead, so reading the flag alone reports them as
 * gates nobody got through. A verdict that settled the question the gate was
 * put to ask is a pass. A verdict that came back saying something else is
 * neither: the archive wrote that it is not reading the model as breaking down
 * and left the verdict as it arrived, so reading a failure into it here would
 * be this site deciding what the record declined to decide.
 */
function gateState(gate: AlgorithmGate): 'passed' | 'failed' | 'unread' | 'notStated' {
  if (gate.passed === true) return 'passed';
  if (gate.passed === false) return 'failed';
  const verdict = gate.figures.verdict;
  if (typeof verdict !== 'string' || verdict.trim() === '') return 'notStated';
  return CLOSING.includes(verdict) ? 'passed' : 'unread';
}

const tally = computed(() => {
  const counts = { passed: 0, failed: 0, unread: 0, notStated: 0 };
  for (const gate of gates.value) counts[gateState(gate)] += 1;
  return counts;
});

/**
 * What the unread gates came back with, in the archive's own words.
 *
 * The count alone says a gate was left unread and not what it returned, and one
 * of these carries the two halves of a filter apart from each other. It is the
 * record speaking, so it is shown as written rather than translated.
 */
const unread = computed(() =>
  gates.value
    .filter((gate) => gateState(gate) === 'unread')
    .map((gate) => String(gate.figures.verdict)),
);

/** The domain, where the record enumerates the settings it put the question at. */
const settings = computed(() => {
  const domain = reproduces.value?.domain;
  const held = domain && typeof domain === 'object' ? domain.settings : null;
  return held && typeof held === 'object' ? Object.keys(held as object) : null;
});

const stimulus = computed(() => {
  const domain = reproduces.value?.domain;
  const held = domain && typeof domain === 'object' ? domain.stimulus : null;
  return Array.isArray(held) ? held.length : 0;
});

/** What a domain the record states some other way than as a list of settings. */
function domainCell(): Cell {
  const domain = reproduces.value?.domain;
  const aside = stimulus.value > 0 ? `stimulus ${stimulus.value}` : null;
  if (domain === null || domain === undefined) return cell('domain', 'notStated');
  const named = settings.value;
  if (named === null) return cell('domain', 'value', t('common.yes'), aside);
  if (named.length === 0) return cell('domain', 'none', '', aside);
  return cell('domain', 'value', String(named.length), aside);
}

/**
 * The residual, where it carries the figures the schema asks for. Several
 * classes record it in their own shape, and those say so rather than being
 * reported as an absence.
 */
function residualCell(): Cell {
  const held = reproduces.value?.residual;
  if (!held) return cell('residual', 'notStated');
  if (typeof held.median !== 'number') return cell('residual', 'value', t('common.yes'));
  const unit = typeof held.unit === 'string' ? held.unit : '';
  return cell('residual', 'value', `${held.median} / ${held.worst} ${unit}`.trim());
}

const outside = computed(() => {
  const domain = reproduces.value?.domain;
  const held = domain && typeof domain === 'object' ? domain.outside : null;
  return typeof held === 'string' ? held : null;
});

const checked = computed<Cell[]>(() => [
  counted(
    'comparedAgainst',
    Boolean(reproduces.value),
    reproduces.value?.comparedAgainst.records.length ?? 0,
  ),
  domainCell(),
  residualCell(),
  counted('gatesPassed', gates.value.length > 0, tally.value.passed),
]);

const notChecked = computed<Cell[]>(() => [
  present('outsideDomain', outside.value),
  counted('gatesFailed', gates.value.length > 0, tally.value.failed),
  counted(
    'gatesUnread',
    gates.value.length > 0,
    tally.value.unread,
    t('algorithms.ledger.gatesUnreadBody'),
    unread.value,
  ),
  counted(
    'gatesNotStated',
    gates.value.length > 0,
    tally.value.notStated,
    t('algorithms.ledger.gatesNotStatedBody'),
  ),
  counted(
    'alternatives',
    props.shard.alternatives.length > 0,
    props.shard.alternatives.filter((reading) => reading.standing).length,
  ),
  present('refutedBy', props.shard.refutedBy),
  counted(
    'excluded',
    Boolean(reproduces.value),
    reproduces.value?.comparedAgainst.excluded.length ?? 0,
  ),
]);

/** What a cell reads as: its figure, or the word for the absence it stands for. */
function wording(entry: Cell): string {
  if (entry.state === 'value') return entry.text;
  return entry.state === 'none' ? t('common.none') : t('algorithms.notStated');
}

/** The two columns, drawn by one set of rules so a row cannot read differently in each. */
const columns = computed(() => [
  { head: t('algorithms.ledger.checked'), rows: checked.value },
  { head: t('algorithms.ledger.notChecked'), rows: notChecked.value },
]);
</script>

<template>
  <section class="ledger sg-panel">
    <h2 class="sg-label ledger__head">{{ t('algorithms.ledger.title') }}</h2>
    <div class="columns">
      <div v-for="column in columns" :key="column.head" class="column">
        <h3 class="sg-label column__head">{{ column.head }}</h3>
        <dl class="rows">
          <div
            v-for="entry in column.rows"
            :key="entry.key"
            class="row"
            :data-row="entry.key"
            :data-state="entry.state"
          >
            <dt class="sg-label" :title="entry.note ?? undefined">
              {{ t(`algorithms.ledger.${entry.key}`) }}
            </dt>
            <dd class="row__value">
              <a
                v-if="entry.state === 'value'"
                class="sg-readout value"
                :href="ANCHORS[entry.key]"
              >{{ wording(entry) }}</a>
              <span v-else class="value value--absent">{{ wording(entry) }}</span>
              <span v-if="entry.aside" class="sg-readout value__aside">{{ entry.aside }}</span>
              <span v-for="said in entry.words" :key="said" class="sg-readout value__said">
                {{ said }}
              </span>
            </dd>
          </div>
        </dl>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ledger {
  padding: 1.25rem 1.35rem;
  display: grid;
  gap: 1rem;
}

.ledger__head {
  margin: 0;
}

/* Two columns where there is room for two, one below the other where there is
   not. The column a row sits in is half of what it says, so the heading stays
   with its rows rather than floating above both. */
.columns {
  display: grid;
  gap: 1.1rem;
}

@media (min-width: 720px) {
  .columns {
    grid-template-columns: 1fr 1fr;
    gap: 1.6rem;
  }
}

.column {
  display: grid;
  gap: 0.7rem;
  align-content: start;
}

.column__head {
  margin: 0;
  padding-bottom: 0.45rem;
  border-bottom: 1px solid var(--sg-rule-soft);
}

.rows {
  margin: 0;
  display: grid;
  gap: 0.6rem;
}

.row {
  display: grid;
  gap: 0.2rem;
}

.row__value {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.6em;
}

.value {
  font-size: 0.8125rem;
}

a.value {
  color: var(--sg-readout);
  text-decoration: underline dotted var(--sg-rule);
  text-underline-offset: 0.28em;
}

a.value:hover {
  color: var(--vp-c-brand-1);
  text-decoration-color: currentColor;
}

/* An absence is a word, set back from the figures around it. It is never a
   blank cell and never a zero: both of those read as a measured nothing. */
.value--absent {
  font-family: var(--font-reading);
  color: var(--color-text-tertiary);
}

.value__aside {
  font-size: 0.72rem;
  color: var(--color-text-tertiary);
}

/* The archive's own words for what a gate returned. Set in the readout face,
   because they are the record speaking rather than the interface. */
.value__said {
  font-size: 0.72rem;
  line-height: 1.5;
}
</style>
