import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { vitestPreset } from "../../presets/vitest.mjs";
import { packageRoot } from "../lib/runner.ts";

/**
 * Pandoc owns `*.md` — it formats and checks markdown byte-for-byte —
 * so the preset must keep markdown out of biome's scope: biome 2.6's
 * markdown formatter disagrees with pandoc's canonical GFM, and without
 * the exclusions `lint` fails on files `format` just rewrote.
 */
describe("presets/biome.preset.json", () => {
  const preset = JSON.parse(
    readFileSync(join(packageRoot(), "presets", "biome.preset.json"), "utf8"),
  ) as {
    formatter?: { includes?: string[] };
    linter?: { includes?: string[] };
  };
  const manifest = JSON.parse(
    readFileSync(join(packageRoot(), "package.json"), "utf8"),
  ) as { dependencies?: Record<string, string> };

  it("excludes markdown from the formatter scope", () => {
    expect(preset.formatter?.includes).toContain("!**/*.md");
  });

  it("excludes markdown from the linter scope", () => {
    expect(preset.linter?.includes).toContain("!**/*.md");
  });

  /**
   * The bundled biome moves only through a reviewed ts-canon release: a
   * `^` range once floated fresh installs onto 2.6.x, whose restyled
   * output (markdown, YAML) broke consumers' lint.
   */
  it("pins biome to an exact version", () => {
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
