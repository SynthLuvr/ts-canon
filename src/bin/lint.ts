import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { runOxlint } from "../lib/oxlint.ts";
import { runPandoc } from "../lib/pandoc-md.ts";
import { pnpmCommand, pnpmPeersCheck } from "../lib/peer-deps.ts";
import type { RuleOverride, RuleScope } from "../lib/rules-config.ts";
import { loadRulesConfig } from "../lib/rules-config.ts";
import type { Step } from "../lib/runner.ts";
import {
  resolveBin,
  runAstGrep,
  runBiome,
  runCommand,
  runSequence,
} from "../lib/runner.ts";

/**
 * The ast-grep rules enforced by `ts-canon lint`, in the order the
 * canonical toolchain ran them. File name and rule id match. Consumers
 * can scope or disable any of them per `ts-canon.json` (see
 * `src/lib/rules-config.ts`); per-line suppression uses ast-grep's
 * native `// ast-grep-ignore[: <rule-id>]` comments.
 */
const LINT_RULES = [
  "no-inline-export",
  "no-function-declaration",
  "no-file-comment",
  "no-unsafe-cast",
] as const;

type LintRuleId = (typeof LINT_RULES)[number];

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

/**
 * The `--globs` flags a rule's `ts-canon.json` scope contributes.
 * Include globs come first, excludes after — when several globs match a
 * file the later one wins, so ignores narrow what files broadened. The
 * baseline declaration-file exclusion is appended last by the step
 * below so generated `.d.ts` files stay out even when an include
 * matches them.
 */
const scopeGlobs = (scope: RuleScope | undefined): string[] =>
  scope === undefined
    ? []
    : [
        ...(scope.files ?? []).map((glob) => `--globs=${glob}`),
        ...(scope.ignores ?? []).map((glob) => `--globs=!${glob}`),
      ];

const astGrepRuleStep = (
  id: LintRuleId,
  paths: string[],
  root: string,
  scope: RuleScope | undefined,
): Step => ({
  name: `ast-grep:${id}`,
  run: () =>
    runAstGrep(id, paths, root, [
      `--error=${id}`,
      ...scopeGlobs(scope),
      "--globs=!**/*.d.ts",
    ]),
});

/** One step per shipped rule, skipping any turned off in ts-canon.json. */
const ruleSteps = (
  paths: string[],
  root: string,
  overrides: Record<string, RuleOverride>,
): Step[] => {
  const steps: Step[] = [];
  for (const id of LINT_RULES) {
    const override = overrides[id];
    if (override === "off") continue;
    steps.push(astGrepRuleStep(id, paths, root, override));
  }
  return steps;
};

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

  // A bad ts-canon.json fails the run with its message instead of a
  // stack, before any tool spawns: every rule below would otherwise
  // run with the wrong scope.
  let overrides: Record<string, RuleOverride> = {};
  try {
    overrides = loadRulesConfig(root, LINT_RULES);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }

  const steps: Step[] = [
    { name: "biome", run: () => runBiome(["check"], paths, root) },
    {
      name: "oxlint",
      run: () => runOxlint(["--deny-warnings", ...paths], root),
    },
    ...ruleSteps(paths, root, overrides),
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

  const skipped: string[] = LINT_RULES.filter(
    (id) => overrides[id] === "off",
  ).map((id) => `ast-grep:${id} (off in ts-canon.json)`);
  if (!hasLockfile) skipped.push("peer-deps (no pnpm-lock.yaml)");
  if (fast) skipped.push("audit (--fast)", "jscpd (--fast)");
  else if (!hasLockfile) skipped.push("audit (no pnpm-lock.yaml)");
  for (const reason of skipped) console.log(`> skipped ${reason}`);

  return runSequence(steps);
};

export { LINT_RULES, resolvePaths, rootFor, runLint };
