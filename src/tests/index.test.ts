import { describe, expect, it } from "vitest";

import * as toolkit from "../index";

describe("public API surface", () => {
  it("exports the CLI entry points and lib helpers", () => {
    expect(typeof toolkit.main).toBe("function");
    expect(typeof toolkit.runLint).toBe("function");
    expect(typeof toolkit.runFormat).toBe("function");
    expect(typeof toolkit.runDoctor).toBe("function");
    expect(typeof toolkit.runMigrate).toBe("function");
    expect(typeof toolkit.resolveBin).toBe("function");
    expect(typeof toolkit.runCommand).toBe("function");
    expect(typeof toolkit.runSequence).toBe("function");
    expect(typeof toolkit.findMarkdown).toBe("function");
    expect(typeof toolkit.pandocFormat).toBe("function");
    expect(typeof toolkit.pnpmPeersCheck).toBe("function");
    expect(typeof toolkit.oxlintCli).toBe("function");
    expect(typeof toolkit.runOxlint).toBe("function");
    expect(typeof toolkit.tsgolintExe).toBe("function");
    expect(toolkit.USAGE).toContain("usage: ts-toolkit");
  });
});
