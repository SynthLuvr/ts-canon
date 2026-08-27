import { resolve } from "node:path";
import { runPandoc } from "../lib/pandoc-md";
import type { Step } from "../lib/runner";
import {
  resolveBin,
  runAstGrep,
  runBiome,
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
      run: () => runAstGrep("strip-braces", paths, root, ["-U"]),
    },
    {
      name: "biome format",
      run: () => runBiome(["format", "--write"], paths, root),
    },
    {
      name: "biome check",
      run: () => runBiome(["check", "--write"], paths, root),
    },
    { name: "pandoc", run: () => Promise.resolve(runPandoc(root, "write")) },
  ];

  return runSequence(steps);
};

export { runFormat };
