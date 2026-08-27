import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  entryKind,
  findPackageDir,
  packageRoot,
  resolveBin,
  runCommand,
  runSequence,
} from "../lib/runner";
import { withTempDir, writeFixture } from "./helpers";

describe("findPackageDir", () => {
  it("finds a dependency installed at the repo root", () => {
    const dir = findPackageDir("oxlint");
    expect(isAbsolute(dir)).toBe(true);
    expect(existsSync(join(dir, "package.json"))).toBe(true);
  });

  it("throws for a package that is not installed", () => {
    expect(() => findPackageDir("definitely-not-a-real-package")).toThrow(
      /cannot find package/,
    );
  });
});

describe("resolveBin", () => {
  it("resolves bundled tool entry points to absolute paths", () => {
    for (const [pkg, bin] of [
      ["@ast-grep/cli", "ast-grep"],
      ["@biomejs/biome", "biome"],
      ["convert-to-arrow", "convert-to-arrow"],
      ["jscpd", "jscpd"],
      ["oxlint", "oxlint"],
      ["tsx", "tsx"],
    ] as const) {
      const file = resolveBin(pkg, bin);
      expect(isAbsolute(file)).toBe(true);
      expect(existsSync(file)).toBe(true);
    }
  });

  it("resolves the consumer-side typescript compiler", () => {
    expect(existsSync(resolveBin("typescript", "tsc"))).toBe(true);
  });

  it("throws for an unknown bin name", () => {
    expect(() => resolveBin("oxlint", "not-a-bin")).toThrow(
      /no "not-a-bin" bin/,
    );
  });
});

describe("entryKind", () => {
  it("treats js extensions as node entries", () => {
    expect(entryKind(resolveBin("jscpd", "jscpd"))).toBe("node");
    expect(entryKind(resolveBin("tsx", "tsx"))).toBe("node");
  });

  it("sniffs the node shebang of extensionless bins", () => {
    expect(entryKind(resolveBin("@biomejs/biome", "biome"))).toBe("node");
    // @ast-grep/cli ships the platform binary itself as the bin.
    expect(entryKind(resolveBin("@ast-grep/cli", "ast-grep"))).toBe("direct");
  });

  it("treats native executables as direct entries", () => {
    const [dir, cleanup] = withTempDir();
    try {
      const fake = writeFixture(dir, "native-tool", "\u007fELFbinary");
      expect(entryKind(fake)).toBe("direct");
    } finally {
      cleanup();
    }
  });
});

describe("runCommand", () => {
  it("propagates the exit code of a node entry", async () => {
    const [dir, cleanup] = withTempDir();
    try {
      const script = writeFixture(dir, "exit.mjs", "process.exit(7);\n");
      expect(await runCommand(script, [])).toBe(7);
    } finally {
      cleanup();
    }
  }, 30_000);

  it("propagates the exit code of a native entry", async () => {
    const trueBin = "/bin/true";
    if (!existsSync(trueBin)) return;
    expect(await runCommand(trueBin, [])).toBe(0);
  }, 30_000);

  it("resolves to 1 when the entry cannot be spawned", async () => {
    expect(await runCommand("/nonexistent/ts-canon-tool", [])).toBe(1);
  }, 30_000);
});

describe("runSequence", () => {
  it("returns 0 for an empty sequence", async () => {
    expect(await runSequence([])).toBe(0);
  });

  it("stops at the first failing step and keeps its code", async () => {
    const calls: string[] = [];
    const code = await runSequence([
      {
        name: "ok",
        run: async () => {
          calls.push("ok");
          return 0;
        },
      },
      {
        name: "boom",
        run: async () => {
          calls.push("boom");
          return 3;
        },
      },
      {
        name: "never",
        run: async () => {
          calls.push("never");
          return 0;
        },
      },
    ]);
    expect(code).toBe(3);
    expect(calls).toEqual(["ok", "boom"]);
  });
});

describe("packageRoot", () => {
  it("points at this package's root, where presets/ and rules/ live", () => {
    const root = packageRoot();
    expect(existsSync(join(root, "presets", "biome.preset.json"))).toBe(true);
    expect(existsSync(join(root, "rules", "strip-braces.yml"))).toBe(true);
    expect(existsSync(join(root, "bin", "ts-canon.mjs"))).toBe(true);
  });
});
