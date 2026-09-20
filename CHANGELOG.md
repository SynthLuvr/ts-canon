# Changelog

Notable changes to ts-canon, newest first — one section per release.

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
