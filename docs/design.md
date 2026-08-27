# ts-toolkit — Shared TypeScript Toolchain Package

## 1. Problem

The identical dev toolchain is copy-pasted across ~10 in-org repos, and
the copies have already diverged — fixes landed in *some* copies and
were lost in others. Verified drift as of today:

| Fix / behavior | Landed in | Missing from |
|----|----|----|
| `--eol=lf` pandoc output (Windows CRLF) | typescript-template | glv, lisko, bin-test, type-a-bin |
| Symlink-safe markdown discovery (monorepo cycles) | type-a-bin | typescript-template, glv, lisko |
| `npm_execpath` pnpm spawn (Windows AppLocker) | typescript-template | glv, type-a-bin |
| tsgolint path resolution for oxlint | typescript-template **only** | everywhere else |
| Bare-name tool invocation (no `.CMD` shims) | typescript-template | type-a-bin (`pnpm exec` wrappers) |

Version skew across the same repos: node `==24` vs `==26`, pnpm `9.5` →
`11.22`, ast-grep `0.40.5` → `0.45.2`, TypeScript `5.6.3` → `7.0.2`,
oxlint-tsgolint `0.23` → `7.0.2001`, biome `1.9.4` → `2.5.10`.

Duplicated material: `scripts/pandoc-md.mts` (~86–92 lines × 8 repos),
`scripts/peer-deps.mts` (~45–65 lines × 8), `scripts/oxlint.mts` (54
lines, 1 repo), 4 ast-grep rule files (11 rule ids) × 10 repos, a
~15-line `format:*`/`lint:*` script block per repo, and a 14-package
devDependency set. Roughly 1,080 lines of scripts alone, before rules
and configs.

`typescript-template` is the intended canonical source, but templates
cannot retroactively fix live repos. A shared package collapses this to
**one dependency and one upgrade path**.

> Done today as step 0: the two stranded `pandoc-md.mts` variants were
> reconciled into `typescript-template@83b914e` (union of `--eol=lf` +
> the symlink-safe walk), and devDependencies were bumped to npm latest
> (ast-grep 0.45.2, biome 2.5.10, jscpd 5.0.16, oxlint 1.80.0, vitest
> 4.1.11). The package below then ports the result unchanged.

## 2. Goals / non-goals

**Goals**

1.  One dependency replaces scripts + rules + configs + tool
    devDependencies.
2.  Every future toolchain fix lands once and propagates on
    `pnpm update`.
3.  Windows/AppLocker behavior preserved verbatim (spawn by absolute
    resolved path; never `.CMD` shims, never `pnpm exec` wrappers).
4.  Per-repo overrides remain possible (biome `extends` + local rules).
5.  Strict feature parity in v0.x — no lint/format semantics change
    during migration.

**Non-goals**

- Locking per-repo *runtime* dependencies.
- Migrating legacy biome-only repos (market, nova, ts-handling, …) —
  opt-in later.
- Replacing `typescript` as a consumer dependency (editors resolve
  project-local TS; see §3).

## 3. Package design

**Name:** `ts-toolkit` (unscoped; add an org scope at publish time).
**Single bin:** `ts-toolkit` with subcommands `lint`, `format`,
`doctor`, `migrate`.

    ts-toolkit/                     # new repo, scaffolded FROM typescript-template
      src/
        bin/cli.ts                # arg parsing -> subcommands
        bin/lint.ts               # orchestrates all checks; non-zero on failure
        bin/format.ts             # arrows -> braces -> biome -> md, in order
        bin/doctor.ts             # pandoc presence/version, node, pnpm checks
        bin/migrate.ts            # rewrites consumer package.json, deletes copies
        lib/pandoc-md.ts          # port of scripts/pandoc-md.mts (reconciled)
        lib/peer-deps.ts          # port of scripts/peer-deps.mts
        lib/oxlint.ts             # port of scripts/oxlint.mts (tsgolint path fix)
        lib/runner.ts             # sequential spawn-by-absolute-path runner
        presets/biome.json        # the canonical 144-line biome config
        presets/tsconfig.base.json
        presets/vitest.ts         # defineConfig factory
        presets/sgconfig.yml      # ruleDirs -> package rules/
        rules/                    # the 4 ast-grep files (11 rule ids)
      src/tests/                  # unit + fixture-repo integration tests

**Consumer surface after migration:**

``` json
// package.json
"scripts": {
  "build": "tsc",
  "lint": "ts-toolkit lint",
  "format": "ts-toolkit format",
  "test": "vitest run --coverage"
},
"devDependencies": {
  "ts-toolkit": "^0",          // + typescript, vitest, @vitest/coverage-v8,
                                //   @types/node, and repo-specific deps
}
```

**Dependency strategy — bundle, don’t peer.** biome, oxlint,
oxlint-tsgolint, `@ast-grep/cli`, convert-to-arrow, jscpd, tsx, and
npm-run-all2 become direct dependencies of `ts-toolkit`. Peer-deps would
reintroduce the drift this package exists to kill. Two deliberate
exceptions:

- `typescript` stays consumer-side (`tsc` runs there; editors need it
  local). `ts-toolkit doctor` reports version spread; TS bumps remain
  the one coordinated update.
- `pandoc` stays a system dependency (not npm-installable). `doctor`
  verifies `>= 3.10` with the existing error message; `lint`/`format`
  fail fast with the same guidance.

**Windows/AppLocker contract by construction.** `lib/runner.ts` resolves
each tool’s entry point from `node_modules` (the technique proven in
`scripts/oxlint.mts` and `scripts/peer-deps.mts`) and spawns it directly
— no shells, no `.CMD` shims. This also removes the consumer-side need
for `npm-run-all2` and the `scriptShell: bash` workspace workaround.

**Escape hatches.** Repos keep a local `biome.json` that `extends` the
preset and overrides; `ts-toolkit lint --fast` skips `pnpm audit` +
jscpd; extra repo-specific checks chain after `ts-toolkit lint` in their
own scripts.

**Monorepos.** The reconciled markdown walk is symlink-safe, so
workspace links cannot loop discovery (the type-a-bin lesson).
`lint`/`format` accept path arguments defaulting to `.`.

## 4. Versioning & distribution

- Semver, strictly: rule/config tightening is at most minor; tool major
  bumps (biome/oxlint/TS pattern changes) bump the package major.
- Publish on tag via GitHub Actions: **npm publish** plus a **`dist`
  branch push** (the git-branch distribution already proven in-org by
  type-a-bin’s `#dist` consumption). npm is the primary channel because
  git-tarball deps resist automated semver updates; the `#dist` branch
  is the fallback.
- **Open decision:** publish publicly on npm vs. a private registry.
  Public gives zero-auth CI and Renovate-friendly updates but makes the
  toolchain world-visible.
- **Hard rule:** the ts-toolkit repo lints and formats *with itself*
  from day one (dogfooding is the migration proof).

## 5. Migration waves

Ordered by verified version delta (lowest risk first). Each wave is one
PR per repo: `ts-toolkit migrate` rewrites the script block, deletes
`scripts/*.mts` copies and `.ast-grep/rules/`, and swaps the
devDependencies; CI must pass on ubuntu **and** windows before merge.

| Wave | Repos (verified state) | Notes |
|----|----|----|
| Pilot | bin-test or goose-log-viewer | small, disposable; prove Windows CI |
| 1 | typescript-template, ai-workers ×3, glv family ×7 | already at newest versions |
| 2 | secret-sharer ×3, lisko-deps-update, xstocks | pnpm 11.18 tier |
| 3 | lisko ×3, type-a-bin, anthropic-mock, bin-test | oxlint-tsgolint 0.25 → 7.x jump |
| 4 | incident-oncall, streamwise, services | node `==24` + TS 6.0.3 — breaking node bump, one coordinated PR each |

Rollback per repo = revert the single migration PR. Consumers pin exact
versions until they trust the range.

## 6. Testing strategy

- **Unit:** pandoc round-trip on fixture markdown; symlinked-dir
  discovery; peer-deps spawn mocking; runner path resolution.
- **Integration:** checked-in fixture “mini repo” containing violations
  of all 11 ast-grep rules plus unformatted markdown; assert `lint`
  fails and `format` fixes to a clean `lint`.
- **CI matrix:** node 24 × 26, ubuntu × **windows** (mandatory — every
  stranded fix above was a Windows bug), pandoc 3.1 vs 3.10.
- **Dogfood gate:** the package’s own `build && lint && test` runs
  through its own binaries.

## 7. Risks & verification spikes (do before writing much code)

1.  **Biome `extends` from `node_modules`** — confirm package-path
    resolution in Biome 2.5+ (relative paths work; package resolution
    needs a spike). Fallback: `ts-toolkit` passes `--config-path` to the
    bundled preset.
2.  **tsconfig `extends`** via the package `exports` map — must list
    `./tsconfig.base.json`, `./presets/*`, and `./rules/*`.
3.  **ast-grep `--rule` into `node_modules`** — verify
    `--error=<rule-id>` mapping still works from a package-relative rule
    path.
4.  **Runner semantics** — match npm-run-all’s sequential, fail-fast
    behavior exactly (order and exit codes).
5.  **Public vs private publish** (§4 decision).
6.  **Fresh-release policy** — the org’s pnpm `minimumReleaseAge`
    supply-chain gate applies to the package’s own deps; bump tools only
    past the age cutoff (or accept a documented exclusion) to keep
    installs policy-clean.

## 8. Workstreams & next actions

| \# | Workstream | First step |
|----|----|----|
| 1 | Spikes (§7 items 1–4) | half-day timebox each; record results in this file |
| 2 | Bootstrap repo | scaffold from typescript-template@83b914e; port the three scripts as `lib/` modules unchanged |
| 3 | CLI + presets | `lint`/`format`/`doctor` subcommands; presets wired via spike winners |
| 4 | Self-host | switch the package’s own scripts to `ts-toolkit lint`/`format` |
| 5 | Pilot migration | bin-test end-to-end incl. Windows CI |
| 6 | Release v0.1.0 | tag → npm publish + `dist` branch; changelog |
| 7 | Waves 1–4 | one PR per repo; track in a checklist issue |
| 8 | Ongoing | single “update toolchain” PR across repos per tool bump (Renovate or workflow) |

**Payoff:** ~1,080 lines of duplicated scripts, 11 ast-grep rules × 10
repos, ~15-line script blocks, and a 14-package devDependency set
collapse into one dependency; every future toolchain fix lands exactly
once.
