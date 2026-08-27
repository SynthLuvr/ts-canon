import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { isRegistrySpec, runMigrate } from "../bin/migrate";
import { withTempDir, writeFixture } from "./helpers";

const LEGACY_PACKAGE_JSON = {
  name: "consumer",
  private: true,
  type: "module",
  scripts: {
    build: "tsc",
    "format:arrows": "convert-to-arrow .",
    "format:biome": "biome format --write .",
    "format:braces":
      "ast-grep scan --rule .ast-grep/rules/strip-braces.yml -U .",
    "format:check": "biome check --write .",
    "format:md": "tsx scripts/pandoc-md.mts --write",
    format: "npm-run-all format:arrows format:braces format:biome",
    "lint:biome": "biome check .",
    "lint:oxlint": "tsx scripts/oxlint.mts --deny-warnings .",
    "lint:exports":
      "ast-grep scan --rule .ast-grep/rules/no-inline-export.yml --error=no-inline-export .",
    "lint:md": "tsx scripts/pandoc-md.mts --check",
    "lint:audit": "pnpm audit --prod",
    "lint:duplicates":
      "jscpd src --format typescript --min-lines 3 --threshold 5",
    "lint:peer-deps": "tsx scripts/peer-deps.mts",
    test: "vitest run --coverage",
  },
  devDependencies: {
    "@ast-grep/cli": "^0.40.5",
    "@ast-grep/cli-linux-x64-gnu": "^0.40.5",
    "@biomejs/biome": "^1.9.4",
    "@types/node": "^26.2.0",
    "@vitest/coverage-v8": "^4.1.11",
    "convert-to-arrow": "^1.1.4",
    jscpd: "^5.0.16",
    "npm-run-all2": "^9.0.3",
    oxlint: "^0.16.12",
    "oxlint-tsgolint": "^0.23.0",
    tsx: "^4.23.12",
    typescript: "^5.6.3",
    vitest: "^4.1.11",
  },
};

const buildLegacyRepo = (): [string, () => void] => {
  const [root, cleanup] = withTempDir();
  writeFixture(root, "package.json", JSON.stringify(LEGACY_PACKAGE_JSON));
  writeFixture(root, "scripts/pandoc-md.mts", "// copy\n");
  writeFixture(root, "scripts/peer-deps.mts", "// copy\n");
  writeFixture(root, "scripts/oxlint.mts", "// copy\n");
  writeFixture(root, "scripts/keep.mts", "// unrelated\n");
  for (const rule of [
    "no-file-comment.yml",
    "no-function-declaration.yml",
    "no-inline-export.yml",
    "strip-braces.yml",
  ])
    writeFixture(root, `.ast-grep/rules/${rule}`, "id: rule\n");
  writeFixture(root, "biome.json", '{\n  "linter": { "enabled": true }\n}\n');
  return [root, cleanup];
};

describe("runMigrate", () => {
  it("rewrites scripts, devDependencies, and deletes the ported copies", () => {
    const [root, cleanup] = buildLegacyRepo();
    try {
      expect(runMigrate({ root })).toBe(0);

      const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
      expect(pkg.scripts.lint).toBe("ts-canon lint");
      expect(pkg.scripts.format).toBe("ts-canon format");
      expect(pkg.scripts.build).toBe("tsc");
      expect(pkg.scripts.test).toBe("vitest run --coverage");
      expect(
        Object.keys(pkg.scripts).filter((key) => key.includes(":")),
      ).toEqual([]);

      expect(pkg.devDependencies["ts-canon"]).toBe("^0");
      expect(pkg.devDependencies.typescript).toBe("^5.6.3");
      expect(pkg.devDependencies.vitest).toBe("^4.1.11");
      expect(pkg.devDependencies["@biomejs/biome"]).toBeUndefined();
      expect(pkg.devDependencies["@ast-grep/cli"]).toBeUndefined();
      expect(
        pkg.devDependencies["@ast-grep/cli-linux-x64-gnu"],
      ).toBeUndefined();
      expect(Object.keys(pkg.devDependencies)).toEqual(
        Object.keys(pkg.devDependencies).sort((a, b) => a.localeCompare(b)),
      );

      expect(existsSync(join(root, "scripts", "pandoc-md.mts"))).toBe(false);
      expect(existsSync(join(root, "scripts", "peer-deps.mts"))).toBe(false);
      expect(existsSync(join(root, "scripts", "oxlint.mts"))).toBe(false);
      expect(existsSync(join(root, "scripts", "keep.mts"))).toBe(true);
      expect(existsSync(join(root, ".ast-grep"))).toBe(false);

      const biome = JSON.parse(readFileSync(join(root, "biome.json"), "utf8"));
      expect(biome.extends).toEqual(["ts-canon/presets/biome.preset.json"]);
      expect(biome.linter).toEqual({ enabled: true });
    } finally {
      cleanup();
    }
  });

  it("respects a requested version range", () => {
    const [root, cleanup] = withTempDir();
    try {
      writeFixture(
        root,
        "package.json",
        JSON.stringify({ name: "x", scripts: {}, devDependencies: {} }),
      );
      expect(runMigrate({ root, version: "^0.1.0" })).toBe(0);
      const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
      expect(pkg.devDependencies["ts-canon"]).toBe("^0.1.0");
    } finally {
      cleanup();
    }
  });

  it("preserves an existing non-registry ts-canon spec", () => {
    const [root, cleanup] = withTempDir();
    try {
      const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
      try {
        writeFixture(
          root,
          "package.json",
          JSON.stringify({
            name: "x",
            scripts: {},
            devDependencies: {
              "ts-canon": "github:SynthLuvr/ts-canon#ef074c9",
              oxlint: "^1.0.0",
            },
          }),
        );
        expect(runMigrate({ root })).toBe(0);
        expect(log).toHaveBeenCalledWith(
          expect.stringContaining(
            "kept ts-canon github:SynthLuvr/ts-canon#ef074c9",
          ),
        );
      } finally {
        log.mockRestore();
      }

      const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
      expect(pkg.devDependencies["ts-canon"]).toBe(
        "github:SynthLuvr/ts-canon#ef074c9",
      );
      expect(pkg.devDependencies.oxlint).toBeUndefined();
    } finally {
      cleanup();
    }
  });

  it.each([
    ["git+ssh://git@github.com/SynthLuvr/ts-canon.git"],
    ["SynthLuvr/ts-canon#ef074c9"],
    ["link:."],
    ["file:../ts-canon"],
    ["workspace:^"],
  ])("preserves the non-registry spec %s", (spec) => {
    const [root, cleanup] = withTempDir();
    try {
      writeFixture(
        root,
        "package.json",
        JSON.stringify({
          name: "x",
          scripts: {},
          devDependencies: { "ts-canon": spec },
        }),
      );
      expect(runMigrate({ root })).toBe(0);
      const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
      expect(pkg.devDependencies["ts-canon"]).toBe(spec);
    } finally {
      cleanup();
    }
  });

  it("replaces an existing registry range with ^0", () => {
    const [root, cleanup] = withTempDir();
    try {
      writeFixture(
        root,
        "package.json",
        JSON.stringify({
          name: "x",
          scripts: {},
          devDependencies: { "ts-canon": "^0.0.3" },
        }),
      );
      expect(runMigrate({ root })).toBe(0);
      const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
      expect(pkg.devDependencies["ts-canon"]).toBe("^0");
    } finally {
      cleanup();
    }
  });

  it("an explicit version overrides even a non-registry spec", () => {
    const [root, cleanup] = withTempDir();
    try {
      writeFixture(
        root,
        "package.json",
        JSON.stringify({
          name: "x",
          scripts: {},
          devDependencies: { "ts-canon": "github:SynthLuvr/ts-canon#ef074c9" },
        }),
      );
      expect(runMigrate({ root, version: "^0.2.0" })).toBe(0);
      const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
      expect(pkg.devDependencies["ts-canon"]).toBe("^0.2.0");
    } finally {
      cleanup();
    }
  });

  it("dry-run reports a preserved spec without writing", () => {
    const [root, cleanup] = withTempDir();
    try {
      const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
      try {
        writeFixture(
          root,
          "package.json",
          JSON.stringify({
            name: "x",
            scripts: { "lint:biome": "biome check ." },
            devDependencies: {
              "ts-canon": "github:SynthLuvr/ts-canon#ef074c9",
            },
          }),
        );
        expect(runMigrate({ root, dryRun: true })).toBe(0);
        expect(log).toHaveBeenCalledWith(
          expect.stringContaining(
            "would keep ts-canon github:SynthLuvr/ts-canon#ef074c9",
          ),
        );
      } finally {
        log.mockRestore();
      }

      const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
      expect(pkg.scripts["lint:biome"]).toBe("biome check .");
    } finally {
      cleanup();
    }
  });

  it("prints a plan without writing in dry-run mode", () => {
    const [root, cleanup] = withTempDir();
    try {
      writeFixture(root, "package.json", JSON.stringify(LEGACY_PACKAGE_JSON));
      writeFixture(root, "scripts/oxlint.mts", "// copy\n");
      expect(runMigrate({ root, dryRun: true })).toBe(0);

      const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
      expect(pkg.scripts["lint:biome"]).toBeDefined();
      expect(pkg.devDependencies["@biomejs/biome"]).toBeDefined();
      expect(existsSync(join(root, "scripts", "oxlint.mts"))).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("fails when there is no package.json", () => {
    const [root, cleanup] = withTempDir();
    try {
      expect(runMigrate({ root })).toBe(1);
    } finally {
      cleanup();
    }
  });
});

describe("isRegistrySpec", () => {
  it("accepts registry ranges and dist-tags", () => {
    expect(isRegistrySpec("^0")).toBe(true);
    expect(isRegistrySpec("^0.1.0")).toBe(true);
    expect(isRegistrySpec("0.1.0")).toBe(true);
    expect(isRegistrySpec(">=1.0.0 <2.0.0")).toBe(true);
    expect(isRegistrySpec("1.x")).toBe(true);
    expect(isRegistrySpec("*")).toBe(true);
    expect(isRegistrySpec("latest")).toBe(true);
    expect(isRegistrySpec("npm:other-package@^1")).toBe(true);
  });

  it("rejects git, local, and workspace specs", () => {
    expect(isRegistrySpec("github:SynthLuvr/ts-canon#ef074c9")).toBe(false);
    expect(isRegistrySpec("SynthLuvr/ts-canon#ef074c9")).toBe(false);
    expect(
      isRegistrySpec("git+ssh://git@github.com/SynthLuvr/ts-canon.git"),
    ).toBe(false);
    expect(isRegistrySpec("git@github.com:SynthLuvr/ts-canon.git")).toBe(false);
    expect(isRegistrySpec("link:.")).toBe(false);
    expect(isRegistrySpec("file:../ts-canon")).toBe(false);
    expect(isRegistrySpec("workspace:*")).toBe(false);
  });
});
