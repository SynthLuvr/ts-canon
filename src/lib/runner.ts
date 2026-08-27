import { spawn } from "node:child_process";
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  readSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Locates an installed package directory by walking up from this file, the
 * way node resolves modules. Unlike `require.resolve`, the walk is not
 * blocked by a package `exports` map, and it works for the dependency
 * layouts ts-toolkit runs in: this repo (deps at the root), a pnpm install
 * (deps under `node_modules/ts-toolkit/node_modules`), and plain hoisted
 * installs.
 */
const findPackageDir = (pkg: string): string => {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (true) {
    const candidate = join(dir, "node_modules", pkg);
    if (existsSync(join(candidate, "package.json"))) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`cannot find package ${pkg} from ts-toolkit`);
};

/**
 * Absolute path to a bin inside an installed package, read from its `bin`
 * field. This is the AppLocker-safe resolution technique: the returned file
 * is the tool's real entry point, so it can be spawned without a shell and
 * without the `.CMD` shims pnpm writes for Windows.
 */
const resolveBin = (pkg: string, bin: string): string => {
  const dir = findPackageDir(pkg);
  const manifest = join(dir, "package.json");
  const parsed = JSON.parse(readFileSync(manifest, "utf8")) as {
    bin: Record<string, string> | string;
  };
  const relative =
    typeof parsed.bin === "string" ? parsed.bin : parsed.bin[bin];
  if (relative === undefined)
    throw new Error(`package ${pkg} has no "${bin}" bin`);

  return join(dir, relative);
};

/**
 * True when `file` starts with a node shebang, so an extensionless bin is
 * JS that must run under node rather than be executed directly.
 */
const hasNodeShebang = (file: string): boolean => {
  const fd = openSync(file, "r");
  try {
    const buffer = Buffer.alloc(128);
    const bytes = readSync(fd, buffer, 0, buffer.length, 0);
    const head = buffer.toString("utf8", 0, bytes);
    return head.startsWith("#!") && head.includes("node");
  } finally {
    closeSync(fd);
  }
};

/** How a resolved tool entry point must be spawned. */
type EntryKind = "node" | "direct";

const entryKind = (file: string): EntryKind => {
  if (/\.(?:js|cjs|mjs)$/.test(file)) return "node";
  try {
    if (hasNodeShebang(file)) return "node";
  } catch {
    // Unreadable entries are spawned directly so spawn can report the error.
  }
  return "direct";
};

/**
 * Spawns a resolved tool by absolute path — under the current node when it
 * is a JS entry point, directly when it is a native executable — and
 * resolves to the child's exit code. Mirrors the spawn discipline of the
 * ported `peer-deps`/`oxlint` scripts: no shell, no PATH lookup, no shims.
 */
const runCommand = (
  file: string,
  args: string[],
  options: { cwd?: string } = {},
): Promise<number> =>
  new Promise((resolve) => {
    const kind = entryKind(file);
    const child = spawn(
      kind === "node" ? process.execPath : file,
      kind === "node" ? [file, ...args] : args,
      { stdio: "inherit", cwd: options.cwd },
    );
    child.on("error", (error) => {
      console.error(`ts-toolkit: failed to run ${file}: ${error.message}`);
      resolve(1);
    });
    child.on("close", (code) => resolve(code ?? 1));
  });

/**
 * Runs `ast-grep scan` with a rule from this package's `rules/` directory.
 * Flags that take a rule id must use `--flag=value` syntax — a separate
 * value argument is parsed as another scan path, not as the flag's value.
 */
const runAstGrep = (
  rule: string,
  paths: string[],
  root: string,
  extraArgs: string[] = [],
): Promise<number> =>
  runCommand(
    resolveBin("@ast-grep/cli", "ast-grep"),
    [
      "scan",
      "--rule",
      join(packageRoot(), "rules", `${rule}.yml`),
      ...extraArgs,
      ...paths,
    ],
    { cwd: root },
  );

/** Runs biome with `args` over `paths`, from the `root` working directory. */
const runBiome = (
  args: string[],
  paths: string[],
  root: string,
): Promise<number> =>
  runCommand(resolveBin("@biomejs/biome", "biome"), [...args, ...paths], {
    cwd: root,
  });

/** A named, ordered step that reports success as exit code 0. */
type Step = { name: string; run: () => Promise<number> };

/**
 * Runs steps sequentially and fails fast, matching `npm-run-all`'s default
 * behavior: the first non-zero step stops the sequence and becomes the
 * result.
 */
const runSequence = async (steps: Step[]): Promise<number> => {
  for (const step of steps) {
    console.log(`> ${step.name}`);
    const code = await step.run();
    if (code !== 0) return code;
  }
  return 0;
};

/**
 * Absolute path of this package's root (`presets/` and `rules/` live there).
 */
const packageRoot = (): string =>
  join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export type { Step };
export {
  entryKind,
  findPackageDir,
  packageRoot,
  resolveBin,
  runAstGrep,
  runBiome,
  runCommand,
  runSequence,
};
