import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { packageRoot } from "../lib/runner";

/** End-to-end: the real launcher shim -> tsx -> the TypeScript CLI. */
const runLauncher = (args: string[]): ReturnType<typeof spawnSync> =>
  spawnSync(
    process.execPath,
    [join(packageRoot(), "bin", "ts-toolkit.mjs"), ...args],
    {
      encoding: "utf8",
    },
  );

describe("bin/ts-toolkit.mjs", () => {
  it("prints help and exits 0", () => {
    const result = runLauncher(["--help"]);
    expect(result.status).toBe(0);
    expect(result.stdout ?? "").toContain("usage: ts-toolkit");
  }, 120_000);

  it("exits 2 for an unknown command", () => {
    const result = runLauncher(["definitely-not-a-command"]);
    expect(result.status).toBe(2);
  }, 120_000);
});
