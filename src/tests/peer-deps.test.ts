import { describe, expect, it } from "vitest";

import { pnpmCommand, pnpmPeersCheck, pnpmVersion } from "../lib/peer-deps";
import { withTempDir, writeFixture } from "./helpers";

describe("pnpmPeersCheck", () => {
  it("fails when npm_execpath is unset", () => {
    const saved = process.env.npm_execpath;
    delete process.env.npm_execpath;
    try {
      const [dir, cleanup] = withTempDir();
      try {
        expect(pnpmPeersCheck(dir)).toBe(1);
      } finally {
        cleanup();
      }
    } finally {
      if (saved !== undefined) process.env.npm_execpath = saved;
    }
  });

  it("passes when the spawned pnpm exits 0", () => {
    const [dir, cleanup] = withTempDir();
    const saved = process.env.npm_execpath;
    try {
      const fake = writeFixture(dir, "fake-pnpm.mjs", "process.exit(0);\n");
      process.env.npm_execpath = fake;
      expect(pnpmPeersCheck(dir)).toBe(0);
    } finally {
      if (saved !== undefined) process.env.npm_execpath = saved;
      else delete process.env.npm_execpath;
      cleanup();
    }
  });

  it("fails with guidance when the spawned pnpm reports conflicts", () => {
    const [dir, cleanup] = withTempDir();
    const saved = process.env.npm_execpath;
    try {
      const fake = writeFixture(dir, "fake-pnpm.mjs", "process.exit(1);\n");
      process.env.npm_execpath = fake;
      expect(pnpmPeersCheck(dir)).toBe(1);
    } finally {
      if (saved !== undefined) process.env.npm_execpath = saved;
      else delete process.env.npm_execpath;
      cleanup();
    }
  });
});

describe("pnpmCommand", () => {
  it("returns the spawned exit code", () => {
    const [dir, cleanup] = withTempDir();
    const saved = process.env.npm_execpath;
    try {
      const fake = writeFixture(
        dir,
        "fake-pnpm.mjs",
        'process.exit(process.argv.includes("fail") ? 5 : 0);\n',
      );
      process.env.npm_execpath = fake;
      expect(pnpmCommand(dir, ["audit", "--prod"])).toBe(0);
      expect(pnpmCommand(dir, ["audit", "fail"])).toBe(5);
    } finally {
      if (saved !== undefined) process.env.npm_execpath = saved;
      else delete process.env.npm_execpath;
      cleanup();
    }
  });

  it("fails when npm_execpath is unset", () => {
    const saved = process.env.npm_execpath;
    delete process.env.npm_execpath;
    try {
      expect(pnpmCommand(process.cwd(), ["--version"])).toBe(1);
    } finally {
      if (saved !== undefined) process.env.npm_execpath = saved;
    }
  });
});

describe("pnpmVersion", () => {
  it("reports a version when run under pnpm", () => {
    if (process.env.npm_execpath === undefined) return;
    expect(pnpmVersion()).toMatch(/^\d+\./);
  });

  it("returns undefined when npm_execpath is unset", () => {
    const saved = process.env.npm_execpath;
    delete process.env.npm_execpath;
    try {
      expect(pnpmVersion()).toBeUndefined();
    } finally {
      if (saved !== undefined) process.env.npm_execpath = saved;
    }
  });
});
