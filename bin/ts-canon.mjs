#!/usr/bin/env node
// Launcher for the ts-canon CLI: runs the TypeScript entry point under
// node's native type stripping (node >= 24, per `engines`), spawned under
// the current node — no shell, no `.CMD` shim, per the Windows/AppLocker
// contract in src/lib/runner.ts.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const stripHook = pathToFileURL(
  join(packageRoot, "bin", "type-strip.mjs"),
).href;

// The hook strips .ts under node_modules via node's experimental
// stripTypeScriptTypes API, whose warning would fire on every command.
// --import takes a module specifier, so the hook must be a file:// URL —
// a bare Windows path parses as a "d:" protocol.
const nodeArgs = [
  "--disable-warning=ExperimentalWarning",
  "--import",
  stripHook,
  join(packageRoot, "src", "bin", "main.ts"),
  ...process.argv.slice(2),
];

const result = spawnSync(process.execPath, nodeArgs, { stdio: "inherit" });
if (result.error) {
  console.error(`ts-canon: failed to start: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
