import { readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Directory entries that mark a subtree as package-manager territory:
 * the convert-to-arrow walk must never descend into them, because that is
 * where pnpm keeps the workspace symlinks that can cycle back to the repo
 * root.
 */
const SKIP_DIRS = new Set(["node_modules"]);

/** Extensions the convert-to-arrow codemod applies to. */
const TS_EXTENSIONS = [".ts", ".tsx"] as const;

/**
 * Result of scoping one directory. A directory is *clean* when neither it
 * nor anything beneath it holds a `SKIP_DIRS` entry; clean directories
 * collapse into their maximal clean ancestor, and every dirty directory
 * that holds TypeScript files directly is kept in `loose` so its files
 * stay covered by a `*.ts` element instead of a root.
 */
type Scoped = { clean: boolean; roots: string[]; loose: string[] };

const isTypeScript = (name: string): boolean =>
  TS_EXTENSIONS.some((extension) => name.endsWith(extension));

/** Path prefix for a root relative to the walk base: empty for `.`. */
const prefix = (dir: string): string => (dir === "." ? "" : `${dir}/`);

/** Converts path separators to `/` so the glob is portable. */
const toPosix = (value: string): string => value.replaceAll("\\", "/");

/**
 * Post-order walk of `absDir` collecting the maximal clean directories and
 * the dirty directories with direct TypeScript files, both as paths
 * relative to the walk base. Dot entries and symlinks are skipped: pnpm
 * workspace links can form cycles that must not be followed — the same
 * rule `findMarkdown` already applies to the pandoc walk.
 */
const scopeDirectory = (absDir: string, relDir: string): Scoped => {
  const children: { rel: string; scoped: Scoped }[] = [];
  let dirty = false;
  let hasTypeScript = false;

  const entries = readdirSync(absDir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.isSymbolicLink() || entry.name.startsWith(".")) continue;
    if (SKIP_DIRS.has(entry.name)) {
      dirty = true;
      continue;
    }
    if (!entry.isDirectory()) {
      if (isTypeScript(entry.name)) hasTypeScript = true;
      continue;
    }
    children.push({
      rel: toPosix(join(relDir, entry.name)),
      scoped: scopeDirectory(
        join(absDir, entry.name),
        join(relDir, entry.name),
      ),
    });
  }

  const clean = !dirty && children.every((child) => child.scoped.clean);
  if (clean) return { clean: true, roots: [toPosix(relDir)], loose: [] };

  const scoped: Scoped = { clean: false, roots: [], loose: [] };
  for (const child of children)
    if (child.scoped.clean) scoped.roots.push(child.rel);
    else {
      scoped.roots.push(...child.scoped.roots);
      scoped.loose.push(...child.scoped.loose);
    }

  if (hasTypeScript) scoped.loose.push(toPosix(relDir));
  return scoped;
};

/**
 * Builds the single glob argument that hands convert-to-arrow every
 * TypeScript file under `root` without letting its own walk descend into
 * `node_modules` or a symlink. A bare `.` does not do that: the tool's
 * node_modules negation filters results but does not prune the
 * traversal, and it follows symlinks, so on a pnpm workspace whose root is
 * also a workspace dependency the walk chases the hoisted link cycle —
 * through the whole `.pnpm` store on every lap — until the heap is gone.
 * Anchoring the pattern at the clean roots keeps the traversal (and the
 * rewrite) inside the source tree. Elements stay brace-free: ts-morph's
 * matcher expands one outer alternation but not nested braces. Returns
 * `undefined` when there is nothing to convert.
 */
const sourceGlob = (root: string): string | undefined => {
  const scoped = scopeDirectory(root, ".");
  const elements = [
    ...scoped.roots.flatMap((dir) =>
      TS_EXTENSIONS.map((extension) => `${prefix(dir)}**/*${extension}`),
    ),
    ...scoped.loose.flatMap((dir) =>
      TS_EXTENSIONS.map((extension) => `${prefix(dir)}*${extension}`),
    ),
  ];
  if (elements.length === 0) return undefined;
  return elements.length === 1 ? elements[0] : `{${elements.join(",")}}`;
};

export { sourceGlob };
