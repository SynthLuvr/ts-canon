import { defineConfig } from "vitest/config";

/**
 * The canonical vitest config: tests under `src/tests`, v8 coverage over
 * `src` with an 80% threshold. Takes an optional override object merged
 * into the `test` section for repo-specific needs.
 */
const vitestPreset = (overrides = {}) =>
  defineConfig({
    test: {
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
      ...overrides,
    },
  });

export { vitestPreset };
