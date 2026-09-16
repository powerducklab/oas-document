import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css", ".html"]);
const excluded = new Set(["node_modules", ".git", "dist", "coverage"]);
const violations = [];
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await scan(path);
    else if (extensions.has(extname(path))) {
      const lines = (await readFile(path, "utf8")).split("\n");
      lines.forEach((line, index) => {
        if (/\p{Script=Han}/u.test(line)) violations.push(`${path}:${index + 1}`);
      });
    }
  }
}
await scan(".");
if (violations.length) {
  console.error(`Non-English source text found:\n${violations.join("\n")}`);
  process.exitCode = 1;
} else console.log("English-only source check passed.");
