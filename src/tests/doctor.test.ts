import { describe, expect, it, vi } from "vitest";

import { isAtLeast, parseVersion } from "../bin/doctor";

describe("parseVersion", () => {
  it("parses release versions", () => {
    expect(parseVersion("3.10.2")).toEqual([3, 10, 2]);
    expect(parseVersion("24")).toEqual([24, 0, 0]);
    expect(parseVersion("v1.2.3")).toEqual([1, 2, 3]);
  });

  it("rejects non-versions", () => {
    expect(parseVersion("")).toBeUndefined();
    expect(parseVersion("abc")).toBeUndefined();
  });
});

describe("isAtLeast", () => {
  it("compares component-wise", () => {
    expect(isAtLeast([3, 10, 0], [3, 10, 0])).toBe(true);
    expect(isAtLeast([3, 10, 1], [3, 10, 0])).toBe(true);
    expect(isAtLeast([3, 9, 9], [3, 10, 0])).toBe(false);
    expect(isAtLeast([4, 0, 0], [3, 10, 0])).toBe(true);
    expect(isAtLeast([3, 10, 0], [4, 0, 0])).toBe(false);
  });
});

describe("runDoctor", () => {
  it("passes on a healthy environment", async () => {
    vi.resetModules();
    vi.doMock("../lib/pandoc-md", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../lib/pandoc-md")>();
      return { ...actual, pandocVersion: () => "3.10.2" };
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    try {
      const { runDoctor: mocked } = await import("../bin/doctor");
      expect(mocked()).toBe(0);
    } finally {
      log.mockRestore();
      error.mockRestore();
      vi.doUnmock("../lib/pandoc-md");
    }
  });

  it("fails when pandoc is missing", async () => {
    vi.resetModules();
    vi.doMock("../lib/pandoc-md", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../lib/pandoc-md")>();
      return { ...actual, pandocVersion: () => undefined };
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    try {
      const { runDoctor: mocked } = await import("../bin/doctor");
      expect(mocked()).toBe(1);
      expect(error).toHaveBeenCalledWith(
        "pandoc was not found on PATH. Install pandoc (>= 3.10) and retry.",
      );
    } finally {
      log.mockRestore();
      error.mockRestore();
      vi.doUnmock("../lib/pandoc-md");
    }
  });
});
