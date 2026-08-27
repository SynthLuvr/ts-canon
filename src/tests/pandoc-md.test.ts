import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  findMarkdown,
  pandocFormat,
  pandocVersion,
  runPandoc,
} from "../lib/pandoc-md";
import { withTempDir, writeFixture } from "./helpers";

const pandocAvailable = (): boolean => pandocVersion() !== undefined;

describe("findMarkdown", () => {
  it("collects markdown files recursively, sorted", () => {
    const [dir, cleanup] = withTempDir();
    try {
      writeFixture(dir, "b.md", "b");
      writeFixture(dir, "sub/a.md", "a");
      writeFixture(dir, "not-markdown.txt", "nope");
      const found = findMarkdown(dir);
      expect(found).toEqual([join(dir, "b.md"), join(dir, "sub", "a.md")]);
    } finally {
      cleanup();
    }
  });

  it("skips node_modules and .git", () => {
    const [dir, cleanup] = withTempDir();
    try {
      writeFixture(dir, "keep.md", "keep");
      writeFixture(dir, "node_modules/pkg/skip.md", "skip");
      writeFixture(dir, ".git/skip.md", "skip");
      expect(findMarkdown(dir)).toEqual([join(dir, "keep.md")]);
    } finally {
      cleanup();
    }
  });

  it.skipIf(process.platform === "win32")(
    "skips symlinked directories (pnpm workspace cycles)",
    () => {
      const [dir, cleanup] = withTempDir();
      try {
        writeFixture(dir, "real/inner.md", "inner");
        writeFixture(dir, "keep.md", "keep");
        symlinkSync(join(dir, "real"), join(dir, "link"));
        expect(findMarkdown(dir)).toEqual([
          join(dir, "keep.md"),
          join(dir, "real", "inner.md"),
        ]);
      } finally {
        cleanup();
      }
    },
  );
});

describe("runPandoc", () => {
  it.skipIf(!pandocAvailable())(
    "checks drifted markdown with a non-zero code",
    () => {
      const [dir, cleanup] = withTempDir();
      try {
        writeFixture(dir, "drift.md", "#   Drifted heading\n");
        expect(runPandoc(dir, "check")).toBe(1);
      } finally {
        cleanup();
      }
    },
  );

  it.skipIf(!pandocAvailable())(
    "rewrites drifted markdown and then checks clean",
    () => {
      const [dir, cleanup] = withTempDir();
      try {
        const file = writeFixture(dir, "drift.md", "#   Drifted heading\n");
        expect(runPandoc(dir, "write")).toBe(0);
        expect(runPandoc(dir, "check")).toBe(0);
        expect(pandocFormat(dir, file)).not.toContain("#   ");
      } finally {
        cleanup();
      }
    },
  );

  it.skipIf(!pandocAvailable())(
    "passes canonical markdown byte-for-byte",
    () => {
      const [dir, cleanup] = withTempDir();
      try {
        writeFixture(dir, "clean.md", "# Clean\n\ntext\n");
        const once = pandocFormat(dir, join(dir, "clean.md"));
        writeFileSync(join(dir, "clean.md"), once);
        expect(runPandoc(dir, "check")).toBe(0);
      } finally {
        cleanup();
      }
    },
  );

  it("passes a directory without markdown", () => {
    const [dir, cleanup] = withTempDir();
    try {
      mkdirSync(join(dir, "empty-sub"));
      expect(runPandoc(dir, "check")).toBe(0);
    } finally {
      cleanup();
    }
  });
});

describe("missing pandoc", () => {
  it("fails fast with the install guidance", async () => {
    vi.resetModules();
    vi.doMock("node:child_process", async (importOriginal) => {
      const actual =
        await importOriginal<typeof import("node:child_process")>();
      const err = new Error("spawn pandoc ENOENT") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      return {
        ...actual,
        spawnSync: () => ({ error: err, status: null, stdout: "" }),
      };
    });
    const [dir, cleanup] = withTempDir();
    try {
      const { runPandoc: mocked } = await import("../lib/pandoc-md");
      writeFixture(dir, "any.md", "# Any\n");
      expect(mocked(dir, "check")).toBe(1);
    } finally {
      cleanup();
      vi.doUnmock("node:child_process");
    }
  });
});

describe("pandocVersion", () => {
  it.skipIf(!pandocAvailable())("returns a version string", () => {
    expect(pandocVersion()).toMatch(/^\d+\.\d+/);
  });
});
