import { readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Directory entries that mark a subtree as package-manager territory: the
 * convert-to-arrow walk must never descend into them, because that is
 * where pnpm keeps the workspace symlinks that can cycle back to the repo
 * root.
 */
const SKIP_DIRS = new Set(["node_modules"]);

/** Extensions the convert-to-arrow codemod applies to. */
const TS_EXTENSIONS = [".ts", ".tsx"] as const;

/**
 * Result of scoping one directory. A directory is *clean* when neither it
 * nor anything beneath it holds a `SKIP_DIRS` entry; clean directories
 * collapse into their maximal clean ancestor, dirty ones contribute
 * whatever their clean children produced.
 */
type Scoped = { clean: boolean; roots: string[] };

/** Converts path separators to `/` so the glob is portable. */
const toPosix = (value: string): string => value.replaceAll("\\", "/");

/**
 * Post-order walk of `absDir` collecting the maximal clean directories as
 * paths relative to the walk base. Dot entries and symlinks are skipped:
 * pnpm workspace links can form cycles that must not be followed — the
 * same rule `findMarkdown` already applies to the pandoc walk.
 */
const scopeDirectory = (absDir: string, relDir: string): Scoped => {
  const children: { rel: string; scoped: Scoped }[] = [];
  let dirty = false;

  const entries = readdirSync(absDir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.isSymbolicLink() || entry.name.startsWith(".")) continue;
    if (SKIP_DIRS.has(entry.name)) {
      dirty = true;
      continue;
    }
    if (!entry.isDirectory()) continue;
    children.push({
      rel: toPosix(join(relDir, entry.name)),
      scoped: scopeDirectory(
        join(absDir, entry.name),
        join(relDir, entry.name),
      ),
    });
  }

  const clean = !dirty && children.every((child) => child.scoped.clean);
  if (clean) return { clean: true, roots: [toPosix(relDir)] };

  const scoped: Scoped = { clean: false, roots: [] };
  for (const child of children)
    if (child.scoped.clean) scoped.roots.push(child.rel);
    else scoped.roots.push(...child.scoped.roots);

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
 *
 * Two properties of the tool's globber dictate the shape of the result:
 * only `**`-anchored elements prune the descent (a trailing `*.ts`
 * segment or a literal file path makes it scan the element's whole base
 * subtree), and nested braces are not expanded. So every element is a
 * doublestar glob rooted at a clean directory, brace-free, joined in one
 * outer alternation. TypeScript files sitting directly in a dirty
 * directory (a workspace root's `vitest.config.ts`) are deliberately out
 * of scope — the canonical toolchain never codemodded them either — and
 * stay covered by the biome steps. Returns `undefined` when no clean
 * root exists.
 */
const sourceGlob = (root: string): string | undefined => {
  const { roots } = scopeDirectory(root, ".");
  const elements = roots.flatMap((dir) =>
    TS_EXTENSIONS.map((extension) => {
      const base = dir === "." ? "**" : `${dir}/**`;
      return `${base}/*${extension}`;
    }),
  );
  if (elements.length === 0) return undefined;
  return elements.length === 1 ? elements[0] : `{${elements.join(",")}}`;
};

export { sourceGlob };
