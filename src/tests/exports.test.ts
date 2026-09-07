import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { packageRoot } from "../lib/runner";

const WILDCARD_DIRS = ["presets", "rules"];

/** Every string target in the `exports` map, condition branches included. */
const collectTargets = (value: unknown): string[] => {
  if (typeof value === "string") return [value];
  if (value === null || typeof value !== "object") return [];
  return Object.values(value).flatMap(collectTargets);
};

/**
 * Node cannot type-strip under `node_modules`, so a `.ts` target is
 * unloadable from a real install. `.d.ts` is types-only, never executed.
 */
const isUnloadableSource = (file: string): boolean =>
  /\.tsx?$/.test(file) && !file.endsWith(".d.ts");

describe("package exports map", () => {
  const manifest = JSON.parse(
    readFileSync(join(packageRoot(), "package.json"), "utf8"),
  ) as { exports: unknown };
  const targets = collectTargets(manifest.exports);

  it("never points a subpath at TypeScript source", () => {
    expect(targets.filter(isUnloadableSource)).toEqual([]);
  });

  it("resolves every concrete target to a file that exists", () => {
    for (const target of targets.filter((file) => !file.includes("*")))
      expect(existsSync(join(packageRoot(), target))).toBe(true);
  });

  it("keeps the wildcard directories free of TypeScript source", () => {
    for (const dir of WILDCARD_DIRS) {
      const entries = readdirSync(join(packageRoot(), dir));
      expect(entries.filter(isUnloadableSource)).toEqual([]);
    }
  });
});
