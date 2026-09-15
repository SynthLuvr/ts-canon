// Type-stripping hook for installed copies of ts-canon. Node >= 24 strips
// types from .ts natively but refuses under node_modules
// (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING), and a published install
// runs this package's sources from there. The hook covers exactly those
// files with node's own public stripper — no third-party loader, no
// transpile step. Checked-out and `link:`-ed copies resolve outside
// node_modules and keep node's default stripping, untouched by the hook.
import { readFileSync } from "node:fs";
import { registerHooks, stripTypeScriptTypes } from "node:module";

const isBundledTypeScript = (url) =>
  url.startsWith("file:") &&
  url.includes("/node_modules/") &&
  url.endsWith(".ts");

registerHooks({
  load(url, context, nextLoad) {
    if (!isBundledTypeScript(url)) return nextLoad(url, context);
    const source = stripTypeScriptTypes(readFileSync(new URL(url), "utf8"), {
      mode: "strip",
    });
    return { format: "module", shortCircuit: true, source };
  },
});
