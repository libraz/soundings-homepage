# soundings Homepage

Homepage for [soundings](https://soundings.libraz.net) — built with VitePress.

The site publishes the measurement archive from [`soundings`](https://github.com/libraz/soundings):
an address lookup over what each unit answered, the tone and insertion-effect
catalogues, and a browser emulator of the unit's control surface driven entirely by
the measurements.

## Data

The archive is not vendored. `yarn sync` reads a `soundings` checkout beside this one
and converts it into what the site serves — one record per address, sharded by the
first two address bytes — writing to `src/data/` and `src/public/data/`. Both are
committed, because the Cloudflare Pages build has only this repository.

```bash
yarn sync            # convert ../soundings into src/data and src/public/data
yarn sync --check    # fail if the committed data no longer matches the archive
SOUNDINGS_ROOT=/path/to/soundings yarn sync
```

Two files under `src/data/` are hand-authored rather than generated:

- `legend.json` — the single-character codes in the emitted records, mapped to the
  archive's own wording. `yarn sync` fails on a wording that is not listed, which is
  how a new verdict in the archive gets noticed instead of dropped.
- `quirks.json` — the machine-readable form of the behaviours the emulator can act
  on, keyed by the archive's own behaviour id.

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

# Run every gate: data integrity, vocabulary coverage, en/ja parity, doc links
yarn check

# Full pre-release gate: check + tests + production build
yarn verify

# Individual gates, when narrowing a failure
yarn check:data
yarn check:vocab
yarn check:i18n
yarn check:docs

# Emulator tests
yarn test
```

## License

MIT — see the [LICENSE](LICENSE) file for details. The measurements the site
publishes are CC0 1.0 and belong to the `soundings` archive.
