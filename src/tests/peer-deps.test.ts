import { chmodSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { pnpmCommand, pnpmPeersCheck, pnpmVersion } from "../lib/peer-deps";
import { withTempDir, writeFixture } from "./helpers";

/** Runs `body` with npm_execpath forced to `value`, restoring the original. */
const withNpmExecpath = (value: string | undefined, body: () => void): void => {
  const saved = process.env.npm_execpath;
  if (value === undefined) delete process.env.npm_execpath;
  else process.env.npm_execpath = value;
  try {
    body();
  } finally {
    if (saved === undefined) delete process.env.npm_execpath;
    else process.env.npm_execpath = saved;
  }
};

describe("pnpmPeersCheck", () => {
  it("fails when npm_execpath is unset", () => {
    withNpmExecpath(undefined, () => {
      const [dir, cleanup] = withTempDir();
      try {
        expect(pnpmPeersCheck(dir)).toBe(1);
      } finally {
        cleanup();
      }
    });
  });

  it("passes when the spawned pnpm exits 0", () => {
    const [dir, cleanup] = withTempDir();
    try {
      const fake = writeFixture(dir, "fake-pnpm.mjs", "process.exit(0);\n");
      withNpmExecpath(fake, () => {
        expect(pnpmPeersCheck(dir)).toBe(0);
      });
    } finally {
      cleanup();
    }
  });

  it("fails with guidance when the spawned pnpm reports conflicts", () => {
    const [dir, cleanup] = withTempDir();
    try {
      const fake = writeFixture(dir, "fake-pnpm.mjs", "process.exit(1);\n");
      withNpmExecpath(fake, () => {
        expect(pnpmPeersCheck(dir)).toBe(1);
      });
    } finally {
      cleanup();
    }
  });
});

describe("pnpmCommand", () => {
  it("returns the spawned exit code", () => {
    const [dir, cleanup] = withTempDir();
    try {
      const fake = writeFixture(
        dir,
        "fake-pnpm.mjs",
        'process.exit(process.argv.includes("fail") ? 5 : 0);\n',
      );
      withNpmExecpath(fake, () => {
        expect(pnpmCommand(dir, ["audit", "--prod"])).toBe(0);
        expect(pnpmCommand(dir, ["audit", "fail"])).toBe(5);
      });
    } finally {
      cleanup();
    }
  });

  it("fails when npm_execpath is unset", () => {
    withNpmExecpath(undefined, () => {
      expect(pnpmCommand(process.cwd(), ["--version"])).toBe(1);
    });
  });

  it("spawns native (non-JS) pnpm entries directly", () => {
    const [dir, cleanup] = withTempDir();
    try {
      const exe = join(
        dir,
        process.platform === "win32" ? "fake-pnpm.exe" : "fake-pnpm",
      );
      copyFileSync(process.execPath, exe);
      if (process.platform !== "win32") chmodSync(exe, 0o755);
      withNpmExecpath(exe, () => {
        expect(pnpmCommand(dir, ["--version"])).toBe(0);
      });
    } finally {
      cleanup();
    }
  });

  it("throws when the pnpm entry cannot be spawned", () => {
    const [dir, cleanup] = withTempDir();
    try {
      withNpmExecpath(join(dir, "missing-pnpm-entry"), () => {
        expect(() => pnpmCommand(dir, ["--version"])).toThrow();
      });
    } finally {
      cleanup();
    }
  });
});

describe("pnpmVersion", () => {
  it("reports a version when run under pnpm", () => {
    if (process.env.npm_execpath === undefined) return;
    expect(pnpmVersion()).toMatch(/^\d+\./);
  });

  it("returns undefined when npm_execpath is unset", () => {
    withNpmExecpath(undefined, () => {
      expect(pnpmVersion()).toBeUndefined();
    });
  });

  it("returns undefined when the entry exits nonzero", () => {
    const [dir, cleanup] = withTempDir();
    try {
      const fake = writeFixture(dir, "fake-pnpm.mjs", "process.exit(1);\n");
      withNpmExecpath(fake, () => {
        expect(pnpmVersion()).toBeUndefined();
      });
    } finally {
      cleanup();
    }
  });

  it("returns undefined when the entry cannot be spawned", () => {
    const [dir, cleanup] = withTempDir();
    try {
      withNpmExecpath(join(dir, "missing-pnpm-entry"), () => {
        expect(pnpmVersion()).toBeUndefined();
      });
    } finally {
      cleanup();
    }
  });
});
