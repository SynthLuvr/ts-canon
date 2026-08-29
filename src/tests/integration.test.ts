import { readFileSync, symlinkSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import { runFormat } from "../bin/format";
import { resolvePaths, runLint } from "../bin/lint";
import { pandocVersion } from "../lib/pandoc-md";
import { packageRoot, runAstGrep } from "../lib/runner";
import { withTempDir, writeFixture } from "./helpers";

const pandocAvailable = (): boolean => pandocVersion() !== undefined;

/**
 * Source of the fixture mini repo: a function declaration (convert-to-arrow
 * + no-function-declaration), unbraced-ready single-statement bodies for
 * every strip-braces rule, a `var` (biome useConst), 4-space indentation
 * (biome format), and inline export style already separated. Markdown is
 * generated drifted so pandoc flags it. The `view.tsx` fixture mirrors
 * the same violations as JSX, so the Tsx twin in each rule file
 * (ast-grep matches a language's own extensions only) and the .tsx half
 * of every format step are exercised.
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

const FIXTURE_TSX_SOURCE = `function Title({ name }: { name: string }) {
    return <h1>{name}</h1>;
}

const ready = (ok: boolean): boolean => ok;

if (ready(true)) {
    console.log(<Title name="done" />);
}

export { Title };
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
  // node_modules install of ts-canon; repos use the bare specifier.
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
  writeFixture(root, "src/view.tsx", FIXTURE_TSX_SOURCE);
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
  // One violating source per rule, run against both file extensions. The
  // .tsx variants carry a JSX element so a match proves the file really
  // parsed as Tsx: ast-grep matches a language's own extensions only, so
  // a lone `language: TypeScript` document would never fire on `bad.tsx`.
  const RULE_VIOLATIONS = [
    [
      "no-file-comment",
      "// leading file comment\nconst a = 1;\nexport { a };\n",
    ],
    ["no-function-declaration", "function foo(): void {}\nexport { foo };\n"],
    ["no-inline-export", "export const b = 2;\n"],
  ] as const;

  const withJsxElement = (source: string): string =>
    `${source}const el = <div className="x">done</div>;\nexport { el };\n`;

  const cases = RULE_VIOLATIONS.flatMap(([id, source]) => [
    [id, "bad.ts", source] as const,
    [id, "bad.tsx", withJsxElement(source)] as const,
  ]);

  it.each(cases)(
    "%s fails on a violating %s",
    async (id, file, source) => {
      const [dir, cleanup] = withTempDir();
      try {
        const bad = writeFixture(dir, file, source);
        const code = await runAstGrep(id, [bad], dir, [
          "--error",
          id,
          "--globs",
          "!**/*.d.ts",
        ]);
        expect(code).toBe(1);
      } finally {
        cleanup();
      }
    },
    60_000,
  );

  it("strip-braces strips single-statement braces in a .tsx file", async () => {
    const [dir, cleanup] = withTempDir();
    try {
      const file = writeFixture(
        dir,
        "view.tsx",
        'const label = (ok: boolean): string => (ok ? "yes" : "no");\n\nif (label(true)) {\n  console.log(<b>{label(true)}</b>);\n}\n\nexport { label };\n',
      );
      const code = await runAstGrep("strip-braces", [file], dir, ["-U"]);
      expect(code).toBe(0);
      expect(readFileSync(file, "utf8")).toMatch(
        /if \(label\(true\)\)\n {2}console\.log\(<b>\{label\(true\)\}<\/b>\);/,
      );
    } finally {
      cleanup();
    }
  }, 60_000);
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

        const view = readFileSync(join(root, "src", "view.tsx"), "utf8");
        expect(view).not.toContain("function Title");
        expect(view).toContain(
          "const Title = ({ name }: { name: string }) => <h1>{name}</h1>;",
        );
        expect(view).toMatch(
          /if \(ready\(true\)\) console\.log\(<Title name="done" \/>\);/,
        );

        // Full lint (jscpd included; peer-deps/audit skip without a lockfile).
        expect(await runLint({ paths: [root] })).toBe(0);
      } finally {
        cleanup();
      }
    },
    600_000,
  );

  it.skipIf(!pandocAvailable())(
    "format survives pnpm workspace symlink cycles",
    async () => {
      const [root, cleanup] = buildMiniRepo();
      // A second tree outside the format target: with a bare `.` the
      // convert-to-arrow walk followed the `linked` symlink below and
      // rewrote files outside the target tree.
      const [outside, cleanupOutside] = withTempDir();
      try {
        writeFixture(
          outside,
          "evil.ts",
          "function boom(): void {\n  process.exit(1);\n}\n\nexport { boom };\n",
        );
        // pnpm-style layout: a hoisted workspace package under
        // node_modules/.pnpm whose node_modules links back to the root.
        writeFixture(
          root,
          "packages/demo/node_modules/mini-repo/package.json",
          "{}\n",
        );
        writeFixture(
          root,
          "packages/demo/src/tool.ts",
          "const tool = 1;\nexport { tool };\n",
        );
        writeFixture(
          root,
          "node_modules/.pnpm/node_modules/.hoist-marker.json",
          "{}\n",
        );
        // biome itself follows the `linked` symlink when scanning `.`, so
        // the fixture opts out — the canary below is about convert-to-arrow.
        const preset = relative(
          root,
          join(packageRoot(), "presets", "biome.preset.json"),
        );
        writeFixture(
          root,
          "biome.json",
          `${JSON.stringify(
            {
              extends: [preset.replaceAll("\\\\", "/")],
              vcs: { enabled: false },
              files: { includes: ["**", "!linked/**"] },
            },
            null,
            2,
          )}\n`,
        );
        symlinkSync(
          join(root, "packages", "demo"),
          join(root, "node_modules", ".pnpm", "node_modules", "demo"),
          "dir",
        );
        symlinkSync(
          root,
          join(root, "packages", "demo", "node_modules", "app"),
        );
        symlinkSync(outside, join(root, "linked"), "dir");

        expect(await runFormat({ paths: [root] })).toBe(0);

        // In-tree sources are converted…
        const formatted = readFileSync(join(root, "src", "index.ts"), "utf8");
        expect(formatted).toContain("const greet");
        expect(formatted).not.toContain("function greet");
        // …and nothing outside the source roots is touched.
        expect(readFileSync(join(outside, "evil.ts"), "utf8")).toBe(
          "function boom(): void {\n  process.exit(1);\n}\n\nexport { boom };\n",
        );
      } finally {
        cleanup();
        cleanupOutside();
      }
    },
    120_000,
  );
});
