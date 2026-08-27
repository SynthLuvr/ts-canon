# Spike results (design doc §7)

Verified before implementation, against the reconciled
`typescript-template@75988dd` toolchain (biome 2.5.x, ast-grep 0.45, tsx
4.23, TypeScript 7.0).

## 1. Biome `extends` from `node_modules` — WORKS

A child config with `"extends": ["typescript-template/biome.json"]`
(where `node_modules/typescript-template` is a symlink to the template
repo) picks up the preset’s rules: a `var` declaration is flagged as
`useConst`, `biome check` exits 1, and a child override
(`"vcs": { "enabled": false }`) merges over the preset. Resolution is by
literal package subpath under `node_modules`, not via the package
`exports` map — so the preset must exist at
`node_modules/ts-canon/presets/biome.preset.json` on disk. Consequence:
`presets/` and `rules/` live at the package root (not under `src/`), and
the package’s own `biome.json` dogfoods the bare specifier
`"ts-canon/presets/biome.preset.json"` through the pnpm self-link.

## 2. tsconfig `extends` via the package — WORKS

`tsc -p` with `"extends": "typescript-template/tsconfig.json"` resolves
through `node_modules` (verified with a symlinked fixture; TypeScript
honors package subpaths for `extends`). The package `exports` map lists
`./presets/*` and `./tsconfig.base.json`; the repo’s own `tsconfig.json`
dogfoods the bare specifier.

## 3. ast-grep `--rule` into `node_modules` — WORKS

`ast-grep scan --rule /abs/path/to/no-inline-export.yml --error=no-inline-export <file>`
exits 1 with the rule id mapped to error level from an absolute
package-relative path. Encoded as a regression test in
`src/tests/integration.test.ts`.

## 4. Runner semantics — MATCHED

`npm-run-all`’s sequential mode stops at the first non-zero step and
exits with that code; `runSequence` in `src/lib/runner.ts` replicates
exactly that (verified by unit test). All tools are spawned by absolute
resolved path — JS entries under the current node (detected by extension
or node shebang), native executables directly — so no shell, PATH
lookup, or `.CMD` shim is involved anywhere.

## 5. Public vs. private publish — STILL OPEN

The release workflow (`release.yml`) consumes an `NPM_TOKEN` secret
either way; flip `--access` / registry when the decision lands. The
`dist` branch fallback is scripted in the same workflow.

## 6. Fresh-release policy — NOTED

The org’s pnpm `minimumReleaseAge` gate is not configured in this repo’s
`pnpm-workspace.yaml`; dependency versions were pinned to the reconciled
template set (already past the cutoff when this repo was cut). If the
gate applies at install time elsewhere, bump tools only past the age
cutoff to keep installs policy-clean.

## Additional decisions recorded during implementation

- **jscpd ignore.** The template ran `jscpd src`; `ts-canon lint`
  defaults to path `.` and therefore passes
  `--ignore "**/node_modules/**,**/coverage/**"` so default runs stay
  out of `node_modules`.
- **Lockfile-gated pnpm steps.** `peer-deps` and `audit` skip with a
  notice when the target root has no `pnpm-lock.yaml` (they are
  meaningless outside a pnpm project); `--fast` skips `audit` + jscpd
  per the design doc.
- **oxlint execution.** The original `scripts/oxlint.mts` imported the
  oxlint CLI in-process (reading `process.argv`); the orchestrator
  spawns the same entry with the same env and args instead, so
  `process.argv` stays clean for subcommand parsing.
- **Fix hint.** The pandoc drift message points at `ts-canon format`
  instead of `pnpm format:md` (same check, new entry point).
- **Fixture generation.** The integration fixture is generated into a
  temp dir by a checked-in generator rather than checked in as raw
  files: a static fixture full of violations would fail this repo’s own
  self-hosted lint. Generator in `src/tests/integration.test.ts`.

## Late findings during self-hosting

- **Preset file naming.** Biome errors with “Found a nested root
  configuration” when it encounters a second `biome.json` inside the
  scanned tree — which is exactly what the shipped preset is. The preset
  is therefore named `presets/biome.preset.json`; consumers `extends` it
  by that path.
- **Pandoc and unknown info strings.** `pandoc -t gfm` drops fenced
  code-block info strings it does not know (`jsonc`), and a bare fence
  is then rewritten as an indented code block on the *next* pass — the
  byte-for-byte check only converges after two formats. Docs use info
  strings pandoc preserves (`json`, `bash`, `ts`, `yaml`).
- **`pnpm doctor` is a pnpm built-in** and shadows a script of the same
  name; the repo’s script must be invoked as `pnpm run doctor`.
- **convert-to-arrow requires a `tsconfig.json`** in the target
  directory (ts-morph reads it unconditionally); `ts-canon migrate`
  leaves consumer tsconfigs in place, and the fixture generator writes
  one that extends the shipped `tsconfig.base.json`.
- **ast-grep cosmetic noise.** Scanning paths outside a git repo
  (e.g. temp fixtures) prints
  `ERROR: <rule>: No such file or directory (os error 2)` while still
  reporting correct diagnostics and exit codes. Two occurrences were
  also seen mid-tree-mutation inside this repo, unreproducible since
  (30+ clean runs across the shim, the runner spawn, and `pnpm lint`).
  Documented here for traceability.
- **`@ast-grep/cli`’s bin is the native binary itself** (not a JS
  launcher), so the runner spawns it directly — the `entryKind`
  shebang/extension sniff classifies it `direct`.
