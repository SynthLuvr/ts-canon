import { describe, expect, it } from "vitest";

import { vitestPreset } from "../../presets/vitest.mjs";

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
