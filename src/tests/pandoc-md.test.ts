import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  findMarkdown,
  ignoreMatcher,
  pandocFormat,
  pandocVersion,
  runPandoc,
} from "../lib/pandoc-md.ts";
import { withTempDir, writeFixture } from "./helpers.ts";

const pandocAvailable = (): boolean => pandocVersion() !== undefined;

describe("ignoreMatcher", () => {
  const matches = (globs: readonly string[], path: string): boolean =>
    ignoreMatcher(globs)(path);

  it("excludes nothing for an empty glob list", () => {
    expect(matches([], "CHANGELOG.md")).toBe(false);
  });

  it("matches a slash-free glob by basename at any depth", () => {
    expect(matches(["CHANGELOG.md"], "CHANGELOG.md")).toBe(true);
    expect(matches(["CHANGELOG.md"], "docs/CHANGELOG.md")).toBe(true);
    expect(matches(["CHANGELOG.md"], "docs/notes.md")).toBe(false);
  });

  it("anchors a glob containing a slash at the walk root", () => {
    expect(matches(["docs/CHANGELOG.md"], "docs/CHANGELOG.md")).toBe(true);
    expect(matches(["docs/CHANGELOG.md"], "CHANGELOG.md")).toBe(false);
    expect(matches(["docs/CHANGELOG.md"], "pkg/docs/CHANGELOG.md")).toBe(false);
  });

  it("keeps a single star inside one segment", () => {
    expect(matches(["docs/*.md"], "docs/a.md")).toBe(true);
    expect(matches(["docs/*.md"], "docs/sub/a.md")).toBe(false);
    expect(matches(["docs/*.md"], "a.md")).toBe(false);
  });

  it("spans segments with a trailing **", () => {
    expect(matches(["docs/**"], "docs/a.md")).toBe(true);
    expect(matches(["docs/**"], "docs/sub/a.md")).toBe(true);
    expect(matches(["docs/**"], "docs")).toBe(false);
    expect(matches(["docs/**"], "other/a.md")).toBe(false);
  });

  it("spans zero or more segments with an inner **", () => {
    expect(matches(["docs/**/CHANGELOG.md"], "docs/CHANGELOG.md")).toBe(true);
    expect(matches(["docs/**/CHANGELOG.md"], "docs/a/b/CHANGELOG.md")).toBe(
      true,
    );
    expect(matches(["docs/**/CHANGELOG.md"], "CHANGELOG.md")).toBe(false);
  });

  it("matches at any depth with a leading **/", () => {
    expect(matches(["**/CHANGELOG.md"], "CHANGELOG.md")).toBe(true);
    expect(matches(["**/CHANGELOG.md"], "a/b/CHANGELOG.md")).toBe(true);
    expect(matches(["**/CHANGELOG.md"], "a/b/notes.md")).toBe(false);
  });

  it("covers a directory and everything beneath it", () => {
    expect(matches(["docs/generated/"], "docs/generated")).toBe(true);
    expect(matches(["docs/generated/"], "docs/generated/a.md")).toBe(true);
    expect(matches(["docs/generated/"], "docs/generated/sub/a.md")).toBe(true);
    expect(matches(["docs/generated/"], "docs/generatedx.md")).toBe(false);
  });

  it("covers a slash-free directory glob at any depth", () => {
    expect(matches(["generated/"], "generated")).toBe(true);
    expect(matches(["generated/"], "a/b/generated/x.md")).toBe(true);
    expect(matches(["generated/"], "generated.md")).toBe(false);
  });

  it("matches one non-separator character with ?", () => {
    expect(matches(["note?.md"], "note1.md")).toBe(true);
    expect(matches(["note?.md"], "note12.md")).toBe(false);
    expect(matches(["note?.md"], "a/noteX.md")).toBe(true);
  });

  it("keeps regex metacharacters literal", () => {
    expect(matches(["v1.2/notes.md"], "v1.2/notes.md")).toBe(true);
    expect(matches(["v1.2/notes.md"], "v1x2/notes.md")).toBe(false);
  });

  it("escapes the character after a backslash", () => {
    expect(matches(["literal\\*.md"], "literal*.md")).toBe(true);
    expect(matches(["literal\\*.md"], "literalX.md")).toBe(false);
  });

  it("excludes when any of several globs matches", () => {
    expect(matches(["CHANGELOG.md", "docs/**"], "docs/a.md")).toBe(true);
    expect(matches(["CHANGELOG.md", "docs/**"], "CHANGELOG.md")).toBe(true);
    expect(matches(["CHANGELOG.md", "docs/**"], "README.md")).toBe(false);
  });

  it("is case-sensitive", () => {
    expect(matches(["CHANGELOG.md"], "changelog.md")).toBe(false);
  });
});

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

  it("skips ignored files and prunes ignored directories", () => {
    const [dir, cleanup] = withTempDir();
    try {
      writeFixture(dir, "keep.md", "keep");
      writeFixture(dir, "skip.md", "skip");
      writeFixture(dir, "docs/keep.md", "keep");
      writeFixture(dir, "docs/generated/skip.md", "skip");
      const found = findMarkdown(
        dir,
        ignoreMatcher(["skip.md", "docs/generated"]),
      );
      expect(found).toEqual([
        join(dir, "docs", "keep.md"),
        join(dir, "keep.md"),
      ]);
    } finally {
      cleanup();
    }
  });
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

  it.skipIf(!pandocAvailable())(
    "checks clean when every drifted file is ignored",
    () => {
      const [dir, cleanup] = withTempDir();
      try {
        writeFixture(dir, "drift.md", "#   Drifted heading\n");
        const clean = writeFixture(dir, "clean.md", "# Clean\n\ntext\n");
        writeFileSync(clean, pandocFormat(dir, clean));
        expect(runPandoc(dir, "check", ["drift.md"])).toBe(0);
      } finally {
        cleanup();
      }
    },
  );

  it.skipIf(!pandocAvailable())(
    "leaves ignored files untouched in write mode",
    () => {
      const [dir, cleanup] = withTempDir();
      try {
        const file = writeFixture(dir, "drift.md", "#   Drifted heading\n");
        expect(runPandoc(dir, "write", ["drift.md"])).toBe(0);
        expect(readFileSync(file, "utf8")).toBe("#   Drifted heading\n");
      } finally {
        cleanup();
      }
    },
  );
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
