---
pageClass: page-app
aside: false
outline: false
search: false
---

<UnitHeader :unit-id="$params.unit" active="map" />

<!-- @content -->

<BlockTable :unit-id="$params.unit" :block="$params.block" />
