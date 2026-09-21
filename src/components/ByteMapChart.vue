<script setup lang="ts">
import { computed } from 'vue';
import type { AlgorithmChart } from '../composables/useArchive';
import { useI18n } from '../composables/useI18n';
import RecordLink from './RecordLink.vue';

/**
 * The law a model puts on one byte, drawn.
 *
 * This is the answer to "where did that figure come from". A model says what a
 * parameter byte stands for; the chart says it over the whole range of the byte,
 * beside the record that was read to get there.
 *
 * **The reading and the line between two readings are drawn differently.** A
 * filled dot is a setting a run actually asked at. The line is what the model
 * answers in between, which is this project's interpolation and not a
 * measurement — the same distinction the address grid makes with a fill and a
 * ring, kept here because a chart that drew both as one curve would show
 * readings nobody took.
 *
 * No second hue. The site's four colours stand for the four things a
 * measurement can be, and neither a curve nor a reading is one of them, so both
 * are the readout's own ink at two strengths. The verdict is told apart the
 * same way — solid against dashed, and a sentence above the figure — and never
 * with the accent, which says a model closed and would read inside a figure as
 * a fifth thing the unit answered.
 */
const props = defineProps<{ chart: AlgorithmChart; unitId: string }>();

const { t, verbatim } = useI18n();

/** The two verdicts that close a comparison. */
const CLOSED = ['reproduces', 'equivalent_under_this_test'];

/**
 * Whether the model behind this curve closed.
 *
 * Read off the curve's own verdict and never off the claim's standing: a claim
 * the archive stopped working on can hold a model that reproduced the readings,
 * and the figure states what the model did while the page around it states how
 * far the reading of the claim got.
 */
const closed = computed(() => CLOSED.includes(props.chart.verdict ?? ''));

/** The verdict, worded, where there is one to state. A null verdict is a state of its own. */
const verdict = computed(() =>
  closed.value ? null : t(`algorithms.verdict.${props.chart.verdict ?? 'null'}`),
);

/**
 * A curve from a model that did not close is worth seeing beside the readings
 * it failed to follow, and worth seeing only there. Where the map names none,
 * what would be left is a rejected law drawn on its own with nothing to check
 * it against, so the sentence saying that takes the figure's place.
 */
const drawn = computed(() => closed.value || props.chart.marks.length > 0);

/** The plot box inside the SVG's own coordinate space. */
const BOX = { left: 46, right: 8, top: 10, bottom: 22, width: 320, height: 132 };
const PLOT = {
  x: BOX.left,
  y: BOX.top,
  width: BOX.width - BOX.left - BOX.right,
  height: BOX.height - BOX.top - BOX.bottom,
};

/**
 * Log where the quantity is a frequency, linear otherwise.
 *
 * A corner that runs from 240 Hz to 13 kHz is three-quarters of the plot in its
 * first octave if it is drawn linearly, which hides the only thing the curve is
 * there to show. A quantity that reaches zero cannot be drawn that way and is
 * not: the flag is what the map itself carried, and a zero in the data turns it
 * off rather than being nudged off the axis.
 */
const logarithmic = computed(
  () => props.chart.log && props.chart.series.every(([, value]) => value > 0),
);

const bounds = computed(() => {
  const values = props.chart.series.map(([, value]) => value);
  let low = Math.min(...values);
  let high = Math.max(...values);
  if (!(high > low)) {
    // A byte whose every setting answers the same thing is a finding, and the
    // chart says so by drawing the flat line across the middle rather than
    // dividing by a zero span.
    const pad = Math.abs(high) || 1;
    low = high - pad;
    high += pad;
  }
  return { low, high };
});

function toY(value: number): number {
  const { low, high } = bounds.value;
  const at = logarithmic.value
    ? (Math.log(value) - Math.log(low)) / (Math.log(high) - Math.log(low))
    : (value - low) / (high - low);
  return PLOT.y + PLOT.height - at * PLOT.height;
}

function toX(byte: number): number {
  return PLOT.x + (byte / 127) * PLOT.width;
}

/**
 * The curve, drawn the way the law it came from behaves.
 *
 * A table or a set of states holds one value across a run of settings and then
 * changes at one of them, so it is drawn as steps: the corner is where the
 * change is, and the sides are vertical because nothing passed through the
 * values between. A map that really does interpolate is drawn as a line.
 */
const line = computed(() => {
  const points: string[] = [];
  let previous: number | null = null;
  for (const [byte, value] of props.chart.series) {
    const x = toX(byte);
    const y = toY(value);
    if (props.chart.step && previous !== null)
      points.push(`${x.toFixed(2)},${previous.toFixed(2)}`);
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
    previous = y;
  }
  return points.join(' ');
});

const dots = computed(() =>
  props.chart.marks
    .filter(([, value]) => Number.isFinite(value))
    .map(([byte, value]) => ({ byte, value, x: toX(byte), y: toY(value) })),
);

/** Two ticks and no more: the readout beside the chart is where figures are read. */
const ticks = computed(() => {
  const { low, high } = bounds.value;
  return [
    { at: toY(high), text: format(high) },
    { at: toY(low), text: format(low) },
  ];
});

function format(value: number): string {
  if (props.chart.quantity === 'hz') {
    return value >= 1000
      ? `${(value / 1000).toFixed(value >= 10000 ? 1 : 2)}k`
      : value.toFixed(value < 10 ? 2 : 0);
  }
  if (props.chart.quantity === 'db') return value.toFixed(1);
  if (props.chart.quantity === 'count') return String(Math.round(value));
  return Math.abs(value) >= 100 ? value.toFixed(1) : value.toFixed(3);
}

const heading = computed(() =>
  props.chart.byte
    ? t('algorithms.chartOf', { byte: props.chart.byte })
    : t('algorithms.chartNoByte'),
);

/**
 * The record this curve was read from, as a path inside the unit's directory.
 *
 * Cut here rather than on the wire because that is the form every citation on
 * this site takes. A map read from somewhere other than this unit's own records
 * carries no link: the archive keeps those apart, and a link that quietly
 * pointed at another unit's directory would be worse than none.
 */
const within = computed(() => {
  const prefix = `data/units/${props.unitId}/`;
  return props.chart.from?.startsWith(prefix) ? props.chart.from.slice(prefix.length) : null;
});
</script>

<template>
  <figure class="chart sg-sunk">
    <figcaption class="chart__head">
      <span class="sg-label">{{ chart.section }} · {{ chart.of }}</span>
      <span class="chart__byte sg-readout">{{ heading }}</span>
    </figcaption>

    <p v-if="verdict" class="chart__verdict">{{ verdict }}</p>

    <svg
      v-if="drawn"
      class="chart__plot"
      :viewBox="`0 0 ${BOX.width} ${BOX.height}`"
      role="img"
      :aria-label="`${chart.section} ${chart.of}`"
      preserveAspectRatio="none"
    >
      <!-- Hairlines, not a grid. Two of them, at the ends of what the byte
           reaches, because the figures a reader wants are in the record beside
           the chart and a ruled background would only crowd the curve. -->
      <g class="chart__frame">
        <line :x1="PLOT.x" :x2="PLOT.x + PLOT.width" :y1="PLOT.y + PLOT.height" :y2="PLOT.y + PLOT.height" />
        <line :x1="PLOT.x" :x2="PLOT.x" :y1="PLOT.y" :y2="PLOT.y + PLOT.height" />
      </g>

      <g class="chart__ticks">
        <text v-for="tick in ticks" :key="tick.text" :x="PLOT.x - 6" :y="tick.at + 3" text-anchor="end">
          {{ tick.text }}
        </text>
        <text :x="PLOT.x" :y="BOX.height - 6">0</text>
        <text :x="PLOT.x + PLOT.width" :y="BOX.height - 6" text-anchor="end">127</text>
      </g>

      <polyline class="chart__line" :class="{ 'chart__line--open': !closed }" :points="line" />

      <circle
        v-for="dot in dots"
        :key="dot.byte"
        class="chart__mark"
        :cx="dot.x"
        :cy="dot.y"
        r="2.4"
      >
        <title>{{ dot.byte }} → {{ format(dot.value) }}</title>
      </circle>
    </svg>

    <dl v-if="drawn" class="chart__key">
      <div class="chart__keyItem">
        <dt>
          <span
            class="chart__swatch chart__swatch--line"
            :class="{ 'chart__swatch--open': !closed }"
            aria-hidden="true"
          />
        </dt>
        <dd>{{ t('algorithms.modelCurve') }}</dd>
      </div>
      <div v-if="dots.length" class="chart__keyItem">
        <dt><span class="chart__swatch chart__swatch--mark" aria-hidden="true" /></dt>
        <dd>{{ t('algorithms.readings') }}</dd>
      </div>
    </dl>

    <p v-else class="chart__undrawn sg-sunk">{{ t('algorithms.chartNotDrawn') }}</p>

    <p v-if="chart.why" class="chart__why">{{ verbatim(chart.why) }}</p>

    <p v-if="within" class="chart__from">
      <span class="sg-label">{{ t('algorithms.fromRecord') }}</span>
      <RecordLink :unit-id="unitId" :path="within" compact />
    </p>
  </figure>
</template>

<style scoped>
.chart {
  margin: 0;
  padding: var(--space-3) var(--space-4) var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.chart__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
}

.chart__byte {
  font-size: 0.72rem;
  color: var(--color-text-tertiary);
}

.chart__plot {
  inline-size: 100%;
  block-size: 132px;
  overflow: visible;
}

.chart__frame line {
  stroke: var(--sg-rule);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}

.chart__ticks text {
  font-family: var(--font-mono);
  font-size: 7px;
  fill: var(--color-text-muted);
}

/* The interpolation: the readout's ink, thinned. It is what the model answers
   between two readings and is drawn as the lighter of the two marks because it
   is the weaker claim. */
.chart__line {
  fill: none;
  stroke: color-mix(in srgb, var(--sg-readout) 45%, transparent);
  stroke-width: 1.25;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}

/* A model that did not close, in the same ink and broken. Nothing about the
   line's colour changes: the distinction is the stroke and the sentence above
   it, because a second hue here would read as a fifth answer. */
.chart__line--open {
  stroke-dasharray: 4 3;
}

/* A setting a run actually asked at. Filled, for the same reason a cell in the
   address grid is filled when something is behind it. */
.chart__mark {
  fill: var(--sg-readout);
}

.chart__key {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
  margin: 0;
}

.chart__keyItem {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.chart__keyItem dt,
.chart__keyItem dd {
  margin: 0;
}

.chart__keyItem dd {
  font-family: var(--font-mono);
  font-size: 0.66rem;
  letter-spacing: 0.04em;
  color: var(--color-text-tertiary);
}

.chart__swatch {
  display: block;
  inline-size: 0.75rem;
}

.chart__swatch--line {
  block-size: 0;
  border-top: 1.25px solid color-mix(in srgb, var(--sg-readout) 45%, transparent);
}

.chart__swatch--open {
  border-top-style: dashed;
}

.chart__swatch--mark {
  inline-size: 0.4rem;
  block-size: 0.4rem;
  border-radius: var(--radius-full);
  background: var(--sg-readout);
}

/* The sentence the dashed curve is read under, and the one standing where a
   curve is not drawn at all. The second sits in the figure's own place so the
   figure is never a blank. */
.chart__verdict,
.chart__undrawn {
  margin: 0;
  font-size: 0.78rem;
  line-height: 1.6;
  color: var(--color-text-secondary);
}

.chart__undrawn {
  padding: var(--space-3) var(--space-4);
}

.chart__why,
.chart__from {
  margin: 0;
  font-size: 0.78rem;
  line-height: 1.6;
  color: var(--color-text-secondary);
}

.chart__from {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.5rem;
}
</style>
