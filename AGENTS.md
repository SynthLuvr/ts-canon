# AGENTS.md

Instructions for AI coding agents working in this repository.

## Quick Start

``` bash
pnpm install
pnpm build    # type-check
pnpm test     # run tests
pnpm lint     # lint all files (through ts-canon itself)
```

## Required Workflow

Always run these before considering work complete:

``` bash
pnpm build && pnpm lint && pnpm test
```

All three must pass with zero errors. This repo is self-hosted: its own
lint and format run through `ts-canon lint` / `ts-canon format`, so a
change that breaks the dogfood loop is not done.

Run tooling through `pnpm <script>`; the scripts invoke the `ts-canon`
bin (and `tsc`/`vitest`) that pnpm links into `node_modules/.bin`, under
the `scriptShell: bash` setting from `pnpm-workspace.yaml`. On Windows,
drive the toolchain from Git Bash.

## Coding Conventions (Enforced)

These are **not** preferences — the toolchain will fail if you violate
them:

### No function declarations

Use `const` + arrow function instead.

``` ts
// ❌ Wrong
function foo() {}

// ✅ Right
const foo = (): void => {};
```

**Exception: function overloads.** TypeScript overloads *require*
`function` declarations — each signature reuses the same name, which is
impossible with `const`. Overload sets are permitted, and the
`no-function-declaration` rule skips any `function_declaration` that
immediately follows an overload signature:

``` ts
// ✅ Allowed — overloads must use function declarations
function toLabel(value: string): string;
function toLabel(value: number): string;
function toLabel(value: string | number): string {
  return `label: ${value}`;
}
```

### No inline exports

Write `export` as a separate statement.

``` ts
// ❌ Wrong
export const foo = 1;

// ✅ Right
const foo = 1;
export { foo };
```

### No leading file comments

Source files must not begin with a `//` or `/*` comment (ast-grep rule
`no-file-comment`). Put documentation on the declaration it describes.

### Single-statement braces are stripped

`if`/`for`/`while` with a single body statement should not have braces.

### Formatting

- Double quotes
- 2-space indentation
- 80-character line width
- Trailing commas
- Semicolons
- Arrow function parentheses always
- Markdown formatted by pandoc (`ts-canon format` handles it)

## Formatting

If the linter complains about formatting, run:

``` bash
pnpm format
```

This runs five steps in order: 1. `convert-to-arrow` — rewrites
`function` declarations to arrow consts 2. `strip-braces` — removes
unnecessary braces from single-statement blocks 3. `biome format` —
formats all files 4. `biome check` — applies lint auto-fixes 5. `pandoc`
— normalizes Markdown to canonical GFM

## Project Structure

- `src/bin/` — CLI subcommands (`cli`, `lint`, `format`, `doctor`,
  `migrate`); `src/bin/main.ts` is the tsx entry point
- `src/lib/` — the ported template scripts (`pandoc-md`, `peer-deps`,
  `oxlint`) and the spawn-by-absolute-path `runner`
- `presets/`, `rules/` — the shipped biome/tsconfig/vitest/ast-grep
  assets, referenced by the package `exports` map
- `bin/ts-canon.mjs` — the published launcher shim (plain ESM JS)
- Tests live in `src/tests/` (filenames end in `.test.ts`); fixtures are
  generated into temp dirs by the checked-in generators, so the
  self-hosted lint stays green
- TypeScript is type-check only (`noEmit: true`); the package ships TS
  sources run through the bundled tsx
- ESM only (`"type": "module"`)

## Windows / AppLocker

Never spawn tools through `.CMD` shims or `pnpm exec`. Resolve entry
points from `node_modules` (see `src/lib/runner.ts`) and spawn them
directly; pnpm goes through `npm_execpath`; tsgolint goes through
`OXLINT_TSGOLINT_PATH`.
