import { describe, expect, it, vi } from "vitest";

import { main } from "../bin/cli";

describe("main", () => {
  it("prints usage and fails without a command", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    try {
      expect(await main([])).toBe(2);
      expect(error).toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });

  it("prints usage and succeeds for help", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      expect(await main(["--help"])).toBe(0);
      expect(await main(["help"])).toBe(0);
      expect(log).toHaveBeenCalledTimes(2);
    } finally {
      log.mockRestore();
    }
  });

  it("rejects unknown commands with exit code 2", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    try {
      expect(await main(["bogus"])).toBe(2);
      expect(error.mock.calls[0]?.[0]).toContain("unknown command: bogus");
    } finally {
      error.mockRestore();
    }
  });
});

describe("main: migrate options", () => {
  it("forwards --version (space and = forms) and --dry-run", async () => {
    vi.resetModules();
    vi.doMock("../bin/migrate", () => ({
      runMigrate: vi.fn().mockReturnValue(0),
    }));
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      const { main: mainMocked } = await import("../bin/cli");
      const { runMigrate } = await import("../bin/migrate");

      expect(
        await mainMocked(["migrate", "--dry-run", "--version", "^0.2.0"]),
      ).toBe(0);
      expect(runMigrate).toHaveBeenCalledWith({
        dryRun: true,
        version: "^0.2.0",
      });

      expect(await mainMocked(["migrate", "--version=github:u/r#abc"])).toBe(0);
      expect(runMigrate).toHaveBeenLastCalledWith({
        dryRun: false,
        version: "github:u/r#abc",
      });
    } finally {
      log.mockRestore();
      vi.doUnmock("../bin/migrate");
      vi.resetModules();
    }
  });

  it("rejects --version without a value", async () => {
    vi.resetModules();
    vi.doMock("../bin/migrate", () => ({
      runMigrate: vi.fn().mockReturnValue(0),
    }));
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    try {
      const { main: mainMocked } = await import("../bin/cli");
      const { runMigrate } = await import("../bin/migrate");

      expect(await mainMocked(["migrate", "--version"])).toBe(2);
      expect(error).toHaveBeenCalledWith(
        "migrate: --version requires a value\n",
      );
      expect(runMigrate).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
      vi.doUnmock("../bin/migrate");
      vi.resetModules();
    }
  });
});
