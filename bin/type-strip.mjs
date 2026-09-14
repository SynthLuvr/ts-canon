// Type-stripping hook for installed copies of ts-canon. Node >= 24 strips
// types from .ts entry points and imports natively, but refuses to for
// anything under node_modules (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING),
// and a published install runs this package's sources from node_modules.
// This hook covers exactly those files with node's own public stripper —
// no third-party loader, no transpile step. Checked-out and `link:`-ed
// copies resolve to real paths outside node_modules and keep node's
// default stripping, untouched by this hook.
import { readFileSync } from "node:fs";
import { registerHooks, stripTypeScriptTypes } from "node:module";

/** True for a `file:` URL of a .ts module inside a node_modules tree. */
const isBundledTypeScript = (url) =>
  url.startsWith("file:") &&
  url.includes("/node_modules/") &&
  url.endsWith(".ts");

registerHooks({
  load(url, context, nextLoad) {
    if (isBundledTypeScript(url)) {
      const source = stripTypeScriptTypes(readFileSync(new URL(url), "utf8"), {
        mode: "strip",
      });
      return { format: "module", shortCircuit: true, source };
    }
    return nextLoad(url, context);
  },
});
