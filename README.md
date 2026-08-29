# ts-canon

One dependency that replaces the duplicated TypeScript dev toolchain —
the `lint`/`format` script blocks, the `scripts/*.mts` helpers, the four
ast-grep rule files, the biome config, and the 14-package devDependency
set — across every repo in the org.

Scaffolded from `typescript-template` and self-hosted: this repo’s own
`pnpm build && pnpm lint && pnpm test` runs through `ts-canon`’s own
binaries.

## Install

``` bash
pnpm add -D ts-canon
pnpm exec ts-canon migrate   # rewrites package.json, deletes copies
pnpm install
pnpm lint
```

`migrate` rewrites the script block, deletes `scripts/pandoc-md.mts`,
`scripts/peer-deps.mts`, `scripts/oxlint.mts`, and `.ast-grep/rules/`,
swaps the tool devDependencies for `ts-canon`, and points `biome.json`
at the shipped preset. Run it with `--dry-run` first to see the plan. An
already-installed non-registry spec (git, `file:`, `link:`,
`workspace:`) is preserved — rewriting a git install to `^0` would
produce an uninstallable `package.json` — and `migrate --version <spec>`
forces a spec when you want one. Reverting the migration PR is the
rollback.

ts-canon is published to npm; git installs
(`pnpm add -D github:SynthLuvr/ts-canon#<ref>`) also work, and `migrate`
keeps that spec intact.

### Consumer surface

``` json
// package.json
"scripts": {
  "build": "tsc",
  "lint": "ts-canon lint",
  "format": "ts-canon format",
  "test": "vitest run --coverage"
},
"devDependencies": {
  "ts-canon": "^0"
  // + typescript, vitest, @vitest/coverage-v8, @types/node
  //   and repo-specific deps
}
```

## Commands

| Command | Description |
|----|----|
| `ts-canon lint` | All checks: biome, oxlint (tsgolint), 3 ast-grep rules, pandoc, peer-deps, `pnpm audit --prod`, jscpd |
| `ts-canon format` | All formatters, in order: convert-to-arrow, strip-braces, biome format, biome check, pandoc |
| `ts-canon doctor` | Verify pandoc (\>= 3.10), node (\>= 24), pnpm, bundled tools, and the consumer-side typescript |
| `ts-canon migrate` | Convert a repo to ts-canon (see above; `--dry-run`, `--version <spec>`) |

Both `lint` and `format` accept path arguments (default `.`), so
monorepos can scope a run: `ts-canon lint packages/glv`. `lint --fast`
skips `pnpm audit` and jscpd. The pnpm steps skip themselves when the
target has no `pnpm-lock.yaml`.

For a single directory argument, `format` runs its own walk — skipping
`node_modules`, hidden entries, and symlinks, the same rule the pandoc
step applies — and hands convert-to-arrow one explicit, brace-anchored
glob. A bare `.` would be unsafe: the codemod’s `node_modules` negation
filters results without pruning its walk, and it follows symlinks, so on
a pnpm workspace whose root is also a workspace dependency the walk
chases the hoisted link cycle until the process exhausts its heap.

## What you get

- `presets/biome.preset.json` — the canonical biome config; keep a local
  `biome.json` with `"extends": ["ts-canon/presets/biome.preset.json"]`
  and override anything.
- `presets/tsconfig.base.json` — extend from your `tsconfig.json` via
  `"extends": "ts-canon/presets/tsconfig.base.json"`.
- `presets/vitest` — `defineConfig` factory (tests in `src/tests`, v8
  coverage, 80% thresholds), imported from your `vitest.config.ts` as
  `ts-canon/presets/vitest`. Shipped compiled (`vitest.mjs` +
  `vitest.d.mts`): node refuses to type-strip `.ts` under `node_modules`
  (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`), so a `.ts` factory
  cannot work from a real install.
- `presets/sgconfig.yml` — copy to your repo root to point bare
  `ast-grep scan` and editor integrations at the shipped rules.
- `rules/` — the four ast-grep rule files (11 rule ids).
- Bundled as direct dependencies: biome, oxlint, oxlint-tsgolint,
  `@ast-grep/cli`, convert-to-arrow, jscpd, tsx, npm-run-all2. Peer
  dependency ranges would reintroduce the drift this package exists to
  kill.

Two deliberate exceptions stay on your side:

- `typescript` — `tsc` runs in your repo and editors resolve the
  project-local install; `ts-canon doctor` reports its version.
- `pandoc` — a system dependency (\>= 3.10), not npm-installable;
  `doctor` verifies it, and `lint`/`format` fail fast with install
  guidance.

## Windows / AppLocker contract

Every bundled tool is resolved from `node_modules` by absolute path —
its real entry point, read from the package `bin` field — and spawned
directly: no shells, no `.CMD` shims, no `pnpm exec` wrappers. pnpm
itself is spawned via `npm_execpath`, and tsgolint is handed to oxlint
via `OXLINT_TSGOLINT_PATH`. Markdown is formatted with `pandoc --eol=lf`
so checks stay byte-stable on Windows. See `src/lib/runner.ts`.

## Development

This repo is its own first consumer:

``` bash
pnpm install
pnpm build    # tsc --noEmit over src/
pnpm run doctor   # environment check (pnpm has a built-in doctor)
pnpm lint     # ts-canon lint (dogfood)
pnpm format   # ts-canon format
pnpm test     # vitest with coverage thresholds
```

The launcher is `bin/ts-canon.mjs` (plain ESM JS): it resolves the
bundled tsx by absolute path and runs `src/bin/main.ts` under the
current node. The package ships TypeScript sources (the vitest preset
ships compiled — see above); publishing is tag-driven (npm publish plus
a `dist` branch push for git-tarball consumption) — see
`.github/workflows/release.yml`. The repo’s own `vitest.config.ts`
imports `ts-canon/presets/vitest`, so every `pnpm test` exercises the
shipped compiled preset.

Design rationale, spike results, and the migration wave plan live in
`docs/design.md` and `docs/spikes.md`.

## Versioning

Semver, strictly: rule/config tightening is at most a minor bump; tool
major bumps (biome/oxlint/TypeScript pattern changes) bump the package
major. Consumers may pin exact versions until they trust the range.
