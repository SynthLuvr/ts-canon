import { spawnSync } from "node:child_process";

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

export { pnpmCommand, pnpmPeersCheck, pnpmVersion };
