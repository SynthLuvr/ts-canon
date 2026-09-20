import { existsSync } from "node:fs";
import { join } from "node:path";
import { isPlainObject, readJson } from "./json.ts";

/** File a consumer drops at the lint root to override shipped rules. */
const CONFIG_FILE = "ts-canon.json";

/**
 * Where a rule runs: `files` are include globs, `ignores` exclude globs
 * (gitignore syntax; when several globs match a file, the later wins).
 */
type RuleScope = { files?: string[]; ignores?: string[] };

/**
 * Per-rule override from `ts-canon.json`: `"off"` skips the rule
 * entirely, a `RuleScope` narrows where it runs.
 */
type RuleOverride = "off" | RuleScope;

/**
 * Fails with `where` context when `value` is not an array of non-empty
 * strings, so a typo in `ts-canon.json` reports the exact field.
 */
const asGlobList = (value: unknown, where: string): string[] => {
  if (!Array.isArray(value))
    throw new Error(`${where}: expected an array of glob strings`);
  return value.map((glob): string => {
    if (typeof glob !== "string" || glob.length === 0)
      throw new Error(`${where}: globs must be non-empty strings`);
    return glob;
  });
};

/** Validates one `rules` entry, failing with the rule id as context. */
const asRuleOverride = (id: string, value: unknown): RuleOverride => {
  if (value === "off") return value;
  if (!isPlainObject(value))
    throw new Error(
      `rules.${id}: expected "off" or { files?, ignores? }, ` +
        `got ${JSON.stringify(value)}`,
    );
  const scope: RuleScope = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key !== "files" && key !== "ignores")
      throw new Error(`rules.${id}: unknown field "${key}"`);
    scope[key] = asGlobList(entry, `rules.${id}.${key}`);
  }
  return scope;
};

/**
 * Reads and validates `ts-canon.json` from `root` — the directory the
 * lint tools run from, so a scoped `ts-canon lint packages/x` reads the
 * config next to that package. A missing file is the common case and
 * configures nothing; a present-but-invalid file throws rather than
 * silently linting with the wrong scope, and rule ids are checked
 * against `knownRules` so a typo cannot quietly disable a rule.
 */
const loadRulesConfig = (
  root: string,
  knownRules: readonly string[],
): Record<string, RuleOverride> => {
  const file = join(root, CONFIG_FILE);
  if (!existsSync(file)) return {};

  const parsed = readJson(file);
  if (!isPlainObject(parsed))
    throw new Error(`${CONFIG_FILE}: expected an object`);
  for (const key of Object.keys(parsed))
    if (key !== "rules")
      throw new Error(`${CONFIG_FILE}: unknown field "${key}"`);
  const { rules } = parsed;
  if (rules === undefined) return {};
  if (!isPlainObject(rules))
    throw new Error(`${CONFIG_FILE}: "rules" must be an object`);

  const overrides: Record<string, RuleOverride> = {};
  for (const [id, entry] of Object.entries(rules)) {
    if (!knownRules.includes(id))
      throw new Error(
        `${CONFIG_FILE}: rules.${id} matches no shipped rule ` +
          `(known: ${knownRules.join(", ")})`,
      );
    overrides[id] = asRuleOverride(id, entry);
  }
  return overrides;
};

export type { RuleOverride, RuleScope };
export { loadRulesConfig };
