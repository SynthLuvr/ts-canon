import { describe, expect, it } from "vitest";

import * as canon from "../index";

describe("public API surface", () => {
  it("exports the CLI entry points and lib helpers", () => {
    expect(typeof canon.main).toBe("function");
    expect(typeof canon.runLint).toBe("function");
    expect(typeof canon.runFormat).toBe("function");
    expect(typeof canon.runDoctor).toBe("function");
    expect(typeof canon.runMigrate).toBe("function");
    expect(typeof canon.resolveBin).toBe("function");
    expect(typeof canon.runCommand).toBe("function");
    expect(typeof canon.runSequence).toBe("function");
    expect(typeof canon.findMarkdown).toBe("function");
    expect(typeof canon.pandocFormat).toBe("function");
    expect(typeof canon.pnpmPeersCheck).toBe("function");
    expect(typeof canon.oxlintCli).toBe("function");
    expect(typeof canon.runOxlint).toBe("function");
    expect(typeof canon.tsgolintExe).toBe("function");
    expect(canon.USAGE).toContain("usage: ts-canon");
  });
});
