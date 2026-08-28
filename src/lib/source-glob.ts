import { readdirSync } from "node:fs";
import { join } from "node:path";

const TS_EXTENSIONS = [".ts", ".tsx"] as const;

const SKIP_DIR = "node_modules";

const isTypeScript = (name: string): boolean =>
  TS_EXTENSIONS.some((extension) => name.endsWith(extension));

/** Glob prefix for `dir` relative to the walk base; the base (`.`) has none. */
const prefix = (dir: string): string => (dir === "." ? "" : `${dir}/`);

const toPosix = (value: string): string => value.replaceAll("\\", "/");

const recursiveElements = (dir: string): string[] =>
  TS_EXTENSIONS.map((extension) => `${prefix(dir)}**/*${extension}`);

const directElements = (dir: string): string[] =>
  TS_EXTENSIONS.map((extension) => `${prefix(dir)}*${extension}`);

/**
 * Glob elements for a directory that no single `**` pattern can cover:
 * `recursive` lists its clean subtrees, `direct` the files of the dirty
 * directories themselves.
 */
type Scope = { recursive: string[]; direct: string[] };

/**
 * Post-order walk of `absDir`, collecting glob elements for its TypeScript
 * files. Returns `null` for a clean directory — no `node_modules` at or
 * below it — so its nearest dirty ancestor covers the subtree with one
 * `**` element instead. A dirty directory's own files need `*.ts` elements
 * because `**` would reach into the `node_modules` beneath it.
 * `node_modules` is never entered, and symlinks and hidden entries are
 * skipped: pnpm workspace links can cycle back to the workspace root, the
 * rule `findMarkdown` applies to the pandoc walk. Entries are sorted so
 * the glob is stable across readdir orders.
 */
const scopeDirectory = (absDir: string, relDir: string): Scope | null => {
  const scope: Scope = { recursive: [], direct: [] };
  let dirty = false;
  let hasTypeScript = false;

  const entries = readdirSync(absDir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.isSymbolicLink() || entry.name.startsWith(".")) continue;
    if (entry.name === SKIP_DIR) {
      dirty = true;
      continue;
    }
    if (!entry.isDirectory()) {
      if (isTypeScript(entry.name)) hasTypeScript = true;
      continue;
    }
    const rel = toPosix(join(relDir, entry.name));
    const child = scopeDirectory(join(absDir, entry.name), rel);
    if (child === null) scope.recursive.push(...recursiveElements(rel));
    else {
      dirty = true;
      scope.recursive.push(...child.recursive);
      scope.direct.push(...child.direct);
    }
  }

  if (!dirty) return null;
  if (hasTypeScript) scope.direct.push(...directElements(toPosix(relDir)));
  return scope;
};

/**
 * The single glob argument that hands convert-to-arrow every TypeScript
 * file under `root` while keeping its walk inside the source tree. A bare
 * `.` cannot: the codemod's node_modules negation filters results without
 * pruning the traversal, and it follows symlinks, so on a pnpm workspace
 * whose root is also a workspace dependency the walk chases the hoisted
 * link cycle through the whole `.pnpm` store on every lap until the heap
 * is gone. Elements stay brace-free because ts-morph's matcher expands
 * one outer alternation but not nested braces. Returns `undefined` when
 * there is nothing to convert.
 */
const sourceGlob = (root: string): string | undefined => {
  const scope = scopeDirectory(root, ".");
  const elements =
    scope === null
      ? recursiveElements(".")
      : [...scope.recursive, ...scope.direct];
  return elements.length === 0 ? undefined : `{${elements.join(",")}}`;
};

export { sourceGlob };
