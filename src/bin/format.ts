import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { runPandoc } from "../lib/pandoc-md";
import type { Step } from "../lib/runner";
import {
  resolveBin,
  runAstGrep,
  runBiome,
  runCommand,
  runSequence,
} from "../lib/runner";
import { sourceGlob } from "../lib/source-glob";
import { resolvePaths, rootFor } from "./lint";

type FormatOptions = { paths?: string[] };

/**
 * Arguments for the convert-to-arrow step. A lone directory argument is
 * rescoped by `sourceGlob` so the codemod's walk stays inside the source
 * tree (see there for why); globs, multiple paths, files, and missing
 * paths keep the codemod's own passthrough behavior. `undefined` skips
 * the step.
 */
const arrowsArgs = (paths: string[], root: string): string[] | undefined => {
  if (paths.length !== 1 || paths[0].includes("*")) return paths;
  const stats = statSync(root, { throwIfNoEntry: false });
  if (stats === undefined || !stats.isDirectory()) return paths;
  const glob = sourceGlob(root);
  return glob === undefined ? undefined : [glob];
};

const convertToArrowStep = (paths: string[], root: string): Step => ({
  name: "convert-to-arrow",
  run: () => {
    const args = arrowsArgs(paths, root);
    if (args === undefined) {
      console.log("(no TypeScript files found — nothing to convert)");
      return Promise.resolve(0);
    }
    const bin = resolveBin("convert-to-arrow", "convert-to-arrow");
    return runCommand(bin, args, { cwd: root });
  },
});

/**
 * Runs every formatter from the canonical toolchain, in order: arrows ->
 * braces -> biome format -> biome check -> markdown. Each step's output is
 * the next step's input, so the order matters (`biome check` must run after
 * `biome format` to apply lint auto-fixes to freshly formatted code).
 * convert-to-arrow skips itself when the target has no `tsconfig.json` —
 * the codemod resolves one from the working directory unconditionally and
 * crashes without it.
 */
const runFormat = async (options: FormatOptions = {}): Promise<number> => {
  const paths = resolvePaths(options.paths);
  const root = rootFor(paths[0]);

  const hasTsconfig = existsSync(join(root, "tsconfig.json"));
  if (!hasTsconfig)
    console.log("> skipped convert-to-arrow (no tsconfig.json)");

  const steps: Step[] = [];
  if (hasTsconfig) steps.push(convertToArrowStep(paths, root));
  steps.push(
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
  );

  return runSequence(steps);
};

export { runFormat };
