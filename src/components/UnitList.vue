<script setup lang="ts">
import { units } from '../composables/useArchive';
import { useI18n } from '../composables/useI18n';

/**
 * Every unit the archive holds.
 *
 * One row per unit rather than a card each: these are individual pieces of
 * equipment, and what distinguishes them is the identification and the coverage,
 * both of which read better in a column than in a tile.
 */
const { t, route } = useI18n();
const all = units();
</script>

<template>
  <div class="list">
    <table>
      <thead>
        <tr>
          <th>{{ t('common.unit') }}</th>
          <th>{{ t('unit.identity') }}</th>
          <th class="numeric">{{ t('address.region') }}</th>
          <th class="numeric">{{ t('search.address') }}</th>
          <th class="numeric">{{ t('address.heard') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="unit in all" :key="unit.id">
          <td>
            <a :href="route(`/units/${unit.id}`)">{{ unit.manufacturer }} {{ unit.model }}</a>
            <span class="list__id sg-readout">{{ unit.id }}</span>
          </td>
          <td class="sg-readout list__identity">{{ unit.identityReply ?? t('common.unknown') }}</td>
          <td class="numeric sg-readout">{{ unit.counts.regions.toLocaleString() }}</td>
          <td class="numeric sg-readout">{{ unit.counts.addresses.toLocaleString() }}</td>
          <td class="numeric sg-readout">{{ unit.counts.audible.toLocaleString() }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.list {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
}

th {
  font-family: var(--font-mono);
  font-size: 0.625rem;
  font-weight: 500;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  text-align: left;
  color: var(--color-text-tertiary);
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--sg-rule);
  white-space: nowrap;
}

td {
  padding: 0.75rem;
  font-size: 0.9rem;
  border-bottom: 1px solid var(--sg-rule-soft);
  vertical-align: baseline;
}

.numeric {
  text-align: right;
}

td a {
  color: var(--vp-c-brand-1);
  text-decoration: none;
}

td a:hover {
  text-decoration: underline;
}

.list__id {
  display: block;
  font-size: 0.7rem;
  color: var(--color-text-tertiary);
}

.list__identity {
  font-size: 0.72rem;
  color: var(--color-text-secondary);
  white-space: nowrap;
}
</style>
