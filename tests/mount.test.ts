// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import LevelChip from '../src/components/LevelChip.vue';
import en from '../src/locales/en.json';
import ja from '../src/locales/ja.json';
import { mountWith } from './mount';

/**
 * Proves the mount harness: a component reading `useI18n()` must render the
 * locale's own words, not a hard-coded one, and no two locales may render the
 * same text for a level that is worded differently in each.
 */
describe('mountWith', () => {
  it('renders the English wording for a level in the en locale', () => {
    const wrapper = mountWith(LevelChip, { level: 'identified' }, { locale: 'en' });
    expect(wrapper.text()).toBe(en.algorithms.level.identified);
  });

  it('renders the Japanese wording for the same level in the ja locale', () => {
    const wrapper = mountWith(LevelChip, { level: 'identified' }, { locale: 'ja' });
    expect(wrapper.text()).toBe(ja.algorithms.level.identified);
  });

  it('differs between the two locales', () => {
    const enWrapper = mountWith(LevelChip, { level: 'identified' }, { locale: 'en' });
    const jaWrapper = mountWith(LevelChip, { level: 'identified' }, { locale: 'ja' });
    expect(enWrapper.text()).not.toBe(jaWrapper.text());
  });
});
