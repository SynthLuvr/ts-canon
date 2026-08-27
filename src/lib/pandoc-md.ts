import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const SKIP_PARTS = new Set(["node_modules", ".git"]);

const PANDOC_MISSING =
  "pandoc was not found on PATH. Install pandoc (>= 3.10) and retry.";

/**
 * Collects `*.md` files under `dir`, sorted. Symlinks are skipped: pnpm
 * workspace links can form cycles that would loop this walk forever.
 */
const findMarkdown = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_PARTS.has(entry.name) || entry.isSymbolicLink()) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) findMarkdown(full, acc);
    else if (entry.isFile() && entry.name.endsWith(".md")) acc.push(full);
  }
  return acc.sort();
};

/**
 * Formats one file with pandoc. `--eol=lf` overrides pandoc's `native` EOL
 * mode, which emits CRLF on Windows and would break the byte-for-byte
 * check.
 */
const pandocFormat = (root: string, file: string): string => {
  const result = spawnSync("pandoc", ["--eol=lf", "-t", "gfm", file], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.error) throw result.error;

  if (result.status !== 0)
    throw new Error(
      `pandoc exited with status ${result.status}: ${result.stderr}`,
    );

  return result.stdout;
};

/** First word of `pandoc --version`'s first line, e.g. "3.10.2". */
const pandocVersion = (): string | undefined => {
  const result = spawnSync("pandoc", ["--version"], { encoding: "utf8" });
  if (result.error || result.status !== 0) return undefined;
  return result.stdout.split("\n", 1)[0]?.split(/\s+/)[1];
};

const isMissingPandoc = (error: unknown): boolean =>
  (error as NodeJS.ErrnoException).code === "ENOENT";

type PandocMode = "check" | "write";

/**
 * Checks or rewrites every markdown file under `root` to canonical
 * GitHub-Flavored Markdown, making pandoc the single source of truth for
 * Markdown formatting. Returns a process exit code.
 */
const runPandoc = (root: string, mode: PandocMode): number => {
  const files = findMarkdown(root);
  const drifted: string[] = [];

  for (const file of files) {
    let formatted: string;
    try {
      formatted = pandocFormat(root, file);
    } catch (error) {
      if (!isMissingPandoc(error)) throw error;
      console.error(PANDOC_MISSING);
      return 1;
    }

    const rel = relative(root, file);
    if (formatted === readFileSync(file, "utf8")) continue;

    if (mode === "write") {
      writeFileSync(file, formatted);
      console.log(`formatted ${rel}`);
    } else {
      drifted.push(rel);
    }
  }

  if (mode === "write") return 0;
  if (drifted.length === 0) {
    console.log(`pandoc check passed for ${files.length} markdown file(s).`);
    return 0;
  }

  console.error("Markdown files are not pandoc-formatted:");
  for (const file of drifted) console.error(`  ${file}`);
  console.error("\nFix with: ts-toolkit format");
  return 1;
};

export { findMarkdown, PANDOC_MISSING, pandocFormat, pandocVersion, runPandoc };
