import { join, resolve } from "node:path";
import { runPandoc } from "../lib/pandoc-md";
import type { Step } from "../lib/runner";
import {
  packageRoot,
  resolveBin,
  runCommand,
  runSequence,
} from "../lib/runner";
import { resolvePaths } from "./lint";

type FormatOptions = { paths?: string[] };

/**
 * Runs every formatter from the canonical toolchain, in order: arrows ->
 * braces -> biome format -> biome check -> markdown. Each step's output is
 * the next step's input, so the order matters (`biome check` must run after
 * `biome format` to apply lint auto-fixes to freshly formatted code).
 */
const runFormat = async (options: FormatOptions = {}): Promise<number> => {
  const paths = resolvePaths(options.paths);
  const root = resolve(paths[0] ?? ".");
  const astGrep = resolveBin("@ast-grep/cli", "ast-grep");

  const steps: Step[] = [
    {
      name: "convert-to-arrow",
      run: () =>
        runCommand(resolveBin("convert-to-arrow", "convert-to-arrow"), paths, {
          cwd: root,
        }),
    },
    {
      name: "strip-braces",
      run: () =>
        runCommand(
          astGrep,
          [
            "scan",
            "--rule",
            join(packageRoot(), "rules", "strip-braces.yml"),
            "-U",
            ...paths,
          ],
          { cwd: root },
        ),
    },
    {
      name: "biome format",
      run: () =>
        runCommand(
          resolveBin("@biomejs/biome", "biome"),
          ["format", "--write", ...paths],
          { cwd: root },
        ),
    },
    {
      name: "biome check",
      run: () =>
        runCommand(
          resolveBin("@biomejs/biome", "biome"),
          ["check", "--write", ...paths],
          { cwd: root },
        ),
    },
    { name: "pandoc", run: () => Promise.resolve(runPandoc(root, "write")) },
  ];

  return runSequence(steps);
};

export { runFormat };
