import { spawnSync } from "node:child_process";
import { pandocVersion } from "../lib/pandoc-md";
import { pnpmVersion } from "../lib/peer-deps";
import { entryKind, resolveBin } from "../lib/runner";

const MIN_NODE: [number, number, number] = [24, 0, 0];
const MIN_PANDOC: [number, number, number] = [3, 10, 0];

/**
 * Parses the leading `\d+.\d+(.\d+)?` of a version string into a comparable
 * triple. Returns `undefined` for non-version strings.
 */
const parseVersion = (text: string): [number, number, number] | undefined => {
  const match = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(text.trim());
  if (match === null) return undefined;
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
};

/** True when `version` is greater than or equal to `minimum`. */
const isAtLeast = (
  version: [number, number, number],
  minimum: [number, number, number],
): boolean => {
  for (let i = 0; i < 3; i++)
    if (version[i] !== minimum[i]) return version[i] > minimum[i];
  return true;
};

const report = (name: string, ok: boolean, detail: string): void => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name} — ${detail}`);
};

/** Runs one `--version` probe against a resolved tool entry point. */
const toolVersion = (file: string): string | undefined => {
  const kind = entryKind(file);
  const result = spawnSync(
    kind === "node" ? process.execPath : file,
    kind === "node" ? [file, "--version"] : ["--version"],
    { encoding: "utf8" },
  );
  if (result.error !== undefined && result.error !== null) return undefined;
  if (result.status !== 0) return undefined;
  return result.stdout.split("\n", 1)[0]?.trim();
};

/** Tools bundled as direct dependencies of ts-toolkit. */
const BUNDLED_TOOLS: [string, string][] = [
  ["@ast-grep/cli", "ast-grep"],
  ["@biomejs/biome", "biome"],
  ["convert-to-arrow", "convert-to-arrow"],
  ["jscpd", "jscpd"],
  ["oxlint", "oxlint"],
  ["tsx", "tsx"],
];

/**
 * Verifies the environment the toolchain needs: node engine, pnpm, pandoc
 * (>= 3.10, the one non-npm dependency), the bundled tools, and the
 * consumer-side `typescript`. Missing hard requirements (pandoc, node)
 * produce a non-zero exit; advisory findings (pnpm, typescript) are
 * warnings.
 */
const runDoctor = (): number => {
  let failed = false;

  const nodeVersion = parseVersion(process.versions.node);
  const nodeOk = nodeVersion !== undefined && isAtLeast(nodeVersion, MIN_NODE);
  report("node", nodeOk, `${process.versions.node} (engines: >=24)`);
  failed ||= !nodeOk;

  const pnpm = pnpmVersion();
  if (pnpm === undefined)
    console.log("warn pnpm — not detected (is ts-toolkit run under pnpm?)");
  else console.log(`ok   pnpm — ${pnpm}`);

  const pandoc = pandocVersion();
  if (pandoc === undefined) {
    console.error(
      "pandoc was not found on PATH. Install pandoc (>= 3.10) and retry.",
    );
    failed = true;
  } else {
    const parsed = parseVersion(pandoc);
    const pandocOk = parsed !== undefined && isAtLeast(parsed, MIN_PANDOC);
    report("pandoc", pandocOk, `${pandoc} (required: >=3.10)`);
    failed ||= !pandocOk;
  }

  for (const [pkg, bin] of BUNDLED_TOOLS)
    try {
      const version = toolVersion(resolveBin(pkg, bin)) ?? "installed";
      console.log(`ok   ${pkg} — ${version}`);
    } catch (error) {
      report(pkg, false, (error as Error).message);
      failed = true;
    }

  try {
    const version = toolVersion(resolveBin("typescript", "tsc"));
    if (version === undefined) throw new Error("tsc --version failed");
    console.log(`ok   typescript (consumer-side) — ${version}`);
  } catch {
    console.log(
      "warn typescript (consumer-side) — not found; `tsc` and editors need a project-local install",
    );
  }

  return failed ? 1 : 0;
};

export { isAtLeast, parseVersion, runDoctor };
