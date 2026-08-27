import { runDoctor } from "./doctor";
import { runFormat } from "./format";
import { runLint } from "./lint";
import { runMigrate } from "./migrate";

const USAGE = `usage: ts-canon <command> [paths...] [options]

commands:
  lint      run all lint checks (biome, oxlint, ast-grep, pandoc, peers, audit, jscpd)
  format    run all formatters (arrows, braces, biome, biome check, markdown)
  doctor    verify pandoc, node, pnpm, and bundled tool versions
  migrate   convert a consumer repo to ts-canon

options:
  --fast             lint: skip pnpm audit and jscpd
  --dry-run          migrate: print the plan without writing
  --version <spec>   migrate: ts-canon dependency spec (default ^0; an
                     existing non-registry spec is kept)
  --help             show this help`;

/**
 * Takes `--name value` or `--name=value` out of `args`, returning the
 * value (when given), whether the flag was present without a value, and
 * the remaining args (the consumed value is removed too, so it cannot be
 * mistaken for a path).
 */
const takeOption = (
  args: string[],
  name: string,
): { value?: string; missingValue: boolean; rest: string[] } => {
  const rest: string[] = [];
  let value: string | undefined;
  let missingValue = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === `--${name}`) {
      const next = args[i + 1];
      if (next === undefined || next.startsWith("--")) missingValue = true;
      else {
        value = next;
        i += 1;
      }
    } else if (arg.startsWith(`--${name}=`)) {
      value = arg.slice(`--${name}=`.length);
    } else rest.push(arg);
  }
  return { value, missingValue, rest };
};

/**
 * Parses `argv` (already stripped of node/tsx) and dispatches to a
 * subcommand, returning the process exit code.
 */
const main = async (argv: string[]): Promise<number> => {
  const [command, ...rest] = argv;
  const paths = rest.filter((arg) => !arg.startsWith("--"));
  const flags = rest.filter((arg) => arg.startsWith("--"));

  const wantsHelp =
    command === "help" || command === "--help" || flags.includes("--help");
  if (wantsHelp) {
    console.log(USAGE);
    return 0;
  }
  if (command === undefined) {
    console.error(USAGE);
    return 2;
  }

  switch (command) {
    case "lint":
      return runLint({ paths, fast: flags.includes("--fast") });
    case "format":
      return runFormat({ paths });
    case "doctor":
      return runDoctor();
    case "migrate": {
      const { value: version, missingValue } = takeOption(rest, "version");
      if (missingValue) {
        console.error("migrate: --version requires a value\n");
        console.error(USAGE);
        return 2;
      }
      return runMigrate({ dryRun: flags.includes("--dry-run"), version });
    }
    default:
      console.error(`unknown command: ${command}\n`);
      console.error(USAGE);
      return 2;
  }
};

export { main, USAGE };
