#!/usr/bin/env node
// Launcher for the ts-toolkit CLI. Runs the TypeScript entry point through
// the bundled tsx, resolved by absolute path and spawned under the current
// node — no shell, no `.CMD` shim, per the Windows/AppLocker contract in
// src/lib/runner.ts.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

const findTsx = () => {
  let dir = packageRoot;
  for (;;) {
    const manifest = join(dir, "node_modules", "tsx", "package.json");
    if (existsSync(manifest)) {
      const { bin } = JSON.parse(readFileSync(manifest, "utf8"));
      return join(dirname(manifest), bin);
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("ts-toolkit: cannot find the bundled tsx package");
};

const entry = join(packageRoot, "src", "bin", "main.ts");
const result = spawnSync(
  process.execPath,
  [findTsx(), entry, ...process.argv.slice(2)],
  { stdio: "inherit" },
);
if (result.error !== undefined && result.error !== null) {
  console.error(`ts-toolkit: failed to start: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
