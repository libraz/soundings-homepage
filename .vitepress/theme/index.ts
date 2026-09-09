import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import './custom.css';

import AddressCard from '../../src/components/AddressCard.vue';
import AddressSearch from '../../src/components/AddressSearch.vue';
import BehaviourList from '../../src/components/BehaviourList.vue';
import BlockTable from '../../src/components/BlockTable.vue';
import DocumentClaims from '../../src/components/DocumentClaims.vue';
import EffectCatalog from '../../src/components/EffectCatalog.vue';
import EmulatorConsole from '../../src/components/EmulatorConsole.vue';
import LandingPage from '../../src/components/LandingPage.vue';
import MapList from '../../src/components/MapList.vue';
import RecordLink from '../../src/components/RecordLink.vue';
import StateChip from '../../src/components/StateChip.vue';
import ToneCatalog from '../../src/components/ToneCatalog.vue';
import UnitHeader from '../../src/components/UnitHeader.vue';
import UnitList from '../../src/components/UnitList.vue';

/**
 * Pages on this site are thin: a `.md` file carries frontmatter and one
 * component tag, and the component holds the page. Registering them globally is
 * what lets the 461 generated per-block pages stay four lines each, and it is
 * why no page file needs an import path that would have to be rewritten if a
 * component moved.
 */
export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('AddressCard', AddressCard);
    app.component('AddressSearch', AddressSearch);
    app.component('BehaviourList', BehaviourList);
    app.component('BlockTable', BlockTable);
    app.component('DocumentClaims', DocumentClaims);
    app.component('EffectCatalog', EffectCatalog);
    app.component('EmulatorConsole', EmulatorConsole);
    app.component('LandingPage', LandingPage);
    app.component('MapList', MapList);
    app.component('RecordLink', RecordLink);
    app.component('StateChip', StateChip);
    app.component('ToneCatalog', ToneCatalog);
    app.component('UnitHeader', UnitHeader);
    app.component('UnitList', UnitList);
  },
} satisfies Theme;
