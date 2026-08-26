import * as ts from "npm:typescript@5.7.3";
const ROOT = new URL(".", import.meta.url).pathname;
const src = await Deno.readTextFile(ROOT + "public/app.ts");
const out = ts.transpile(src, {
  target: ts.ScriptTarget.ES2020,
  module: ts.ModuleKind.ESNext,
  removeComments: false,
  strict: false,
});
await Deno.writeTextFile(ROOT + "public/app.js", out);
console.log("built public/app.js from public/app.ts");
