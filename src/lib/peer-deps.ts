import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * Spawns pnpm without touching PATH: `npm_execpath` is pnpm's real entry
 * point — the JS file for npm/corepack installs (run under node), or the
 * native executable for standalone `@pnpm/exe` installs — so neither a shell
 * nor a Windows `.CMD` shim is involved. Returns `undefined` when pnpm is
 * not driving this process (`npm_execpath` unset).
 */
const pnpmSpawn = (
  root: string,
  args: string[],
  options: { stdio: "inherit" | "pipe" } = { stdio: "inherit" },
): ReturnType<typeof spawnSync> | undefined => {
  const pnpmEntry = process.env.npm_execpath;
  if (pnpmEntry === undefined) return undefined;

  const isJs = /\.(?:js|cjs|mjs)$/.test(pnpmEntry);
  return spawnSync(
    isJs ? process.execPath : pnpmEntry,
    isJs ? [pnpmEntry, ...args] : args,
    { cwd: root, encoding: "utf8", stdio: options.stdio },
  );
};

/** Runs a pnpm command in `root` and returns its exit code. */
const pnpmCommand = (
  root: string,
  args: string[],
  options: { stdio: "inherit" | "pipe" } = { stdio: "inherit" },
): number => {
  const result = pnpmSpawn(root, args, options);
  if (result === undefined) {
    console.error("npm_execpath is unset — run this via `pnpm lint`.");
    return 1;
  }
  if (result.error) throw result.error;

  return result.status ?? 1;
};

/** pnpm's own version, or `undefined` when it cannot be spawned. */
const pnpmVersion = (): string | undefined => {
  const result = pnpmSpawn(process.cwd(), ["--version"], { stdio: "pipe" });
  if (result === undefined) return undefined;
  if (result.error !== undefined && result.error !== null) return undefined;
  if (result.status !== 0) return undefined;
  return (result.stdout ?? "").toString().trim();
};

/**
 * `packageManager` field of the manifest at `dir`: `undefined` when the
 * manifest is absent, unreadable, or declares nothing.
 */
const manifestPackageManager = (dir: string): string | undefined => {
  const manifest = join(dir, "package.json");
  if (!existsSync(manifest)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(manifest, "utf8")) as {
      packageManager?: string;
    };
    return parsed.packageManager;
  } catch {
    // Unreadable or malformed manifests carry no declaration.
    return undefined;
  }
};

/** pnpm version from a `packageManager` value, corepack hash dropped. */
const pnpmFromField = (field: string): string | undefined => {
  const match = /^pnpm@([^\s+]+)/.exec(field);
  return match === null ? undefined : match[1];
};

/**
 * pnpm version from the nearest `packageManager` field at or above
 * `startDir`, or `undefined` when none declares pnpm. `pnpm exec` does
 * not set `npm_execpath` (only `pnpm run` does), so advisory checks fall
 * back to this: the field records the exact pnpm the repo pins. Manifests
 * without the field (e.g. monorepo subpackages) are walked past; walking
 * stops at the first manifest that declares a package manager, even when
 * it names another tool.
 */
const pnpmVersionFromPackageManager = (
  startDir: string,
): string | undefined => {
  let dir = resolve(startDir);
  for (;;) {
    const field = manifestPackageManager(dir);
    if (field !== undefined) return pnpmFromField(field);
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
};

/**
 * Fails when the installed tree has unmet or missing peer dependencies.
 * Uses `pnpm peers check` (which inspects the lockfile directly) rather than
 * `install --strict-peer-dependencies`: a frozen lockfile is not re-resolved
 * during install, so the strict flag silently misses pre-existing peer
 * conflicts.
 */
const pnpmPeersCheck = (root: string): number => {
  const status = pnpmCommand(root, ["peers", "check"]);
  if (status === 0) {
    console.log("No peer dependency issues found.");
    return 0;
  }

  console.error(
    "\nPeer dependency issues found after `pnpm install`." +
      "\nResolve the conflicts above, then re-run `pnpm install`.",
  );
  return 1;
};

export {
  pnpmCommand,
  pnpmPeersCheck,
  pnpmVersion,
  pnpmVersionFromPackageManager,
};
