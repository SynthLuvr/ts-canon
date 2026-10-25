import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { vitestPreset } from "../../presets/vitest.mjs";

/**
 * The shipped biome preset must never hand markdown to biome: the
 * pandoc step owns `*.md` (`runPandoc` formats and checks it
 * byte-for-byte). Biome 2.6 introduced a markdown formatter whose
 * canonical output differs from pandoc's GFM (fence spacing, emphasis
 * markers, table padding), so without these exclusions `lint` and
 * `format` fight over every markdown file — format "passes" and lint
 * goes red again immediately. The exclusion keeps the two formatters
 * out of each other's way for any biome version.
 */
describe("presets/biome.preset.json", () => {
  const preset = JSON.parse(
    readFileSync(
      join(import.meta.dirname, "..", "..", "presets", "biome.preset.json"),
      "utf8",
    ),
  ) as {
    formatter?: { includes?: string[] };
    linter?: { includes?: string[] };
  };

  it("excludes markdown from the formatter scope", () => {
    expect(preset.formatter?.includes).toContain("!**/*.md");
  });

  it("excludes markdown from the linter scope", () => {
    expect(preset.linter?.includes).toContain("!**/*.md");
  });

  /**
   * Regression guard for the biome 2.6.3 incident: an unbounded `^`
   * range floated fresh installs into a biome minor that changed
   * canonical formatter output (markdown added, YAML restyled) and
   * broke every consumer's lint. The package exists to kill tool
   * drift, so the bundled biome moves only through a reviewed
   * ts-canon release — the specifier must be exact.
   */
  it("pins biome to an exact version", () => {
    const manifest = JSON.parse(
      readFileSync(
        join(import.meta.dirname, "..", "..", "package.json"),
        "utf8",
      ),
    ) as { dependencies?: Record<string, string> };
    expect(manifest.dependencies?.["@biomejs/biome"]).toMatch(/^\d/);
  });
});

/**
 * `presets/vitest.mjs` ships compiled (with `vitest.d.mts` types): node
 * refuses to type-strip `.ts` under `node_modules`
 * (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`), so a `.ts` factory is
 * unusable from real installs. This repo still exercises the compiled
 * artifact on every `pnpm test` — the root `vitest.config.ts` imports it
 * through the `ts-canon/presets/vitest` exports entry.
 */
describe("presets/vitest", () => {
  it("builds the canonical vitest config", () => {
    const config = vitestPreset() as { test?: Record<string, unknown> };
    expect(config.test).toMatchObject({
      include: ["src/tests/**/*.test.ts"],
      coverage: {
        provider: "v8",
        include: ["src/**/*.ts"],
        exclude: ["src/tests/**"],
        thresholds: {
          lines: 80,
          functions: 80,
          statements: 80,
          branches: 80,
        },
      },
    });
  });

  it("merges overrides into the test section", () => {
    const config = vitestPreset({ environment: "node" }) as {
      test?: { environment?: string; include?: string[] };
    };
    expect(config.test?.environment).toBe("node");
    expect(config.test?.include).toEqual(["src/tests/**/*.test.ts"]);
  });
});
