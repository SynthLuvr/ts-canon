import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { runOxlint } from "../lib/oxlint";
import { runPandoc } from "../lib/pandoc-md";
import { pnpmCommand, pnpmPeersCheck } from "../lib/peer-deps";
import type { Step } from "../lib/runner";
import {
  resolveBin,
  runAstGrep,
  runBiome,
  runCommand,
  runSequence,
} from "../lib/runner";

/**
 * The ast-grep rules enforced by `ts-canon lint`, in the order the
 * canonical toolchain ran them. File name and rule id match.
 */
const LINT_RULES = [
  "no-inline-export",
  "no-function-declaration",
  "no-file-comment",
] as const;

type LintOptions = { paths?: string[]; fast?: boolean };

/**
 * Defaults missing path arguments to `.` (monorepos can pass narrower
 * paths), then resolves each to absolute from the caller's directory:
 * the tools run with `cwd: root`, so a relative argument left as typed
 * would be re-based onto the target directory and miss every file.
 */
const resolvePaths = (paths?: string[]): string[] =>
  (paths?.length ? paths : ["."]).map((path) => resolve(path));

/**
 * The directory the tools run from: the first path itself, or — for a
 * glob argument — the deepest directory before its first wildcard,
 * since a pattern is no directory to spawn in. Biome discovers its
 * config here, the pandoc step walks it, and the pnpm steps look for
 * the lockfile at it.
 */
const rootFor = (path: string): string => {
  const cut = path.search(/[*?{[]/);
  if (cut === -1) return path;
  const prefix = path.slice(0, cut);
  return /[\\/]$/.test(prefix) ? prefix.slice(0, -1) : dirname(prefix);
};

const astGrepRuleStep = (
  id: (typeof LINT_RULES)[number],
  paths: string[],
  root: string,
): Step => ({
  name: `ast-grep:${id}`,
  run: () =>
    runAstGrep(id, paths, root, [`--error=${id}`, "--globs", "!**/*.d.ts"]),
});

/**
 * Runs every lint check from the canonical toolchain, in order, and fails
 * fast on the first non-zero step. `--fast` skips `pnpm audit` and jscpd;
 * the pnpm steps are skipped without a lockfile (they are meaningless
 * outside a pnpm project).
 */
const runLint = async (options: LintOptions = {}): Promise<number> => {
  const paths = resolvePaths(options.paths);
  const root = rootFor(paths[0]);
  const fast = options.fast === true;
  const hasLockfile = existsSync(join(root, "pnpm-lock.yaml"));

  const steps: Step[] = [
    { name: "biome", run: () => runBiome(["check"], paths, root) },
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

export { LINT_RULES, resolvePaths, rootFor, runLint };
