import { runDoctor } from "./doctor";
import { runFormat } from "./format";
import { runLint } from "./lint";
import { runMigrate } from "./migrate";

const USAGE = `usage: ts-toolkit <command> [paths...] [options]

commands:
  lint      run all lint checks (biome, oxlint, ast-grep, pandoc, peers, audit, jscpd)
  format    run all formatters (arrows, braces, biome, biome check, markdown)
  doctor    verify pandoc, node, pnpm, and bundled tool versions
  migrate   convert a consumer repo to ts-toolkit

options:
  --fast     lint: skip pnpm audit and jscpd
  --dry-run  migrate: print the plan without writing
  --help     show this help`;

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
    case "migrate":
      return runMigrate({ dryRun: flags.includes("--dry-run") });
    default:
      console.error(`unknown command: ${command}\n`);
      console.error(USAGE);
      return 2;
  }
};

export { main, USAGE };
