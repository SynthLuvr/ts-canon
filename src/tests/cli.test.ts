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
