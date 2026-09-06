import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { packageRoot } from "../lib/runner";

const WILDCARD_DIRS = ["presets", "rules"];

/** Every string target in the `exports` map, condition branches included. */
const collectTargets = (value: unknown, acc: string[] = []): string[] => {
  if (typeof value === "string") {
    acc.push(value);
    return acc;
  }
  if (value !== null && typeof value === "object")
    for (const nested of Object.values(value)) collectTargets(nested, acc);
  return acc;
};

/**
 * Node cannot type-strip under `node_modules`, so a `.ts` target is
 * unloadable from a real install. `.d.ts` is types-only, never executed.
 */
const isUnloadableSource = (file: string): boolean =>
  /\.tsx?$/.test(file) && !file.endsWith(".d.ts");

const exportsMap = (): unknown => {
  const manifest = join(packageRoot(), "package.json");
  const parsed = JSON.parse(readFileSync(manifest, "utf8")) as {
    exports: unknown;
  };
  return parsed.exports;
};

describe("package exports map", () => {
  const targets = collectTargets(exportsMap());

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
