import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const SKIP_PARTS = new Set(["node_modules", ".git"]);

const PANDOC_MISSING =
  "pandoc was not found on PATH. Install pandoc (>= 3.10) and retry.";

/** A path predicate over `/`-separated paths relative to a walk root. */
type IgnoreTest = (relPath: string) => boolean;

/** One literal character's regex source, metacharacters escaped. */
const escapeLiteral = (char: string): string =>
  char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Regex source for one glob segment: `*` and `?` never cross a `/`, a
 * backslash escapes the next character, everything else is literal.
 */
const segmentSource = (segment: string): string => {
  let source = "";
  for (let index = 0; index < segment.length; index++) {
    const char = segment[index];
    if (char === "\\" && index + 1 < segment.length) {
      source += escapeLiteral(segment[index + 1]);
      index += 1;
    } else if (char === "*") source += "[^/]*";
    else if (char === "?") source += "[^/]";
    else source += escapeLiteral(char);
  }
  return source;
};

/**
 * One exclude glob as an anchored regex over a `/`-separated path
 * relative to the config root, following gitignore's semantics: a
 * pattern with no `/` matches the basename at any depth, anything else
 * is anchored at the root; a trailing `/` covers the directory itself
 * and everything beneath it; and a whole `**` segment spans zero or
 * more whole segments.
 */
const compileGlob = (glob: string): RegExp => {
  const stripped = glob.replace(/\/+$/, "");
  const directory = stripped !== glob;
  const segments = stripped.split("/");
  let source = stripped.includes("/") ? "" : "(?:[^/]+/)*";
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    const last = index === segments.length - 1;
    if (segment === "**") {
      source += last ? ".*" : "(?:[^/]+/)*";
      continue;
    }
    source += segmentSource(segment);
    if (!last) source += "/";
  }
  if (directory) source += "(?:/.*)?";
  return new RegExp(`^${source}$`);
};

/** Excludes a path when any glob matches it; no globs excludes nothing. */
const ignoreMatcher = (globs: readonly string[]): IgnoreTest => {
  const patterns = globs.map(compileGlob);
  return (relPath) => patterns.some((pattern) => pattern.test(relPath));
};

/**
 * Collects `*.md` files under `dir`, sorted, excluding any path
 * `isIgnored` accepts — a directory match prunes everything beneath
 * it. Symlinks are skipped: pnpm workspace links can form cycles that
 * would loop this walk forever.
 */
const findMarkdown = (
  dir: string,
  isIgnored: IgnoreTest = () => false,
): string[] => {
  const files: string[] = [];
  const walk = (current: string, relDir: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (SKIP_PARTS.has(entry.name) || entry.isSymbolicLink()) continue;
      const rel = relDir === "" ? entry.name : `${relDir}/${entry.name}`;
      if (isIgnored(rel)) continue;
      if (entry.isDirectory()) walk(join(current, entry.name), rel);
      else if (entry.isFile() && entry.name.endsWith(".md"))
        files.push(join(current, entry.name));
    }
  };
  walk(dir, "");
  return files.sort();
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
  error instanceof Error && "code" in error && error.code === "ENOENT";

type PandocMode = "check" | "write";

/**
 * Checks or rewrites every markdown file under `root` to canonical
 * GitHub-Flavored Markdown, making pandoc the single source of truth
 * for Markdown formatting. Files whose root-relative path matches an
 * `ignores` glob (gitignore syntax, compiled by `ignoreMatcher`
 * above) keep their exact bytes — for generated or vendored markdown.
 * Returns a process exit code.
 */
const runPandoc = (
  root: string,
  mode: PandocMode,
  ignores: readonly string[] = [],
): number => {
  const isIgnored = ignores.length === 0 ? undefined : ignoreMatcher(ignores);
  const files = findMarkdown(root, isIgnored);
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
  console.error("\nFix with: ts-canon format");
  return 1;
};

export {
  findMarkdown,
  ignoreMatcher,
  PANDOC_MISSING,
  pandocFormat,
  pandocVersion,
  runPandoc,
};
