import { readFileSync } from "node:fs";

/**
 * True when `value` is a JSON object — typeof "object", not null, not
 * an array — narrowing it to a string-keyed record.
 */
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Parses `file` as JSON, failing with the file named in the message. */
const readJson = (file: string): unknown => {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(
      `${file}: invalid JSON ` +
        `(${error instanceof Error ? error.message : String(error)})`,
    );
  }
};

export { isPlainObject, readJson };
