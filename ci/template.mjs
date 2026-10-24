/**
 * Het template waar deze wizard bij hoort, op de versie uit template.json. De rooktest haalt er de
 * validator, de lijst met verboden woorden, de modules en de versies van Node en pnpm uit. Zo is
 * project.config.json het contract tussen de twee repo's, en ziet de CI het hier als een release
 * van het template de wizard breekt.
 *
 * Standaard een kloon in .template/ (staat niet in git), op de tag uit template.json. Wie tegen een
 * werkkopie van het template wil testen, zet TEMPLATE_DIR op die map.
 *
 *   node ci/template.mjs        haalt het template op en zegt welke versie er staat
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const root = fileURLToPath(new URL("..", import.meta.url));
export const pin = JSON.parse(readFileSync(join(root, "template.json"), "utf8"));

function versionAt(dir) {
  const manifest = join(dir, "template", "manifest.json");
  if (!existsSync(manifest)) return undefined;
  return JSON.parse(readFileSync(manifest, "utf8")).version;
}

/** De map van het template: TEMPLATE_DIR, of een kloon van de vastgezette tag in .template/. */
export function templateDir() {
  const wanted = pin.tag.replace(/^v/, "");
  const fromEnv = process.env.TEMPLATE_DIR;
  if (fromEnv !== undefined && fromEnv !== "") {
    const dir = resolve(fromEnv);
    const version = versionAt(dir);
    if (version === undefined) throw new Error(`TEMPLATE_DIR wijst niet naar een template: ${dir}`);
    if (version !== wanted) console.log(`Let op: TEMPLATE_DIR staat op v${version}, template.json noemt ${pin.tag}.`);
    return dir;
  }
  const dir = join(root, ".template");
  if (!existsSync(dir)) {
    const clone = spawnSync("git", ["clone", "--quiet", "--depth", "1", "--branch", pin.tag, pin.repo, dir], { stdio: "inherit" });
    if (clone.status !== 0) throw new Error(`Het template ${pin.tag} ophalen lukte niet. Bestaat de tag op ${pin.repo}?`);
  }
  const version = versionAt(dir);
  if (version !== wanted) throw new Error(`.template staat op v${version}, template.json noemt ${pin.tag}. Verwijder de map .template en draai opnieuw.`);
  return dir;
}

/** Een opdracht van de template-tooling, met de tsx van deze repo: het template hoeft niet geïnstalleerd. */
export function runTemplate(dir, args) {
  const tsx = join(root, "node_modules", "tsx", "dist", "cli.mjs");
  return spawnSync(process.execPath, [tsx, join(dir, "template", "cli", "main.ts"), ...args], { cwd: dir, encoding: "utf8" });
}

/** De modules uit het manifest van het template: wat te kiezen is en wat gereserveerd is. */
export function templateModules(dir) {
  const manifest = JSON.parse(readFileSync(join(dir, "template", "manifest.json"), "utf8"));
  const entries = Object.entries(manifest.modules);
  return {
    available: entries.filter(([, module]) => module.always !== true && module.status !== "reserved").map(([name]) => name),
    reserved: entries.filter(([, module]) => module.status === "reserved").map(([name]) => name),
  };
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = templateDir();
  console.log(`Template v${versionAt(dir)} in ${dir}`);
}
