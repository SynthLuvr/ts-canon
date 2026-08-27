import { defineConfig } from "vitest/config";

/**
 * The canonical vitest config: tests under `src/tests`, v8 coverage over
 * `src` with an 80% threshold. Takes an optional override object merged
 * into the `test` section for repo-specific needs.
 */
declare const vitestPreset: (
  overrides?: Record<string, unknown>,
) => ReturnType<typeof defineConfig>;

export { vitestPreset };
