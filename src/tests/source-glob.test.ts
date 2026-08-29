import { symlinkSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { sourceGlob } from "../lib/source-glob";
import { withTempDir, writeFixture } from "./helpers";

describe("sourceGlob", () => {
  it("returns the whole tree when nothing dirty is present", () => {
    const [root, cleanup] = withTempDir();
    try {
      writeFixture(root, "src/a.ts", "const a = 1;\n");
      writeFixture(root, "src/nested/b.tsx", "const b = 2;\n");
      expect(sourceGlob(root)).toBe("{**/*.ts,**/*.tsx}");
    } finally {
      cleanup();
    }
  });

  it("scopes to clean children around node_modules", () => {
    const [root, cleanup] = withTempDir();
    try {
      writeFixture(root, "vitest.config.ts", "const config = 1;\n");
      writeFixture(root, "src/a.ts", "const a = 1;\n");
      writeFixture(root, "packages/demo/node_modules/lib/package.json", "{}\n");
      writeFixture(root, "packages/demo/src/tool.ts", "const tool = 1;\n");
      writeFixture(
        root,
        "node_modules/.pnpm/node_modules/.hoist-marker.json",
        "{}\n",
      );
      // Loose files in dirty directories are deliberately out of scope —
      // only `**`-anchored elements prune the tool's descent.
      expect(sourceGlob(root)).toBe(
        "{packages/demo/src/**/*.ts,packages/demo/src/**/*.tsx," +
          "src/**/*.ts,src/**/*.tsx}",
      );
    } finally {
      cleanup();
    }
  });

  it("never follows symlinks, in either direction", () => {
    const [outside, cleanupOutside] = withTempDir();
    const [root, cleanup] = withTempDir();
    try {
      writeFixture(outside, "evil.ts", "const boom = 1;\n");
      writeFixture(root, "src/a.ts", "const a = 1;\n");
      // A linked directory inside the tree, and a link back out of it —
      // both must be invisible to the glob.
      symlinkSync(outside, join(root, "linked"));
      symlinkSync(root, join(root, "src", "self"));
      expect(sourceGlob(root)).toBe("{**/*.ts,**/*.tsx}");
      expect(sourceGlob(root)?.includes("linked")).toBe(false);
      expect(sourceGlob(root)?.includes("self")).toBe(false);
    } finally {
      cleanup();
      cleanupOutside();
    }
  });

  it("ignores hidden directories", () => {
    const [root, cleanup] = withTempDir();
    try {
      writeFixture(root, "src/a.ts", "const a = 1;\n");
      writeFixture(root, ".git/hooks/x.ts", "const x = 1;\n");
      writeFixture(root, ".cache/y.ts", "const y = 1;\n");
      expect(sourceGlob(root)).toBe("{**/*.ts,**/*.tsx}");
    } finally {
      cleanup();
    }
  });

  it("returns undefined when no clean root exists", () => {
    const [root, cleanup] = withTempDir();
    try {
      writeFixture(root, "package.json", "{}\n");
      writeFixture(root, "node_modules/.pnpm/x/y.js", "\n");
      expect(sourceGlob(root)).toBeUndefined();
    } finally {
      cleanup();
    }
  });

  it("walks a single scoped package argument", () => {
    const [root, cleanup] = withTempDir();
    try {
      writeFixture(root, "src/index.ts", "const a = 1;\n");
      writeFixture(root, "packages/glv/node_modules/lib/package.json", "{}\n");
      writeFixture(root, "packages/glv/src/main.ts", "const b = 2;\n");
      writeFixture(root, "packages/glv/karma.conf.ts", "const c = 3;\n");
      const glv = join(root, "packages", "glv");
      // The argument directory is the walk base; it is dirty (its own
      // node_modules), so only its clean children become roots and its
      // direct files stay out of the codemod's scope.
      expect(sourceGlob(glv)).toBe("{src/**/*.ts,src/**/*.tsx}");
    } finally {
      cleanup();
    }
  });
});
