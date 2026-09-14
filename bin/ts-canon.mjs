#!/usr/bin/env node
// Launcher for the ts-canon CLI. Runs the TypeScript entry point under
// node's native type stripping (node >= 24, per `engines`), spawned under
// the current node — no shell, no `.CMD` shim, per the Windows/AppLocker
// contract in src/lib/runner.ts.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

const entry = join(packageRoot, "src", "bin", "main.ts");
const stripHook = join(packageRoot, "bin", "type-strip.mjs");
if (!existsSync(entry)) {
  console.error(`ts-canon: CLI entry point is missing: ${entry}`);
  process.exit(1);
}
if (!existsSync(stripHook)) {
  console.error(`ts-canon: type-stripping hook is missing: ${stripHook}`);
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  [
    // The hook strips .ts under node_modules via the experimental
    // stripTypeScriptTypes API; the warning would fire on every command.
    // --import takes a module specifier, so the hook must be a file://
    // URL — a bare Windows path parses as a "d:" protocol.
    "--disable-warning=ExperimentalWarning",
    "--import",
    pathToFileURL(stripHook).href,
    entry,
    ...process.argv.slice(2),
  ],
  { stdio: "inherit" },
);
if (result.error) {
  console.error(`ts-canon: failed to start: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
