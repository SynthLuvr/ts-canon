import { readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Never descended into: package-manager territory, where pnpm keeps the
 * workspace symlinks that can cycle back to the workspace root.
 */
const SKIP_DIR = "node_modules";

const TS_EXTENSIONS = [".ts", ".tsx"] as const;

/**
 * Result of scoping one directory. *Clean* means neither the directory
 * nor anything beneath it holds `node_modules`: a clean directory's
 * `roots` is exactly itself, a dirty one's are the maximal clean
 * directories beneath it.
 */
type Scoped = { clean: boolean; roots: string[] };

/** `join` emits `\` on Windows; the globber matches `/`-separated patterns. */
const toPosix = (value: string): string => value.replaceAll("\\", "/");

/**
 * Post-order walk of `absDir` collecting the maximal clean directories
 * as paths relative to the walk base. Dot entries and symlinks are
 * skipped: pnpm workspace links can cycle back to the walk base, the
 * same rule `findMarkdown` applies to the pandoc walk.
 */
const scopeDirectory = (absDir: string, relDir: string): Scoped => {
  const roots: string[] = [];
  let dirty = false;

  const entries = readdirSync(absDir, { withFileTypes: true });
  // Sorted so the glob is stable across readdir orders.
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.isSymbolicLink() || entry.name.startsWith(".")) continue;
    if (entry.name === SKIP_DIR) {
      dirty = true;
      continue;
    }
    if (!entry.isDirectory()) continue;
    const rel = join(relDir, entry.name);
    const scoped = scopeDirectory(join(absDir, entry.name), rel);
    if (!scoped.clean) dirty = true;
    roots.push(...scoped.roots);
  }

  if (dirty) return { clean: false, roots };
  return { clean: true, roots: [toPosix(relDir)] };
};

/**
 * The single glob argument that hands convert-to-arrow every TypeScript
 * file under `root` without letting the tool's own walk leave the source
 * tree. A bare `.` cannot: the tool's `node_modules` negation filters
 * results without pruning the traversal, and it follows symlinks, so on
 * a pnpm workspace whose root is also a workspace dependency the walk
 * chases the hoisted link cycle through the whole `.pnpm` store until
 * the heap is gone.
 *
 * The globber prunes its descent only for `**`-anchored patterns and
 * does not expand nested braces, so the result is one outer alternation
 * of brace-free doublestar globs, each rooted at a maximal clean
 * directory. TypeScript files sitting directly in a dirty directory (a
 * workspace root's `vitest.config.ts`) are therefore out of scope — the
 * canonical per-step scripts never covered them either — and stay
 * covered by the biome steps. Returns `undefined` when no clean root
 * exists.
 */
const sourceGlob = (root: string): string | undefined => {
  const { roots } = scopeDirectory(root, ".");
  const elements = roots.flatMap((dir) => {
    const base = dir === "." ? "**" : `${dir}/**`;
    return TS_EXTENSIONS.map((extension) => `${base}/*${extension}`);
  });
  if (elements.length === 0) return undefined;
  return `{${elements.join(",")}}`;
};

export { sourceGlob };
