import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** File a consumer drops at the lint root to override shipped rules. */
const CONFIG_FILE = "ts-canon.json";

/**
 * Per-rule override from `ts-canon.json`. `"off"` skips the rule
 * entirely; an object narrows where it runs — `files` are include
 * globs, `ignores` exclude globs (gitignore syntax, later globs win).
 */
type RuleOverride = "off" | { files?: string[]; ignores?: string[] };

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
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error(
      `rules.${id}: expected "off" or { files?, ignores? }, ` +
        `got ${JSON.stringify(value)}`,
    );
  const override: { files?: string[]; ignores?: string[] } = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key !== "files" && key !== "ignores")
      throw new Error(`rules.${id}: unknown field "${key}"`);
    override[key] = asGlobList(entry, `rules.${id}.${key}`);
  }
  return override;
};

/**
 * Reads and validates `ts-canon.json` from `root` — the directory the
 * lint tools run from, so a scoped `ts-canon lint packages/x` reads the
 * config next to that package. Returns the per-rule overrides; a
 * missing file is the common case and configures nothing. A
 * present-but-invalid file throws rather than silently linting with
 * the wrong scope; rule ids are validated against `knownRules` so a
 * typo cannot quietly disable a rule the consumer meant to scope.
 */
const loadRulesConfig = (
  root: string,
  knownRules: readonly string[],
): Record<string, RuleOverride> => {
  const file = join(root, CONFIG_FILE);
  if (!existsSync(file)) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(
      `${CONFIG_FILE}: invalid JSON ` +
        `(${error instanceof Error ? error.message : String(error)})`,
    );
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error(`${CONFIG_FILE}: expected an object`);
  for (const key of Object.keys(parsed))
    if (key !== "rules")
      throw new Error(`${CONFIG_FILE}: unknown field "${key}"`);
  if (!("rules" in parsed)) return {};
  const { rules } = parsed;
  if (rules === null || typeof rules !== "object" || Array.isArray(rules))
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

export type { RuleOverride };
export { loadRulesConfig };
