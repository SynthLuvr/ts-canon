import { createRequire } from "node:module";
import { resolveBin, runCommand } from "./runner";

const require = createRequire(import.meta.url);

/** Absolute path to oxlint's own CLI entry point. */
const oxlintCli = (): string => resolveBin("oxlint", "oxlint");

/**
 * Absolute path to the tsgolint executable, or `undefined` when this
 * platform has no prebuilt binary — in which case oxlint falls back to its
 * own lookup and reports the missing package itself.
 */
const tsgolintExe = (): string | undefined => {
  const name = process.platform === "win32" ? "tsgolint.exe" : "tsgolint";
  const target = `@oxlint-tsgolint/${process.platform}-${process.arch}/${name}`;
  try {
    // Resolve from oxlint-tsgolint, which declares the per-platform packages;
    // they are not direct dependencies of this project.
    const tsgolint = require.resolve("oxlint-tsgolint/package.json");
    return createRequire(tsgolint).resolve(target);
  } catch {
    return undefined;
  }
};

/**
 * Runs oxlint with `OXLINT_TSGOLINT_PATH` pointed at the real tsgolint
 * executable. oxlint's type-aware rules shell out to tsgolint, and on
 * Windows it prefers the `node_modules/.bin/tsgolint.CMD` shim over the
 * platform binary. Batch files under the user profile are blocked outright
 * on AppLocker-managed Windows hosts, so resolve the platform binary here
 * and hand oxlint an absolute path — honoured on every platform, so no
 * per-OS branching is needed beyond the executable's name.
 *
 * The original `scripts/oxlint.mts` imported the CLI entry in-process; the
 * orchestrator spawns it instead (same entry, same env, same args) so
 * `process.argv` stays clean and failures are isolated per process.
 */
const runOxlint = (args: string[], cwd: string): Promise<number> => {
  const exe = tsgolintExe();
  if (exe !== undefined) process.env.OXLINT_TSGOLINT_PATH = exe;
  return runCommand(oxlintCli(), args, { cwd });
};

export { oxlintCli, runOxlint, tsgolintExe };
