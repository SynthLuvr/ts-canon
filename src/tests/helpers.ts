import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Creates a unique temp dir; returns it and a cleanup function. */
const withTempDir = (): [string, () => void] => {
  const dir = mkdtempSync(join(tmpdir(), "ts-canon-"));
  return [dir, () => rmSync(dir, { recursive: true, force: true })];
};

/** Writes a file (creating parent dirs) with LF-normalized content. */
const writeFixture = (root: string, rel: string, content: string): string => {
  const file = join(root, rel);
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, content.replaceAll("\r\n", "\n"));
  return file;
};

export { withTempDir, writeFixture };
