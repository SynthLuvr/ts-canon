import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { runOxlint } from "../lib/oxlint";
import { runPandoc } from "../lib/pandoc-md";
import { pnpmCommand, pnpmPeersCheck } from "../lib/peer-deps";
import type { Step } from "../lib/runner";
import {
  packageRoot,
  resolveBin,
  runCommand,
  runSequence,
} from "../lib/runner";

/**
 * The ast-grep rules enforced by `ts-toolkit lint`, in the order the
 * canonical toolchain ran them. File name and rule id match.
 */
const LINT_RULES = [
  "no-inline-export",
  "no-function-declaration",
  "no-file-comment",
] as const;

type LintOptions = { paths?: string[]; fast?: boolean };

/**
 * Default path arguments to `.` when none are given (monorepos can pass
 * narrower paths).
 */
const resolvePaths = (paths?: string[]): string[] =>
  paths !== undefined && paths.length > 0 ? paths : ["."];

const astGrepRuleStep = (
  id: (typeof LINT_RULES)[number],
  paths: string[],
  root: string,
): Step => ({
  name: `ast-grep:${id}`,
  run: () =>
    runCommand(
      resolveBin("@ast-grep/cli", "ast-grep"),
      [
        "scan",
        "--rule",
        join(packageRoot(), "rules", `${id}.yml`),
        "--error",
        id,
        "--globs",
        "!**/*.d.ts",
        ...paths,
      ],
      { cwd: root },
    ),
});

/**
 * Runs every lint check from the canonical toolchain, in order, and fails
 * fast on the first non-zero step. `--fast` skips `pnpm audit` and jscpd;
 * the pnpm steps are skipped without a lockfile (they are meaningless
 * outside a pnpm project).
 */
const runLint = async (options: LintOptions = {}): Promise<number> => {
  const paths = resolvePaths(options.paths);
  const root = resolve(paths[0] ?? ".");
  const fast = options.fast === true;
  const hasLockfile = existsSync(join(root, "pnpm-lock.yaml"));

  const steps: Step[] = [
    {
      name: "biome",
      run: () =>
        runCommand(resolveBin("@biomejs/biome", "biome"), ["check", ...paths], {
          cwd: root,
        }),
    },
    {
      name: "oxlint",
      run: () => runOxlint(["--deny-warnings", ...paths], root),
    },
    ...LINT_RULES.map((id) => astGrepRuleStep(id, paths, root)),
    { name: "pandoc", run: () => Promise.resolve(runPandoc(root, "check")) },
  ];
  if (hasLockfile)
    steps.push({
      name: "peer-deps",
      run: () => Promise.resolve(pnpmPeersCheck(root)),
    });
  if (!fast && hasLockfile)
    steps.push({
      name: "audit",
      run: () => Promise.resolve(pnpmCommand(root, ["audit", "--prod"])),
    });
  if (!fast)
    steps.push({
      name: "jscpd",
      run: () =>
        runCommand(
          resolveBin("jscpd", "jscpd"),
          [
            ...paths,
            "--format",
            "typescript",
            "--min-lines",
            "3",
            "--threshold",
            "5",
            "--ignore",
            "**/node_modules/**,**/coverage/**",
          ],
          { cwd: root },
        ),
    });

  const skipped: string[] = [];
  if (!hasLockfile) skipped.push("peer-deps (no pnpm-lock.yaml)");
  if (fast) skipped.push("audit (--fast)", "jscpd (--fast)");
  else if (!hasLockfile) skipped.push("audit (no pnpm-lock.yaml)");
  for (const reason of skipped) console.log(`> skipped ${reason}`);

  return runSequence(steps);
};

export { LINT_RULES, resolvePaths, runLint };
