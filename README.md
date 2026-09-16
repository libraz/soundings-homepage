# soundings Homepage

[![License](https://img.shields.io/badge/license-MIT-blue)](https://github.com/libraz/soundings-homepage/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-7-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Site](https://img.shields.io/badge/site-soundings.libraz.net-2563eb)](https://soundings.libraz.net)
[![VitePress](https://img.shields.io/badge/VitePress-1-5c73e7?logo=vite&logoColor=white)](https://vitepress.dev/)

The site that publishes [`soundings`](https://github.com/libraz/soundings) — an archive of
what hardware MIDI sound modules actually do, measured one unit at a time. Built with
VitePress and deployed at <https://soundings.libraz.net>, in English at the root and
Japanese under `/ja/`.

## What the site shows

- **Address lookup** — every address a unit answered a read at, with what it held at
  power-on, what values it accepted, whether its neighbours are separate addresses, and
  what each reset put back.
- **The address space as one grid** — a bank laid out over its blocks and a block over its
  128 offsets, in the same sixteen columns at both scales.
- **Tone and insertion-effect catalogues** — the bank and program combinations the unit
  actually moved to, and what each effect parameter was heard to do.
- **A browser emulator** of the unit's control surface, driven by the measurements alone.
  It answers what was recorded and says *not measured* when a question was never put.
- **What published documents state**, shown beside the measurement it is about and never
  mixed into it.
- **What is behind the measurements** — which algorithm a byte is driving, how far
  identifying it has got, what the reading rests on, and what would show it wrong. Where
  a model built from it reproduced what the unit did, that model is published as C++,
  generated from the archive rather than written by hand.
- **The measurement protocol**, under `/docs/` — copied from the archive's own `docs/`
  by `yarn sync`, so the pages here are a rendering and the repository next door is where
  they are edited.

A reading of the measurements is not a measurement, and the site never lets the two read
as one thing. A claim from the archive's `inferences/` tree carries the archive's own
state and its own verdict on the model built from it, in the archive's own words. An
implementation is published only where both closed; a model that was rejected is shown
as rejected and prints no code. How any of it is arrived at is
[`/docs/identifying-an-algorithm`](https://soundings.libraz.net/docs/identifying-an-algorithm).

## The rule everything else follows

The archive is the authority and the site is a rearrangement of it. Nothing is asserted
here that no record establishes:

- An address is never given a name from a specification. `40 11 30` is described by what
  was measured about it.
- A name a published manual prints is shown as that manual's statement, with the edition
  and the printed page beside it, and never as something the unit answered.
- An absence is rendered as *not measured* — never as zero, blank, or an empty cell.
- Every verdict, range and emulator reply links to the record that produced it.

## Data

The archive is not vendored. `yarn sync` reads a `soundings` checkout beside this one and
converts it into what the site serves — one record per address, sharded by the first two
address bytes — writing to `src/data/` and `src/public/data/`. Both are committed, because
the Cloudflare Pages build has only this repository.

```bash
yarn sync            # convert ../soundings into src/data and src/public/data
yarn sync --check    # fail if the committed data no longer matches the archive
SOUNDINGS_ROOT=/path/to/soundings yarn sync
```

Two files under `src/data/` are hand-authored rather than generated:

- `legend.json` — the single-character codes in the emitted records, mapped to the
  archive's own wording. `yarn sync` fails on a wording that is not listed, which is how a
  new verdict in the archive gets noticed instead of dropped.
- `quirks.json` — the machine-readable form of the behaviours the emulator can act on,
  keyed by the archive's own behaviour id.

## Development

```bash
# Install dependencies
yarn install

# Start dev server
yarn dev

# Build for production
yarn build

# Preview production build
yarn preview

# Run every gate: types, data integrity, document claims, vocabulary coverage,
# en/ja parity, doc links
yarn check

# Full pre-release gate: check + tests + production build
yarn verify

# Individual gates, when narrowing a failure
yarn check:types
yarn check:data
yarn check:claims
yarn check:vocab
yarn check:i18n
yarn check:docs

# Emulator tests
yarn test
```

`yarn check:types` covers the TypeScript sources. It does not reach inside a single-file
component's template, because the tool that does needs an entry point TypeScript 7 no
longer publishes.

## Deployment

Cloudflare Pages, serving <https://soundings.libraz.net>. Build command `yarn build`,
output directory `.vitepress/dist`. Preview hosts carry a `noindex` from
`src/public/_headers`, so only the production hostname is indexed.

## License

MIT — see the [LICENSE](LICENSE) file for details.

The measurements the site publishes are CC0 1.0 and belong to the `soundings` archive.
What the site shows from published documentation is neither: it is read out of documents
this project does not distribute, and carries the rights note of the archive directory it
lives in.
