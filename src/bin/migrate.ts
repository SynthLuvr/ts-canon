import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

/** devDependencies ts-canon replaces (plus any `@ast-grep/cli-*` platform pin). */
const TOOL_DEV_DEPS = new Set([
  "@ast-grep/cli",
  "@biomejs/biome",
  "convert-to-arrow",
  "jscpd",
  "npm-run-all2",
  "oxlint",
  "oxlint-tsgolint",
  "tsx",
]);

/** Per-step scripts collapsed into `ts-canon lint` / `ts-canon format`. */
const LEGACY_STEP_SCRIPTS = [
  "format:arrows",
  "format:biome",
  "format:braces",
  "format:check",
  "format:md",
  "lint:audit",
  "lint:biome",
  "lint:duplicates",
  "lint:exports",
  "lint:file-comment",
  "lint:functions",
  "lint:md",
  "lint:oxlint",
  "lint:peer-deps",
];

/** Script copies deleted by migration. */
const LEGACY_SCRIPT_FILES = [
  "scripts/pandoc-md.mts",
  "scripts/peer-deps.mts",
  "scripts/oxlint.mts",
];

const BIOME_EXTENDS = "ts-canon/presets/biome.preset.json";

const NEXT_STEPS = `
Next: pnpm install && pnpm lint
Consider extending tsconfig.json from ts-canon/presets/tsconfig.base.json
and keeping a local .oxlintrc.json for type-aware rules.`;

type PackageJson = {
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

type MigrateOptions = { root?: string; version?: string; dryRun?: boolean };

const readJson = <T>(file: string): T =>
  JSON.parse(readFileSync(file, "utf8")) as T;

const writeJson = (file: string, value: unknown): void => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};

/** Collapses the legacy per-step scripts into the ts-canon pair, in place. */
const rewriteScripts = (pkg: PackageJson): string[] => {
  const scripts: Record<string, string> = { ...pkg.scripts };
  const removed = LEGACY_STEP_SCRIPTS.filter((key) => key in scripts);
  for (const key of removed) delete scripts[key];
  scripts.lint = "ts-canon lint";
  scripts.format = "ts-canon format";
  pkg.scripts = scripts;
  return removed;
};

/** Swaps the replaced tool devDependencies for ts-canon, sorted by name. */
const rewriteDevDeps = (pkg: PackageJson, version?: string): string[] => {
  const devDeps: Record<string, string> = { ...pkg.devDependencies };
  const removed = Object.keys(devDeps).filter(
    (name) => TOOL_DEV_DEPS.has(name) || name.startsWith("@ast-grep/cli-"),
  );
  for (const name of removed) delete devDeps[name];
  devDeps["ts-canon"] = version ?? "^0";
  pkg.devDependencies = Object.fromEntries(
    Object.entries(devDeps).sort(([a], [b]) => a.localeCompare(b)),
  );
  return removed;
};

/** Rewrites `biome.json` to extend the shipped preset, preserving overrides. */
const ensureBiomeExtends = (root: string, dryRun: boolean): void => {
  const file = join(root, "biome.json");
  const biome: Record<string, unknown> = existsSync(file)
    ? readJson<Record<string, unknown>>(file)
    : {};
  const extended = Array.isArray(biome.extends)
    ? (biome.extends as string[])
    : [];
  if (extended.includes(BIOME_EXTENDS)) return;

  biome.extends = [...extended, BIOME_EXTENDS];
  if (!dryRun) writeJson(file, biome);
  console.log(
    `[migrate] ${existsSync(file) ? "extended" : "created"} biome.json from ${BIOME_EXTENDS}`,
  );
};

/** Removes `dir` when it is empty (best effort; non-empty dirs are kept). */
const removeIfEmpty = (dir: string): void => {
  try {
    rmdirSync(dir);
    console.log(`[migrate] removed empty ${dir}`);
  } catch {
    // Directory not empty or already gone — nothing to do.
  }
};

/** Deletes the ported `scripts/*.mts` copies and `.ast-grep/rules/`. */
const deletePortedFiles = (root: string): void => {
  for (const rel of LEGACY_SCRIPT_FILES) {
    const file = join(root, rel);
    if (!existsSync(file)) continue;
    rmSync(file);
    console.log(`[migrate] deleted ${file}`);
  }
  removeIfEmpty(join(root, "scripts"));

  const rulesDir = join(root, ".ast-grep", "rules");
  if (existsSync(rulesDir)) {
    rmSync(rulesDir, { recursive: true, force: true });
    console.log(`[migrate] deleted ${rulesDir}`);
  }
  removeIfEmpty(join(root, ".ast-grep"));
};

/** Prints the same plan the real run would apply, without writing. */
const printDryRunPlan = (
  root: string,
  removedScripts: string[],
  removedDeps: string[],
): void => {
  console.log("[migrate] dry run — no changes written");
  console.log(`[migrate] would remove scripts: ${removedScripts.join(", ")}`);
  console.log(`[migrate] would remove devDeps: ${removedDeps.join(", ")}`);
  for (const rel of LEGACY_SCRIPT_FILES) {
    const file = join(root, rel);
    if (existsSync(file)) console.log(`[migrate] would delete ${file}`);
  }
  const rulesDir = join(root, ".ast-grep", "rules");
  if (existsSync(rulesDir)) console.log(`[migrate] would delete ${rulesDir}`);
};

/**
 * Converts a consumer repo to ts-canon: rewrites the `lint`/`format`
 * script block, deletes the ported `scripts/*.mts` copies and
 * `.ast-grep/rules/`, swaps the tool devDependencies for `ts-canon`, and
 * points `biome.json` at the shipped preset. Reviewable as one PR;
 * reverting that PR is the rollback.
 */
const runMigrate = (options: MigrateOptions = {}): number => {
  const root = resolve(options.root ?? ".");
  const pkgPath = join(root, "package.json");
  if (!existsSync(pkgPath)) {
    console.error(`[migrate] no package.json at ${pkgPath}`);
    return 1;
  }

  const pkg = readJson<PackageJson>(pkgPath);
  const removedScripts = rewriteScripts(pkg);
  const removedDeps = rewriteDevDeps(pkg, options.version);

  if (options.dryRun === true) {
    printDryRunPlan(root, removedScripts, removedDeps);
    return 0;
  }

  writeJson(pkgPath, pkg);
  console.log(
    `[migrate] rewrote package.json (removed ${removedScripts.length} scripts, ${removedDeps.length} devDeps)`,
  );
  deletePortedFiles(root);
  ensureBiomeExtends(root, false);
  console.log(NEXT_STEPS);
  return 0;
};

export { runMigrate };
