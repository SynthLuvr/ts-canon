import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import { runFormat } from "../bin/format";
import { resolvePaths, runLint } from "../bin/lint";
import { pandocVersion } from "../lib/pandoc-md";
import { packageRoot, resolveBin, runCommand } from "../lib/runner";
import { withTempDir, writeFixture } from "./helpers";

const pandocAvailable = (): boolean => pandocVersion() !== undefined;

/**
 * Source of the fixture mini repo: a function declaration (convert-to-arrow
 * + no-function-declaration), unbraced-ready single-statement bodies for
 * every strip-braces rule, a `var` (biome useConst), 4-space indentation
 * (biome format), and inline export style already separated. Markdown is
 * generated drifted so pandoc flags it.
 */
const FIXTURE_SOURCE = `function greet(name: string): string {
    return \`hello \${name}\`;
}

let total = 0;

const add = (n: number): number => {
    total += n;
    return total;
};

if (total > 0) {
    console.log(add(1));
}

while (total > 900) {
    total -= 1;
}

for (let i = 0; i < 3; i++) {
    total += i;
}

for (const n of [1, 2]) {
    console.log(n);
}

for (const key in { a: 1 }) {
    console.log(key);
}

do {
    total += 1;
} while (total < 0);

export { greet };
`;

const buildMiniRepo = (): [string, () => void] => {
  const [root, cleanup] = withTempDir();
  writeFixture(
    root,
    "package.json",
    `${JSON.stringify(
      { name: "mini-repo", private: true, type: "module" },
      null,
      2,
    )}\n`,
  );
  // The preset is referenced by relative path so the fixture needs no
  // node_modules install of ts-toolkit; repos use the bare specifier.
  const preset = relative(
    root,
    join(packageRoot(), "presets", "biome.preset.json"),
  );
  writeFixture(
    root,
    "biome.json",
    `${JSON.stringify(
      { extends: [preset.replaceAll("\\\\", "/")], vcs: { enabled: false } },
      null,
      2,
    )}\n`,
  );
  writeFixture(root, "src/index.ts", FIXTURE_SOURCE);
  writeFixture(root, "README.md", "#   Mini repo\n\nSome  text   \n");
  const tsconfigBase = relative(
    root,
    join(packageRoot(), "presets", "tsconfig.base.json"),
  );
  writeFixture(
    root,
    "tsconfig.json",
    `${JSON.stringify(
      { extends: tsconfigBase.replaceAll("\\\\", "/") },
      null,
      2,
    )}\n`,
  );
  return [root, cleanup];
};

describe("resolvePaths", () => {
  it("defaults to . and keeps explicit paths", () => {
    expect(resolvePaths()).toEqual(["."]);
    expect(resolvePaths([])).toEqual(["."]);
    expect(resolvePaths(["src", "lib"])).toEqual(["src", "lib"]);
  });
});

describe("ast-grep lint rules (package-relative --rule)", () => {
  it.each([
    [
      "no-file-comment",
      "// leading file comment\nconst a = 1;\nexport { a };\n",
    ],
    ["no-function-declaration", "function foo(): void {}\nexport { foo };\n"],
    ["no-inline-export", "export const b = 2;\n"],
  ])(
    "%s fails on a violating file",
    async (id, source) => {
      const [dir, cleanup] = withTempDir();
      try {
        const bad = writeFixture(dir, "bad.ts", source);
        const code = await runCommand(
          resolveBin("@ast-grep/cli", "ast-grep"),
          [
            "scan",
            "--rule",
            join(packageRoot(), "rules", `${id}.yml`),
            "--error",
            id,
            "--globs",
            "!**/*.d.ts",
            bad,
          ],
          { cwd: dir },
        );
        expect(code).toBe(1);
      } finally {
        cleanup();
      }
    },
    60_000,
  );
});

describe("fixture mini repo", () => {
  it.skipIf(!pandocAvailable())(
    "lint fails, format fixes, lint passes",
    async () => {
      const [root, cleanup] = buildMiniRepo();
      try {
        // Failing lint with --fast (audit + jscpd skipped; no lockfile).
        expect(await runLint({ paths: [root], fast: true })).not.toBe(0);

        // Formatting rewrites everything in canonical order.
        expect(await runFormat({ paths: [root] })).toBe(0);

        const formatted = readFileSync(join(root, "src", "index.ts"), "utf8");
        expect(formatted).toContain("const greet");
        expect(formatted).not.toContain("function greet");
        expect(formatted).not.toContain("    return");
        expect(formatted).toMatch(/if \(total > 0\) console\.log\(add\(1\)\);/);
        expect(formatted).toMatch(/while \(total > 900\) total -= 1;/);
        expect(formatted).toMatch(
          /for \(let i = 0; i < 3; i\+\+\) total \+= i;/,
        );
        expect(formatted).toMatch(
          /for \(const n of \[1, 2\]\) console\.log\(n\);/,
        );
        expect(formatted).toMatch(
          /for \(const key in \{ a: 1 \}\) console\.log\(key\);/,
        );
        expect(formatted).toMatch(/do total \+= 1;\nwhile \(total < 0\);/);
        expect(readFileSync(join(root, "README.md"), "utf8")).toBe(
          "# Mini repo\n\nSome text\n",
        );

        // Full lint (jscpd included; peer-deps/audit skip without a lockfile).
        expect(await runLint({ paths: [root] })).toBe(0);
      } finally {
        cleanup();
      }
    },
    600_000,
  );
});
