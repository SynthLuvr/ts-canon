import { spawnSync } from "node:child_process";
import { cpSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { packageRoot } from "../lib/runner.ts";
import { withTempDir } from "./helpers.ts";

/**
 * End-to-end: the real launcher shim -> node's native type stripping -> the
 * TypeScript CLI.
 */
const runLauncher = (args: string[]): ReturnType<typeof spawnSync> =>
  spawnSync(
    process.execPath,
    [join(packageRoot(), "bin", "ts-canon.mjs"), ...args],
    {
      encoding: "utf8",
    },
  );

/**
 * Copies the shipped package into `node_modules/ts-canon` the way a real
 * install lays it out, so the entry point's real path sits under
 * node_modules — where node refuses to type-strip and the hook in
 * `bin/type-strip.mjs` must take over.
 */
const installIntoTempNodeModules = (dir: string): string => {
  const pkg = join(dir, "node_modules", "ts-canon");
  for (const rel of ["bin", "src", "presets", "rules", "package.json"])
    cpSync(join(packageRoot(), rel), join(pkg, rel), { recursive: true });
  return join(pkg, "bin", "ts-canon.mjs");
};

describe("bin/ts-canon.mjs", () => {
  it("prints help and exits 0", () => {
    const result = runLauncher(["--help"]);
    expect(result.status).toBe(0);
    expect(result.stdout ?? "").toContain("usage: ts-canon");
  }, 120_000);

  it("exits 2 for an unknown command", () => {
    const result = runLauncher(["definitely-not-a-command"]);
    expect(result.status).toBe(2);
  }, 120_000);

  it("strips types for a copy installed under node_modules", () => {
    const [dir, cleanup] = withTempDir();
    try {
      const launcher = installIntoTempNodeModules(dir);
      const result = spawnSync(process.execPath, [launcher, "--help"], {
        encoding: "utf8",
      });
      expect(result.stderr ?? "").not.toContain(
        "ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING",
      );
      expect(result.status).toBe(0);
      expect(result.stdout ?? "").toContain("usage: ts-canon");
    } finally {
      cleanup();
    }
  }, 120_000);
});
