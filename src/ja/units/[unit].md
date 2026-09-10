---
pageClass: page-app
aside: false
outline: false
---

<UnitHeader :unit-id="$params.unit" active="unit" />

<!-- @content -->

<AddressSearch :unit-id="$params.unit" compact />

<UnitOverview :unit-id="$params.unit" />
