import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { describe, expect, it } from "vitest";

import { oxlintCli, runOxlint, tsgolintExe } from "../lib/oxlint";
import { packageRoot } from "../lib/runner";
import { withTempDir } from "./helpers";

describe("oxlintCli", () => {
  it("resolves oxlint's real CLI entry point by absolute path", () => {
    const cli = oxlintCli();
    expect(isAbsolute(cli)).toBe(true);
    expect(existsSync(cli)).toBe(true);
  });
});

describe("tsgolintExe", () => {
  it("resolves the platform binary when one is installed", () => {
    const exe = tsgolintExe();
    expect(exe === undefined || existsSync(exe)).toBe(true);
  });
});

describe("runOxlint", () => {
  it("runs oxlint with the resolved tsgolint path", async () => {
    const code = await runOxlint(["--version"], packageRoot());
    expect(code).toBe(0);
    expect(process.env.OXLINT_TSGOLINT_PATH ?? "").not.toBe("");
  }, 60_000);

  it("reports diagnostics on a violating file", async () => {
    const [dir, cleanup] = withTempDir();
    try {
      const bad = join(dir, "bad.ts");
      // eval() trips oxlint's no-eval rule with --deny-warnings.
      const { writeFileSync } = await import("node:fs");
      writeFileSync(
        bad,
        'const f = (): unknown => eval("1 + 1");\nexport { f };\n',
      );
      expect(await runOxlint(["--deny-warnings", bad], dir)).not.toBe(0);
    } finally {
      cleanup();
    }
  }, 60_000);
});
