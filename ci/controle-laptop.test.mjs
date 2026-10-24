/**
 * De controlescripts in wizard/ draaien op een laptop waar het template nog niet staat, dus ze kunnen
 * package.json niet lezen en noemen de versies van Node.js en pnpm zelf. Deze test bewijst dat die
 * gelijk lopen met package.json van het template op de versie uit template.json, en dat het
 * PowerShell-script alleen ASCII bevat: Windows PowerShell 5.1 leest een bestand zonder BOM als
 * Windows-1252.
 *
 *   node --test ci/controle-laptop.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { root, templateDir } from "./template.mjs";

const pkg = JSON.parse(readFileSync(join(templateDir(), "package.json"), "utf8"));
const nodeMajor = /^(\d+)/.exec(pkg.engines?.node ?? "")?.[1];
const pnpmVersion = /^pnpm@(\d+\.\d+\.\d+)/.exec(pkg.packageManager ?? "")?.[1];

const read = (rel) => readFileSync(join(root, rel), "utf8").replace(/\r\n/g, "\n");
const ps1 = read("wizard/controle-laptop.ps1");
const sh = read("wizard/controle-laptop.sh");

describe("controlescripts voor de laptop", () => {
  it("package.json van het template noemt een Node- en een pnpm-versie", () => {
    assert.ok(nodeMajor);
    assert.ok(pnpmVersion);
  });

  it("noemen dezelfde Node-versie als het template", () => {
    assert.ok(ps1.includes(`$NodeMajor = ${nodeMajor}\n`), `controle-laptop.ps1 noemt niet $NodeMajor = ${nodeMajor}`);
    assert.ok(sh.includes(`NODE_MAJOR=${nodeMajor}\n`), `controle-laptop.sh noemt niet NODE_MAJOR=${nodeMajor}`);
  });

  it("noemen dezelfde pnpm-versie als het template", () => {
    assert.ok(ps1.includes(`$PnpmVersion = '${pnpmVersion}'\n`), `controle-laptop.ps1 noemt niet $PnpmVersion = '${pnpmVersion}'`);
    assert.ok(sh.includes(`PNPM_VERSION=${pnpmVersion}\n`), `controle-laptop.sh noemt niet PNPM_VERSION=${pnpmVersion}`);
  });

  it("het PowerShell-script bevat alleen ASCII", () => {
    assert.deepEqual([...ps1].filter((char) => char.charCodeAt(0) > 127), []);
  });
});
