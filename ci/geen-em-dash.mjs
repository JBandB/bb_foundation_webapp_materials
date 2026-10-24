/**
 * Nergens een em-dash, in geen enkel tekstbestand van deze repo. Gebruik een komma, dubbele punt,
 * haakjes of een nieuwe zin.
 *
 *   node ci/geen-em-dash.mjs
 */
import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { root } from "./template.mjs";

const EM_DASH = String.fromCodePoint(0x2014);
const SKIP = new Set([".git", ".template", "node_modules", "test-results"]);
const TEXT = new Set([".html", ".js", ".mjs", ".json", ".md", ".ps1", ".sh", ".svg", ".txt", ".yml", ".yaml"]);

function* files(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (TEXT.has(extname(entry.name)) || entry.name === ".gitignore" || entry.name === ".gitattributes") yield path;
  }
}

const hits = [];
let count = 0;
for (const path of files(root)) {
  count += 1;
  readFileSync(path, "utf8")
    .split("\n")
    .forEach((line, index) => {
      if (line.includes(EM_DASH)) hits.push(`${relative(root, path)}:${index + 1}`);
    });
}

if (hits.length > 0) {
  console.error(`Em-dash gevonden:\n  ${hits.join("\n  ")}`);
  process.exit(1);
}
console.log(`Geen em-dash in ${count} bestanden.`);
