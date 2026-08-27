import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

/** devDependencies ts-toolkit replaces (plus any `@ast-grep/cli-*` platform pin). */
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

/** Per-step scripts collapsed into `ts-toolkit lint` / `ts-toolkit format`. */
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

const BIOME_EXTENDS = "ts-toolkit/presets/biome.preset.json";

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

/**
 * Converts a consumer repo to ts-toolkit: rewrites the `lint`/`format`
 * script block, deletes the ported `scripts/*.mts` copies and
 * `.ast-grep/rules/`, swaps the tool devDependencies for `ts-toolkit`, and
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
  const scripts: Record<string, string> = { ...pkg.scripts };
  const removedScripts = LEGACY_STEP_SCRIPTS.filter((key) => {
    if (!(key in scripts)) return false;
    delete scripts[key];
    return true;
  });
  scripts.lint = "ts-toolkit lint";
  scripts.format = "ts-toolkit format";

  const devDeps: Record<string, string> = { ...pkg.devDependencies };
  const removedDeps = Object.keys(devDeps).filter(
    (name) => TOOL_DEV_DEPS.has(name) || name.startsWith("@ast-grep/cli-"),
  );
  for (const name of removedDeps) delete devDeps[name];
  devDeps["ts-toolkit"] = options.version ?? "^0";
  pkg.scripts = scripts;
  pkg.devDependencies = Object.fromEntries(
    Object.entries(devDeps).sort(([a], [b]) => a.localeCompare(b)),
  );

  const doomedFiles = LEGACY_SCRIPT_FILES.map((file) => join(root, file));
  const rulesDir = join(root, ".ast-grep", "rules");

  if (options.dryRun === true) {
    console.log("[migrate] dry run — no changes written");
    console.log(`[migrate] would remove scripts: ${removedScripts.join(", ")}`);
    console.log(`[migrate] would remove devDeps: ${removedDeps.join(", ")}`);
    for (const file of doomedFiles)
      if (existsSync(file)) console.log(`[migrate] would delete ${file}`);
    if (existsSync(rulesDir)) console.log(`[migrate] would delete ${rulesDir}`);
    return 0;
  }

  writeJson(pkgPath, pkg);
  console.log(
    `[migrate] rewrote package.json (removed ${removedScripts.length} scripts, ${removedDeps.length} devDeps)`,
  );

  for (const file of doomedFiles) {
    if (!existsSync(file)) continue;
    rmSync(file);
    console.log(`[migrate] deleted ${file}`);
  }
  removeIfEmpty(join(root, "scripts"));
  if (existsSync(rulesDir)) {
    rmSync(rulesDir, { recursive: true, force: true });
    console.log(`[migrate] deleted ${rulesDir}`);
  }
  removeIfEmpty(join(root, ".ast-grep"));

  ensureBiomeExtends(root, false);

  console.log(
    "\nNext: pnpm install && pnpm lint\n" +
      "Consider extending tsconfig.json from ts-toolkit/presets/tsconfig.base.json\n" +
      "and keeping a local .oxlintrc.json for type-aware rules.",
  );
  return 0;
};

export { runMigrate };
