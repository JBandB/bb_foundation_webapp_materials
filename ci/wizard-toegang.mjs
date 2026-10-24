/**
 * De accounts van de wizard op de site beheren: wizard/toegang.js. Een drempel, geen beveiliging;
 * zie README.md, Inloggen.
 *
 *   node ci/wizard-toegang.mjs                    de lijst
 *   node ci/wizard-toegang.mjs nieuw [naam]       een account; zonder naam de volgende deelnemer-NN
 *   node ci/wizard-toegang.mjs uit <naam>         zet een account uit; die is bij de volgende pagina uitgelogd
 *   node ci/wizard-toegang.mjs aan <naam>         zet een account weer aan
 *   node ci/wizard-toegang.mjs wachtwoord <naam>  een nieuw wachtwoord
 *   node ci/wizard-toegang.mjs verwijder <naam>   haalt een account weg
 *
 * Een nieuw wachtwoord staat één keer in de terminal en nergens anders: geef het door aan de
 * deelnemer en plak het nooit in een chat. Een naam is een code (kleine letters, cijfers en
 * koppeltekens), nooit een naam of een mailadres, want wizard/toegang.js is openbaar. Wie welke
 * code heeft, houd je bij buiten de repo.
 *
 * Na elke wijziging commit en push je; na de merge geldt het op de site.
 */
import { pbkdf2Sync, randomBytes, randomInt } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const FILE = join(root, "wizard", "toegang.js");
const NAME = /^[a-z][a-z0-9-]{2,39}$/;
/* Zonder letters en cijfers die op elkaar lijken: geen l, 1, o, 0 en i. */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

function read() {
  const text = readFileSync(FILE, "utf8");
  const match = /window\.WIZARD_TOEGANG = (\{[\s\S]*\});\s*$/.exec(text);
  if (match === null) throw new Error(`${FILE} heeft niet de vorm window.WIZARD_TOEGANG = { ... };`);
  return { head: text.slice(0, match.index), list: JSON.parse(match[1]) };
}
function write(head, list) {
  const line = (account) => `{ ${["naam", "actief", "zout", "hash"].map((key) => `${JSON.stringify(key)}: ${JSON.stringify(account[key])}`).join(", ")} }`;
  const accounts = list.accounts.length ? `[\n    ${list.accounts.map(line).join(",\n    ")}\n  ]` : "[]";
  writeFileSync(FILE, `${head}window.WIZARD_TOEGANG = {\n  "versie": 1,\n  "iteraties": ${list.iteraties},\n  "accounts": ${accounts}\n};\n`, "utf8");
}
function password() {
  const chars = Array.from({ length: 16 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return chars.match(/.{4}/g).join("-");
}
function credentials(iterations) {
  const plain = password();
  const salt = randomBytes(16);
  return { plain, zout: salt.toString("base64"), hash: pbkdf2Sync(plain, salt, iterations, 32, "sha256").toString("base64") };
}
function nextName(accounts) {
  const numbers = accounts.map((a) => /^deelnemer-(\d+)$/.exec(a.naam)).filter(Boolean).map((m) => Number(m[1]));
  return `deelnemer-${String((numbers.length ? Math.max(...numbers) : 0) + 1).padStart(2, "0")}`;
}
function done() {
  console.log("wizard/toegang.js bijgewerkt. Commit en push; na de merge geldt het op de site.");
  return 0;
}
function list(accounts) {
  if (!accounts.length) {
    console.log("Geen accounts: de wizard vraagt niet om in te loggen.");
    return;
  }
  for (const a of accounts) console.log(`${a.actief ? "aan" : "uit"}  ${a.naam}`);
  console.log(`\n${accounts.filter((a) => a.actief).length} van ${accounts.length} aan.`);
}

const [command, argument] = process.argv.slice(2);
const { head, list: data } = read();
const find = (name) => data.accounts.find((a) => a.naam === name);
const fail = (message) => {
  console.error(message);
  process.exit(1);
};

if (command === undefined || command === "lijst") {
  list(data.accounts);
  process.exit(0);
}
if (command === "nieuw") {
  const name = argument ?? nextName(data.accounts);
  if (!NAME.test(name)) fail(`Ongeldige naam: ${name}. Gebruik een code van kleine letters, cijfers en koppeltekens, zoals deelnemer-07.`);
  if (find(name)) fail(`${name} bestaat al. Een nieuw wachtwoord: wachtwoord ${name}.`);
  const made = credentials(data.iteraties);
  data.accounts.push({ naam: name, actief: true, zout: made.zout, hash: made.hash });
  write(head, data);
  console.log(`Account ${name} staat aan.\n\n  Gebruikersnaam: ${name}\n  Wachtwoord:     ${made.plain}\n\nDit wachtwoord zie je maar één keer. Geef het door aan de deelnemer, niet via een chat met Claude.\n`);
  process.exit(done());
}
if (command === "wachtwoord") {
  const account = find(argument);
  if (!account) fail(`Onbekend account: ${argument ?? "(geen naam)"}.`);
  const made = credentials(data.iteraties);
  Object.assign(account, { zout: made.zout, hash: made.hash });
  write(head, data);
  console.log(`Nieuw wachtwoord voor ${account.naam}: ${made.plain}\n\nNa de merge werkt het oude niet meer, en wie ermee ingelogd was, is bij de volgende pagina uitgelogd.\n`);
  process.exit(done());
}
if (command === "uit" || command === "aan") {
  const account = find(argument);
  if (!account) fail(`Onbekend account: ${argument ?? "(geen naam)"}.`);
  account.actief = command === "aan";
  write(head, data);
  console.log(`${account.naam} staat ${command}.`);
  process.exit(done());
}
if (command === "verwijder") {
  if (!find(argument)) fail(`Onbekend account: ${argument ?? "(geen naam)"}.`);
  data.accounts = data.accounts.filter((a) => a.naam !== argument);
  write(head, data);
  console.log(`${argument} is verwijderd.${data.accounts.length ? "" : " Er zijn geen accounts meer: de wizard vraagt niet meer om in te loggen."}`);
  process.exit(done());
}
fail(`Onbekende opdracht: ${command}. Kies uit lijst, nieuw, uit, aan, wachtwoord, verwijder.`);
