import { describe, expect, it } from "vitest";
import type { RuleOverride } from "../lib/rules-config.ts";
import { loadRulesConfig } from "../lib/rules-config.ts";
import { withTempDir, writeFixture } from "./helpers.ts";

const KNOWN = ["no-inline-export", "no-unsafe-cast"] as const;

/** `loadRulesConfig` against a temp dir holding the given config. */
const loadWith = (content: string): Record<string, RuleOverride> => {
  const [root, cleanup] = withTempDir();
  writeFixture(root, "ts-canon.json", content);
  try {
    return loadRulesConfig(root, KNOWN);
  } finally {
    cleanup();
  }
};

describe("loadRulesConfig", () => {
  it("configures nothing without a ts-canon.json", () => {
    const [root, cleanup] = withTempDir();
    try {
      expect(loadRulesConfig(root, KNOWN)).toEqual({});
    } finally {
      cleanup();
    }
  });

  it("configures nothing for an empty object", () => {
    expect(loadWith("{}")).toEqual({});
  });

  it("parses off and glob overrides per rule", () => {
    expect(
      loadWith(`{
  "rules": {
    "no-inline-export": "off",
    "no-unsafe-cast": {
      "files": ["src/**", "scripts/**"],
      "ignores": ["**/tests/**"]
    }
  }
}`),
    ).toEqual({
      "no-inline-export": "off",
      "no-unsafe-cast": {
        files: ["src/**", "scripts/**"],
        ignores: ["**/tests/**"],
      },
    });
  });

  it("accepts an override object with only one glob list", () => {
    expect(
      loadWith('{ "rules": { "no-unsafe-cast": { "ignores": ["gen/**"] } } }'),
    ).toEqual({ "no-unsafe-cast": { ignores: ["gen/**"] } });
  });

  it("rejects invalid JSON with the file named", () => {
    expect(() => loadWith("{ nope")).toThrow(/ts-canon\.json: invalid JSON/);
  });

  it("rejects a non-object root", () => {
    expect(() => loadWith("[]")).toThrow(/expected an object/);
    expect(() => loadWith('"nope"')).toThrow(/expected an object/);
  });

  it("rejects unknown top-level fields", () => {
    expect(() => loadWith('{ "strict": true }')).toThrow(
      /unknown field "strict"/,
    );
  });

  it("rejects a non-object rules map", () => {
    expect(() => loadWith('{ "rules": [] }')).toThrow(
      /"rules" must be an object/,
    );
  });

  it("rejects rule ids that match no shipped rule", () => {
    expect(() => loadWith('{ "rules": { "no-async": "off" } }')).toThrow(
      /rules\.no-async matches no shipped rule \(known: .*\)/,
    );
  });

  it("rejects a malformed override value", () => {
    expect(() => loadWith('{ "rules": { "no-inline-export": 3 } }')).toThrow(
      /rules\.no-inline-export: expected "off" or \{ files\?, ignores\? \}/,
    );
  });

  it("rejects unknown override fields", () => {
    expect(() =>
      loadWith('{ "rules": { "no-inline-export": { "severity": 2 } } }'),
    ).toThrow(/rules\.no-inline-export: unknown field "severity"/);
  });

  it("rejects glob lists that are not string arrays", () => {
    expect(() =>
      loadWith('{ "rules": { "no-unsafe-cast": { "files": "src" } } }'),
    ).toThrow(/rules\.no-unsafe-cast\.files: expected an array/);
    expect(() =>
      loadWith('{ "rules": { "no-unsafe-cast": { "ignores": [1] } } }'),
    ).toThrow(/rules\.no-unsafe-cast\.ignores: globs must be non-empty/);
  });
});
