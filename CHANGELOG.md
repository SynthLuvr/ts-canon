# Changelog

Notable changes to ts-canon, newest first — one section per release.

## 0.3.1

A preset fix plus a bundled-toolchain refresh; no breaking API or
config-schema changes.

### Fixed

- `presets/biome.preset.json` keeps markdown out of biome’s scope: the
  formatter and the linter both now exclude `**/*.md`. Biome 2.6 brought
  markdown formatting, and without the exclusion a biome upgrade would
  restyle pandoc’s canonical GFM — fence spacing, emphasis markers,
  table padding — and `lint` would fail on files `format` had just
  “fixed”. Markdown stays pandoc’s alone.
- `@biomejs/biome` is pinned to an exact version instead of a `^` range:
  the caret floated fresh installs onto biome 2.6.x, whose markdown
  formatter reintroduced the same fight inside the range’s window. An
  exact pin hands upgrades back to you, one deliberate bump at a time.

### Changed

- Refreshed the bundled toolchain: `@biomejs/biome` 2.5.15 → 2.6.3,
  `@ast-grep/cli` 0.50.0 → 0.51.0, `oxlint` 1.87.0 → 1.89.0,
  `oxlint-tsgolint` → 7.0.2005, `jscpd` 5.4.1 → 5.4.2, `npm-run-all2`
  9.0.3 → 9.0.4, and the pinned `packageManager` pnpm 12.11.2 → 12.15.0.

## 0.3.0

New config option; no breaking API or default-behavior changes.

### Added

- `pandoc.ignores` in `ts-canon.json`: gitignore-style exclude globs
  that keep markdown files out of the pandoc format and lint steps — for
  generated or vendored markdown that must keep its exact bytes.
  `ts-canon format` now reads `ts-canon.json` too, and an invalid file
  fails it with exit 2 before any tool spawns, the contract `lint`
  always had.

### Changed

- Refreshed the bundled toolchain: `@ast-grep/cli` 0.45.3 → 0.50.0,
  `oxlint` 1.85.0 → 1.87.0, `jscpd` 5.3.2 → 5.4.1, `@biomejs/biome`
  2.5.14 → 2.5.15, `oxlint-tsgolint` → 7.0.2004, and the pinned
  `packageManager` pnpm 12.6.0 → 12.11.2.

## 0.2.0

New feature plus a new default lint behavior; no breaking API or
config-schema changes.

### Added

- `no-unsafe-cast` lint rule: `ts-canon lint` now flags type assertions
  (`value as T`, `<T>value`) as errors across `.ts` and `.tsx`.
  `as const` stays allowed — it tightens literal types at compile time
  and makes no runtime claim. A cast asserts, never verifies, so a wrong
  shape fails as a runtime error far from its source; validate instead —
  a schema at data boundaries, `typeof`/`instanceof` narrowing
  elsewhere.
- `ts-canon.json` rule overrides: scope any shipped rule with
  `files`/`ignores` globs or turn it off with `"off"`. The file is
  optional — when absent, behavior is unchanged. Invalid values and
  unknown rule ids fail the run with a pointer at the exact field, so a
  typo cannot quietly disable a rule; scoped runs
  (`ts-canon lint packages/x`) read the config next to that package.
- Per-line suppression via ast-grep’s native
  `// ast-grep-ignore[: no-unsafe-cast]` comments — the same comments
  work in bare `ast-grep scan` and the editor integrations.

### Changed

- `migrate`, `doctor`, `peer-deps`, `pandoc-md`, and `runner` validate
  runtime JSON instead of asserting shapes: a malformed `scripts` or
  `devDependencies` field now fails a migration with a pointer at the
  field instead of a distant TypeError.

### Upgrade notes

- After upgrading, repos using `as` casts in product code see new lint
  errors. Nothing is removed and no config migration is required. To
  keep today’s behavior, drop a one-line config at the lint root:

  ``` json
  { "rules": { "no-unsafe-cast": "off" } }
  ```

  or scope it with `files`/`ignores`, or suppress individual lines with
  `ast-grep-ignore` comments. Turned-off rules are reported in the run’s
  skipped list.

- Bare `ast-grep scan` and editor users: the shipped
  `presets/sgconfig.yml` points at `node_modules/ts-canon/rules`, so the
  new rule is picked up automatically after upgrading — same opt-outs
  apply. Generated `.d.ts` files stay excluded as before.
