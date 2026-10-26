/**
 * De rooktest van de wizard: opent wizard/index.html vanaf file:// in een echte browser en loopt de
 * drie delen door met de casus van de kinderboerderij.
 *
 * Eerst het contract met het template op de versie uit template.json (ci/template.mjs): elke module
 * die de wizard aanbiedt, is in het template te kiezen, en wat de wizard "later" noemt, is daar nog
 * gereserveerd. Een module die het template wel heeft en de wizard niet aanbiedt, staat erbij als
 * mededeling: dat kan een keuze zijn, zoals ai, dat pas op dag 2 komt.
 *
 *   Deel A  het welkom met de drie delen, een stap met een schermafbeelding en kaders, en de halve
 *           pagina, die meteen de velden van deel B vult.
 *   Deel B  de acht stappen, met de antwoorden uit deel A al ingevuld. Het eindscherm heeft één
 *           knop die de startprompt kopieert (en een terugval als het klembord niet mag), en de
 *           losse bestanden onder "Reserve".
 *   Deel C  de acht stappen van de dag, met de startprompt in stap 3.
 *
 * De uitvoer moet kloppen: project.config.json haalt de validator van het template, het projectplan
 * heeft de twaalf kopjes, de checklist draagt de slug, de startprompt bevat alle drie de bestanden
 * letterlijk in een codeblok met een afbakening die niet in de inhoud voorkomt, nergens een em-dash
 * en geen woord uit de lijst met verboden woorden van het template (template/ci/forbidden-words.txt):
 * de wizard draagt de huisstijl van de organisatie achter het template, maar wat hij oplevert is
 * neutraal. Verder: de oude
 * voorbereidingspagina stuurt door, de oude opslag wordt overgenomen, de ingebedde manifest is gelijk
 * aan wizard/schermen.json, op telefoonbreedte schuift niets opzij, en de browser logde geen fout.
 *
 * Daarna de feedbackpagina, de labels naar dag 2, en wizard/workshop-2.html voor de tweede dag: het
 * huiswerk komt in deel C, de instructie volgt de opbouw van de stap prompting, de rekenhulp rekent
 * zonder ingebouwde prijzen, de opdrachten zijn neutraal, en de geheimenwacht houdt een sleutel tegen. Als laatste het inlogscherm, op een
 * nagebootste site: vanaf file:// is er geen inlog, en dat bewijzen alle tests hiervoor.
 *
 *   node ci/wizard-smoke.mjs           draait en ruimt op
 *   node ci/wizard-smoke.mjs --keep    laat de downloads staan om erin te kijken
 *
 * Tegen een werkkopie van het template in plaats van de vastgezette tag: zet TEMPLATE_DIR op die map.
 *
 * Vraagt een geïnstalleerde Chromium: pnpm exec playwright install chromium. Lukt die download niet
 * (een proxy, geen internet), zet dan WIZARD_BROWSER op het pad van een chrome.exe of
 * chrome-headless-shell die er al staat; de test gebruikt dan die.
 */

import { pbkdf2Sync, randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import { pin, root, runTemplate, templateDir, templateModules } from "./template.mjs";

const tpl = templateDir();
const keep = process.argv.includes("--keep");
const EM_DASH = String.fromCodePoint(0x2014);
const out = mkdtempSync(join(tmpdir(), "wizard-smoke-"));
const problems = [];
const browserErrors = [];
const FORBIDDEN = readFileSync(join(tpl, "template", "ci", "forbidden-words.txt"), "utf8")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line !== "" && !line.startsWith("#"));

function check(ok, message) {
  if (!ok) problems.push(message);
  console.log(`${ok ? "ok " : "NEE"}  ${message}`);
}

// Het contract met het template: de modules van de wizard tegen het manifest.
{
  const source = readFileSync(join(root, "wizard", "index.html"), "utf8");
  const offered = Object.keys(JSON.parse(`{${/const MODULES = \{([^}]*)\}/.exec(source)?.[1] ?? ""}}`.replace(/([{,]\s*)([a-z][a-z-]*)\s*:/g, '$1"$2":')));
  const later = [.../const RESERVED = \[([\s\S]*?)\n\s*\];/.exec(source)?.[1].matchAll(/^\s*\["([a-z-]+)"/gm) ?? []].map((match) => match[1]);
  const modules = templateModules(tpl);
  console.log(`Template ${pin.tag}: te kiezen ${modules.available.join(", ")}; gereserveerd ${modules.reserved.join(", ")}.`);
  check(offered.length > 0 && offered.every((name) => modules.available.includes(name)), `contract: elke module van de wizard is te kiezen in het template (${offered.join(", ")})`);
  check(later.length > 0 && later.every((name) => modules.reserved.includes(name)), `contract: wat de wizard "later" noemt, is gereserveerd in het template (${later.join(", ")})`);
  const notOffered = modules.available.filter((name) => !offered.includes(name));
  if (notOffered.length > 0) console.log(`  --   niet in de wizard van dag 1: ${notOffered.join(", ")}`);
}

/** De casus: één fictieve kinderboerderij, dezelfde als in de voorbeelden van de wizard. */
const CASE = {
  name: "Rooster De Weide",
  description: "Het vrijwilligersrooster van kinderboerderij De Weide: wie staat wanneer, en wie valt in.",
  organisation: "Kinderboerderij De Weide",
  domain: "deweide.example",
  owner: "Anna, de coördinator van de vrijwilligers",
  slug: "rooster-de-weide",
  /* De halve pagina uit deel A: deze vijf teksten en het aantal mensen komen vanzelf in deel B. */
  halfPage: {
    "hp-why": "Het rooster staat in een spreadsheet die drie mensen tegelijk bewerken. Elke week valt er een dienst uit.",
    "hp-processes": "Een dienst vullen: 1. de coördinator maakt de diensten aan; 2. vrijwilligers schrijven zich in; 3. wie past krijgt een mail.",
    "hp-sensitive": "Telefoonnummers van vrijwilligers; een vrijwilliger ziet die van anderen niet.",
    "hp-success": "De coördinator stuurt geen rooster meer per mail, en elke dienst van de komende maand heeft een naam.",
    "hp-not": "Geen urenregistratie, geen onkosten, geen app in de winkels.",
  },
  /* Wat in deel B, stap 3 nog bij komt. */
  content: {
    "t-concepts": "Een dienst is een dagdeel op een locatie met een gewenst aantal mensen. Een inschrijving koppelt een vrijwilliger aan een dienst.",
    "t-rules": "P1: een vrijwilliger kan niet op twee diensten tegelijk staan. P2: een dienst in het verleden verandert niet meer.",
    /* Drie backticks op een eigen regel: de startprompt moet het plan dan met een langere afbakening insluiten. */
    "t-not": "Geen urenregistratie, geen onkosten, geen app in de winkels.\n```\nOok geen codeblok in dit veld.\n```",
  },
};

const executablePath = process.env.WIZARD_BROWSER;
let browser;
try {
  browser = await chromium.launch(executablePath === undefined || executablePath === "" ? {} : { executablePath });
  const context = await browser.newContext({ acceptDownloads: true, locale: "nl-NL", timezoneId: "Europe/Amsterdam", viewport: { width: 1280, height: 900 } });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  const index = pathToFileURL(join(root, "wizard", "index.html")).href;
  await page.goto(index);
  const heading = page.locator("#step-heading");
  /* Wacht tot de kop de verwachte tekst heeft: een wissel van deel via het adres tekent net na de klik. */
  const settle = (target, expected) => target.waitForFunction((value) => (document.getElementById("step-heading")?.textContent ?? "").trim().startsWith(value), expected, { timeout: 5_000 }).catch(() => undefined);
  const headingIs = async (expected, label) => {
    await heading.waitFor({ state: "visible" });
    await settle(page, expected);
    const text = (await heading.textContent())?.trim() ?? "";
    check(text.startsWith(expected), `${label ?? `door naar "${expected}"`} (kop: ${text})`);
  };
  const next = async (expected) => {
    await page.getByRole("button", { name: "Volgende", exact: true }).click();
    await headingIs(expected);
  };
  const partMeta = async (letter) => (await page.locator("a.part").filter({ hasText: `Deel ${letter}` }).locator(".part-meta").textContent())?.trim() ?? "";

  // De ingebedde manifest is gelijk aan wizard/schermen.json, en elk plaatje bestaat.
  const manifest = JSON.parse(readFileSync(join(root, "wizard", "schermen.json"), "utf8"));
  const embedded = JSON.parse((await page.locator("#schermen").textContent()) ?? "{}");
  check(JSON.stringify(embedded) === JSON.stringify(manifest), "de ingebedde manifest is gelijk aan wizard/schermen.json (anders: node ci/schermen-opnemen.mjs inbedden)");
  const recorded = manifest.schermen.filter((screen) => screen.bestand);
  check(recorded.every((screen) => existsSync(join(root, "wizard", screen.bestand))), `elk opgenomen scherm heeft zijn plaatje (${recorded.length})`);
  check(manifest.schermen.every((screen) => screen.kaders.every((k) => [k.x, k.y, k.b, k.h].every((v) => typeof v === "number" && v >= 0 && v <= 100) && k.x + k.b <= 100.5 && k.y + k.h <= 100.5)), "elk kader ligt binnen het beeld");

  // Deel A: het welkom.
  await headingIs("Welkom", "het welkom van deel A staat open");
  check((await page.locator("#logo").getAttribute("src")) === "brand/logo-met-bi-wit.svg", "de kop van het welkom toont het logo met Business Intelligence");
  check((await page.locator("#logo").evaluate((img) => img.naturalWidth)) > 0, "het logo laadt vanaf file://");
  check((await page.locator("a.part").count()) === 3, "de navigatie heeft drie delen");
  check((await page.locator("link[rel=icon]").getAttribute("href")) === "brand/sublogo-vierkant-donker.svg", "het favicon is het vierkante sublogo");
  await page.getByRole("link", { name: "Begin met deel A" }).click();
  await headingIs("Stap 1 van 8", "deel A begint bij stap 1");
  check((await page.locator("#logo").getAttribute("src")) === "brand/logo-wit.svg", "na het welkom het logo zonder tagline");
  check((await page.locator("figure.shot, .shot-todo").count()) >= 2, "stap 1 toont schermafbeeldingen of een rustig kader");
  check((await page.locator(".shot-todo").count()) === 0 || ((await page.locator(".shot-todo strong").first().textContent()) === "Waar je klikt" && (await page.locator(".shot-todo li").count()) > 0), "een scherm zonder plaatje toont het klikpad in tekst");
  await page.getByLabel("Deze stap is klaar").check();
  check((await partMeta("A")).startsWith("1 van 8 klaar"), `het vinkje telt mee in de navigatie (${await partMeta("A")})`);

  // Deel A, stap 2: een plaatje met kaders die meeschalen.
  await next("Stap 2 van 8");
  const figure = page.locator("figure.shot").filter({ has: page.locator(".kader") }).first();
  check((await figure.count()) === 1, "stap 2 heeft een schermafbeelding met een kader");
  if ((await figure.count()) === 1) {
    const img = figure.locator("img");
    await img.evaluate((el) => (el.complete ? null : new Promise((resolve) => el.addEventListener("load", resolve, { once: true }))));
    check((await img.evaluate((el) => el.naturalWidth)) === 1280, "het plaatje laadt en is 1280 breed");
    const frame = await img.boundingBox();
    const box = await figure.locator(".kader").first().boundingBox();
    const inside = frame !== null && box !== null && box.width > 4 && box.x >= frame.x - 4 && box.x + box.width <= frame.x + frame.width + 4 && box.y >= frame.y - 4 && box.y + box.height <= frame.y + frame.height + 4;
    check(inside, "het kader ligt op het plaatje");
    check(((await figure.locator(".kader-label").first().textContent()) ?? "").length > 0, "het kader heeft een label");
    check(((await figure.locator("figcaption").textContent()) ?? "").includes("Stand van"), "het bijschrift noemt de stand van de opname");
  }

  // Deel A, stap 6: de halve pagina vult deel B.
  await page.goto(`${index}#voorbereiden-6`);
  await headingIs("Stap 6 van 8", "de halve pagina opent via het adres");
  for (const [id, text] of Object.entries(CASE.halfPage)) await page.fill(`#${id}`, text);
  await page.fill("#hp-count", "45");
  await page.check("#hp-audience-0");

  // Deel A, stap 7: de huisstijl in Claude, met de vraag voor het blok.
  await page.goto(`${index}#voorbereiden-7`);
  await headingIs("Stap 7 van 8: Je huisstijl in Claude", "de huisstijl in Claude opent via het adres");
  const designText = (await page.locator("main").textContent()) ?? "";
  check(designText.includes('"primary": ""') && designText.includes('"darkMode": ""'), "stap 7 geeft de vraag voor het blok met de vaste sleutels");
  check((await page.locator('a[href*="support.claude.com"]').count()) >= 1 && (await page.locator('a[href*="claude.ai/design"]').count()) === 0, "stap 7 linkt naar de uitleg van Anthropic, niet naar het oude adres");

  // Deel B.
  await page.getByRole("link", { name: /Je tool ontwerpen/ }).click();
  await headingIs("Je tool ontwerpen", "deel B opent via de navigatie");
  check(await page.getByText("Je halve pagina uit deel A staat al in stap 2 en 3").isVisible(), "deel B ziet de halve pagina");
  await page.getByRole("button", { name: "Begin", exact: true }).click();
  await headingIs("Stap 1 van 8");

  // Stap 1: projectbasis. Geen tenant, dus wachtwoordlogin en SMTP.
  await page.fill("#f-name", CASE.name);
  check((await page.inputValue("#f-slug")) === CASE.slug, "de slug volgt de naam");
  await page.fill("#f-description", CASE.description);
  await page.fill("#f-org", CASE.organisation);
  await page.fill("#f-domain", CASE.domain);
  await page.fill("#f-owner", CASE.owner);
  await page.check("#f-m365-1");
  await page.check("#f-mfa-0");
  await next("Stap 2");

  // Stap 2: rollen en mensen. Het aantal komt uit de halve pagina.
  check((await page.inputValue("#f-count")) === "45", "het aantal mensen staat er al, uit deel A");
  await page.fill("#r-1-nl", "Coördinator");
  await page.fill("#r-1-en", "Coordinator");
  check((await page.inputValue("#r-1-value")) === "coordinator", "de rolwaarde volgt het label, zonder trema");
  await page.fill("#r-1-who", "de twee coördinatoren");
  await page.fill("#r-1-may", "diensten plannen en alle vrijwilligers zien");
  await page.fill("#r-1-maynot", "niemand verwijderen");
  await page.getByRole("button", { name: "Rol toevoegen" }).click();
  await page.fill("#r-2-nl", "Vrijwilliger");
  await page.fill("#r-2-en", "Volunteer");
  await page.fill("#r-2-value", "volunteer");
  await next("Stap 3");

  // Stap 3: de inhoud, met de halve pagina al ingevuld.
  check((await page.inputValue("#t-why")) === CASE.halfPage["hp-why"], "het doel staat er al, uit deel A");
  check((await page.inputValue("#t-sensitive")) === CASE.halfPage["hp-sensitive"], "de gevoelige gegevens staan er al, uit deel A");
  check((await page.inputValue("#t-success")) === CASE.halfPage["hp-success"], "wanneer geslaagd staat er al, uit deel A");
  for (const [id, text] of Object.entries(CASE.content)) await page.fill(`#${id}`, text);
  await next("Stap 4");

  // Stap 4: modules. Berichten staat vast aan door de wachtwoordlogin; Graph is niet te kiezen zonder tenant.
  check(await page.isChecked("#m-messaging"), "berichten staat aan door de wachtwoordlogin");
  check(await page.isChecked("#m-jobs"), "achtergrondwerk staat aan door berichten");
  check(await page.isDisabled("#m-transport-0"), "Graph is zonder tenant niet te kiezen");
  check(await page.isChecked("#m-transport-1"), "SMTP is het transport");
  await page.check("#m-files");
  await page.check("#m-azure-1");
  await page.fill("#m-retention", "Tot een jaar nadat de vrijwilliger is gestopt.");
  await next("Stap 5");

  // Stap 5: accounts en budget, voor de diensten die bij deze keuzes horen.
  await page.check("#f-commercial-1");
  await page.fill("#f-budget", "15");
  const split = { github: "0", vercel: "0", neon: "0", azure: "5", mail: "5" };
  for (const [key, euros] of Object.entries(split)) {
    await page.check(`#a-${key}-exists-0`);
    await page.check(`#a-${key}-owner-0`);
    await page.fill(`#a-${key}-admin`, "Anna");
    await page.fill(`#b-${key}`, euros);
  }
  check((await page.locator("#a-m365-admin").count()) === 0, "Microsoft 365 staat niet tussen de diensten zonder tenant");
  await next("Stap 6");

  // Stap 6: huisstijl van het project, met de standaardkleuren.
  check((await page.inputValue("#f-short")) === CASE.name, "de korte naam volgt de naam");
  check((await page.locator("#contrast li.pass").count()) >= 8, "de standaardkleuren halen het contrast");
  // Het blok uit een design system: met tekst en code-fences eromheen, een ongeldige kleur, en round.
  await page.fill("#f-ds-block", 'Hier is het blok:\n\`\`\`json\n{"name": "Huisstijl De Weide", "primary": "#1f5c8a", "accent": "c2410c", "surface": "#f8f6f1", "warning": "oranje", "radius": "round", "darkMode": "auto"}\n\`\`\`');
  await page.click("#f-ds-read");
  check((await page.inputValue("#c-primary")) === "#1f5c8a" && (await page.inputValue("#c-accent")) === "#c2410c" && (await page.inputValue("#c-surface")) === "#f8f6f1", "het blok vult de kleuren in, ook een hexcode zonder #");
  check(await page.isChecked("#f-radius-1"), "round uit het design system wordt zachte hoeken");
  check(((await page.textContent("#f-ds-err")) ?? "").includes("(warning)") && (await page.inputValue("#c-warning")) !== "oranje", "een ongeldige kleur wordt niet overgenomen en genoemd");
  check(((await page.textContent("#f-ds-status")) ?? "").includes("Huisstijl De Weide"), "de status noemt het design system");
  await page.fill("#f-ds-block", "geen blok");
  await page.click("#f-ds-read");
  check(((await page.textContent("#f-ds-err")) ?? "").includes("accolades") && (await page.inputValue("#c-primary")) === "#1f5c8a", "zonder blok verandert er niets en zegt de wizard waarom");
  await next("Stap 7");

  // Stap 7: één fase.
  await page.fill("#p-0-name", "Rooster en inschrijven");
  await page.fill("#p-0-contents", "De coördinator maakt diensten aan en vrijwilligers schrijven zich in.");
  await page.fill("#p-0-exit", "Elke dienst van de komende maand staat in de tool en invallen gaat via de tool.");
  await page.fill("#p-0-manual", "De gedeelde postbus en de ledenlijst.");
  await next("Stap 8");

  // Stap 8: één knop voor de startprompt, de losse bestanden als reserve.
  check((await page.locator("#review-errors").count()) === 0, "de controle vindt geen open punten");
  const copy = page.getByRole("button", { name: "Kopieer de startprompt" });
  check((await copy.count()) === 1 && (await copy.getAttribute("class"))?.includes("big") === true, "het eindscherm heeft één grote knop Kopieer de startprompt");
  check(!(await page.locator("#reserve").evaluate((el) => el.open)), "de losse bestanden staan ingeklapt onder Reserve");
  check((await page.getByRole("button", { name: /^Download / }).filter({ visible: true }).count()) === 0, "zonder uitklappen staat er geen downloadknop in beeld");
  const promptText = await page.inputValue("#prompt");
  await copy.click();
  await page.getByRole("button", { name: "Gekopieerd" }).waitFor({ state: "visible" });
  check(((await page.locator("#copy-status").textContent()) ?? "").startsWith("Gekopieerd"), "de knop bevestigt met Gekopieerd");
  /* Windows zet op het klembord CRLF; de inhoud telt, niet het regeleinde. */
  check((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, "\n") === promptText, "het klembord bevat de startprompt");

  // De terugval: mag het klembord niet, dan staat de tekst geselecteerd in het tekstvak.
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.reject(new Error("geweigerd")) } });
    document.execCommand = () => false;
  });
  await page.getByRole("button", { name: /Kopieer de startprompt|Gekopieerd/ }).click();
  await page.locator("#copy-status.bad").waitFor({ state: "visible" });
  const selection = await page.locator("#prompt").evaluate((el) => ({ open: el.closest("details").open, start: el.selectionStart, end: el.selectionEnd, length: el.value.length, focused: document.activeElement === el }));
  check(selection.open && selection.start === 0 && selection.end === selection.length && selection.focused, "zonder klembord staat de startprompt geselecteerd in een open tekstvak");

  // De reserve: vier losse bestanden.
  await page.locator("#reserve > summary").click();
  const files = {};
  const checklistName = `00-checklist-${CASE.slug}.md`;
  for (const name of ["project.config.json", "PROJECTPLAN.md", checklistName, "startprompt.md"]) {
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: `Download ${name}` }).click()]);
    const path = join(out, download.suggestedFilename());
    await download.saveAs(path);
    files[name] = readFileSync(path, "utf8");
    check(download.suggestedFilename() === name, `reserve: download ${name}`);
  }
  check(files["startprompt.md"] === promptText, "de download van de startprompt is gelijk aan wat de knop kopieert");

  // De configuratie door de validator van het template.
  const configPath = join(out, "project.config.json");
  const validate = runTemplate(tpl, ["validate", configPath]);
  check(validate.status === 0, `template:validate (${pin.tag}) op de uitvoer${validate.status === 0 ? "" : `:\n${validate.stdout}${validate.stderr}`}`);
  const config = JSON.parse(files["project.config.json"]);
  check(config.auth.provider === "password" && config.auth.password.mfaRequiredFor === "admins", "inlog: wachtwoord met tweestapsverificatie voor beheerders");
  check(JSON.stringify(config.modules) === JSON.stringify(["auth-password", "jobs", "messaging", "files"]), `modules: ${JSON.stringify(config.modules)}`);
  check(config.messaging.transport === "smtp", "transport smtp");
  check(config.auth.roles.map((role) => role.value).join(",") === "admin,coordinator,volunteer", "drie rollen in volgorde");
  check(config.project.systemEmail === `system@${CASE.domain}`, "systeemadres uit het maildomein");
  check(config.intake.budget.monthlyEuros === 15 && config.intake.accounts.length === 5, "de intake bewaart budget en accounts");
  check(config.intake.expectedUsers === 45 && config.intake.content.sensitive === CASE.halfPage["hp-sensitive"], "de intake bewaart de halve pagina");

  // Het projectplan, de checklist en de startprompt.
  const plan = files["PROJECTPLAN.md"];
  check(plan.includes("uit het design system \"Huisstijl De Weide\" in Claude"), "het projectplan noemt het design system bij de huisstijl");
  check(config.brand.colours.primary === "#1f5c8a" && config.brand.radius === "soft", "de configuratie neemt de kleuren en hoeken uit het design system over");
  const headings = (plan.match(/^## \d+\. /gm) ?? []).length;
  check(headings === 12, `het projectplan heeft twaalf kopjes (${headings})`);
  check(plan.includes("| Coördinator (`coordinator`) |") && plan.includes("P1: een vrijwilliger"), "het projectplan bevat de rollen en de regels");
  check(plan.includes("### Fase 1: Rooster en inschrijven"), "het projectplan bevat de fase");
  check(plan.includes(`gevoelig: ${CASE.halfPage["hp-sensitive"]}`), "het projectplan noemt de gevoelige gegevens bij de randvoorwaarden");
  const checklist = files[checklistName];
  check(checklist.includes(`\`${CASE.slug}\``) && checklist.includes("handleiding 05b") && checklist.includes("Transport SMTP"), "de checklist volgt de keuzes");
  check(!checklist.includes("Inloggen met Microsoft"), "de checklist slaat Entra over");
  const prompt = files["startprompt.md"];
  check(prompt.includes("pnpm template:apply") && prompt.includes("Git doe ik zelf"), "de startprompt noemt apply en laat git bij de mens");
  /** Het codeblok onder een kop "## Bestand n": de inhoud, en of de afbakening langer is dan elke reeks backticks erin. */
  const block = (n, info) => {
    const start = prompt.indexOf(`## Bestand ${n}:`);
    if (start === -1) return null;
    const match = new RegExp(`^(\`{3,})${info}\\n([\\s\\S]*?)\\n\\1$`, "m").exec(prompt.slice(start));
    if (match === null) return null;
    const longest = Math.max(0, ...(match[2].match(/`+/g) ?? []).map((run) => run.length));
    return { body: match[2], safe: match[1].length > longest };
  };
  const configBlock = block(1, "json");
  const planBlock = block(2, "markdown");
  const checklistBlock = block(3, "markdown");
  check(configBlock !== null && configBlock.body === files["project.config.json"].trimEnd(), "de startprompt bevat project.config.json letterlijk");
  check(planBlock !== null && planBlock.body === plan.trimEnd(), "de startprompt bevat het projectplan letterlijk");
  check(checklistBlock !== null && checklistBlock.body === checklist.trimEnd(), "de startprompt bevat de checklist letterlijk");
  check([configBlock, planBlock, checklistBlock].every((b) => b?.safe === true) && plan.includes("\n```\n"), "de afbakening komt niet in de inhoud voor, ook niet bij drie backticks in het plan");
  const opening = prompt.slice(0, prompt.indexOf("\n## "));
  check(opening.includes("`project.config.json` in de hoofdmap") && opening.includes("`docs/PROJECTPLAN.md`") && opening.includes(`\`docs/handleiding/${checklistName}\``), "de opening zegt waar alle drie de bestanden heen gaan");
  check(prompt.includes(`## Bestand 3: \`docs/handleiding/${checklistName}\``), "de checklist is bestand 3, met zijn pad");
  for (const [name, text] of Object.entries(files)) {
    check(!text.includes(EM_DASH), `geen em-dash in ${name}`);
    const hits = FORBIDDEN.filter((word) => text.toLowerCase().includes(word.toLowerCase()));
    check(hits.length === 0, `${name} is neutraal: geen woord uit forbidden-words.txt${hits.length ? ` (${hits.join(", ")})` : ""}`);
  }

  // Deel C.
  await page.getByRole("button", { name: "Door naar deel C: live zetten" }).click();
  await headingIs("Stap 1 van 8: GitHub", "deel C begint bij stap 1, Use this template");
  check((await page.locator("#steps li").count()) === 8, "deel C heeft acht stappen");
  await page.locator("#steps a").nth(2).click();
  await headingIs("Stap 3 van 8", "stap 3 opent via de stappen");
  check((await page.getByRole("button", { name: "Kopieer de startprompt" }).count()) === 1, "deel C, stap 3 biedt de startprompt aan");
  check(((await page.locator("main").textContent()) ?? "").includes(`docs/handleiding/${checklistName}`), "deel C, stap 3 noemt de drie bestanden");
  await page.locator("#steps a").nth(6).click();
  await headingIs("Stap 7 van 8", "stap 7 opent via de stappen");
  check(((await page.locator("main").textContent()) ?? "").includes(".env.eerste-account"), "stap 7 maakt de eerste beheerder via .env.eerste-account");

  // Herladen: de antwoorden staan er nog en deel B biedt aan verder te gaan.
  await page.goto(`${index}#ontwerpen`);
  await page.reload();
  await headingIs("Je tool ontwerpen", "na herladen opent deel B");
  check(await page.getByRole("button", { name: "Verder bij stap 8" }).isVisible(), "na herladen gaat deel B verder bij stap 8");
  await page.getByRole("button", { name: "Verder bij stap 8" }).click();
  await headingIs("Stap 8", "stap 8 staat na herladen weer open");
  check((await partMeta("B")).startsWith("klaar"), `deel B telt als klaar in de navigatie (${await partMeta("B")})`);
  check((await page.evaluate(() => JSON.parse(window.localStorage.getItem("foundation-wizard:v1") ?? "{}").project?.name)) === CASE.name, "deel B bewaart onder de bestaande sleutel foundation-wizard:v1");

  // Telefoonbreedte: niets schuift opzij.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const hash of ["#voorbereiden", "#voorbereiden-2", "#ontwerpen", "#live-3"]) {
    await page.goto(`${index}${hash}`);
    await heading.waitFor({ state: "visible" });
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    check(width <= 390, `op 390 breed geen horizontale scroll bij ${hash} (${width})`);
  }
  await page.setViewportSize({ width: 1280, height: 900 });

  // De oude voorbereidingspagina stuurt door.
  await page.goto(pathToFileURL(join(root, "wizard", "voorbereiding.html")).href);
  await page.waitForURL(/index\.html#voorbereiden(?:-\d)?$/, { timeout: 10_000 }).catch(() => undefined);
  check(/index\.html#voorbereiden(?:-\d)?$/.test(page.url()), `voorbereiding.html stuurt door naar index.html#voorbereiden (${page.url().split("/").pop()})`);

  // De oude opslag van de voorbereidingspagina: vinkjes en halve pagina komen mee.
  const fresh = await browser.newContext({ locale: "nl-NL" });
  const legacy = await fresh.newPage();
  legacy.on("pageerror", (error) => browserErrors.push(error.message));
  await legacy.goto(index);
  await legacy.evaluate(() => {
    window.localStorage.clear();
    window.localStorage.setItem("foundation-voorbereiding:v1", JSON.stringify({ version: 1, step: 3, done: { 1: true, 2: true }, answers: { 1: "Een rooster voor de stal.", 2: "Zo'n 30 vrijwilligers.", 6: "Geen app." } }));
  });
  await legacy.goto(`${index}#voorbereiden`);
  await legacy.reload();
  const legacyMeta = (await legacy.locator("a.part").filter({ hasText: "Deel A" }).locator(".part-meta").textContent())?.trim() ?? "";
  check(legacyMeta.startsWith("2 van 8 klaar"), `de vinkjes van de oude voorbereidingspagina komen mee (${legacyMeta})`);
  await legacy.goto(`${index}#voorbereiden-6`);
  check((await legacy.inputValue("#hp-why")).startsWith("Een rooster voor de stal.") && (await legacy.inputValue("#hp-count")) === "30" && (await legacy.inputValue("#hp-not")) === "Geen app.", "de oude halve pagina komt in de velden van deel B");
  await fresh.close();
  const sevenContext = await browser.newContext({ locale: "nl-NL" });
  const seven = await sevenContext.newPage();
  await seven.goto(index);
  await seven.evaluate(() => {
    window.localStorage.clear();
    window.localStorage.setItem("foundation-wizard-delen:v1", JSON.stringify({ version: 1, part: "voorbereiden", prep: { step: 7, done: { 1: true, 6: true, 7: true } }, live: { step: 0, done: {} } }));
  });
  await seven.reload();
  check((((await seven.locator("#step-heading").textContent()) ?? "").trim()).startsWith("Stap 8 van 8: Klaar"), "een bewaarde stand van zeven stappen opent op Klaar, nu stap 8");
  check((((await seven.locator("a.part").filter({ hasText: "Deel A" }).locator(".part-meta").textContent()) ?? "").trim()).startsWith("3 van 8 klaar"), "en houdt zijn drie vinkjes");
  await seven.goto(`${index}#voorbereiden-7`);
  check(!(await seven.getByLabel("Deze stap is klaar").isChecked()), "de nieuwe stap 7 staat niet vanzelf aangevinkt");
  await sevenContext.close();

  /*
   * De feedbackpagina: vanaf de wizard bereikbaar, weigert leeg te versturen, en zet een issue klaar
   * met titel en tekst. window.open wordt afgevangen, zodat de test GitHub niet echt opent.
   */
  check((await page.locator('a[href="feedback.html"]').count()) > 0, "de wizard linkt naar de feedbackpagina");
  const feedback = await context.newPage();
  feedback.on("pageerror", (error) => browserErrors.push(`feedback: ${error.message}`));
  await feedback.addInitScript(() => {
    window.__opened = [];
    window.open = (url) => { window.__opened.push(String(url)); return null; };
  });
  await feedback.goto(pathToFileURL(join(root, "wizard", "feedback.html")).href);
  check((await feedback.locator(".warn").textContent())?.includes("openbaar") === true, "de feedbackpagina zegt vooraf dat het openbaar is");
  await feedback.click("button[type=submit]");
  check((await feedback.getAttribute("#beter", "aria-invalid")) === "true", "leeg versturen wordt geweigerd");
  await feedback.check("#o-wizard", { force: true });
  await feedback.click("label[for=c-8]");
  check(await feedback.isChecked("#c-8"), "een cijfer kies je door erop te klikken");
  await feedback.fill("#beter", "Stap 4 & 5 + de kaders: graag groter.");
  await feedback.click("button[type=submit]");
  const opened = await feedback.evaluate(() => window.__opened);
  const issueUrl = opened[0] ?? "";
  check(issueUrl.startsWith("https://github.com/JBandB/bb_foundation_webapp_materials/issues/new?"), "versturen zet een issue klaar in de repo van het lesmateriaal, niet in die van het template");
  const params = new URL(issueUrl || "https://x.invalid").searchParams;
  check((params.get("title") ?? "").startsWith("[Feedback] De wizard"), "de titel begint met [Feedback] en het onderwerp");
  check((params.get("body") ?? "").includes("**Cijfer:** 8") && (params.get("body") ?? "").includes("Stap 4 & 5 + de kaders: graag groter."), "de tekst bevat cijfer en feedback, met & en + intact");
  check(!issueUrl.includes("+"), "spaties staan als %20 in het adres, niet als +");
  await feedback.reload();
  check((await feedback.inputValue("#beter")) === "Stap 4 & 5 + de kaders: graag groter.", "het concept blijft bewaard na herladen");
  await feedback.close();

  /*
   * De wizard voor de tweede dag: vier delen (vooraf, dev en prod, AI ontwerpen, AI bouwen). Het
   * huiswerk komt in deel C, een nieuwe functie krijgt een eigen opdracht, de instructie volgt de
   * opbouw uit de stap prompting, de rekenhulp rekent zonder ingebouwde prijzen, de scorekaart telt,
   * en wat de pagina oplevert is neutraal en zonder em-dash. Daarnaast de labels naar dag 2 in de
   * wizard van dag 1.
   */
  check((await page.locator('a[href="workshop-2.html"]').count()) > 0, "de wizard linkt naar de wizard van de tweede dag");
  await page.goto(`${index}#voorbereiden-0`);
  await headingIs("Welkom", "dag 1: het welkom opent via het adres");
  check((await page.locator(".dag2 a[href^='workshop-2.html']").count()) >= 1, "dag 1: het welkom heeft een label naar dag 2");
  await page.goto(`${index}#live-5`);
  await headingIs("Stap 5 van 8", "dag 1: de stap met de variabelen opent via het adres");
  check((await page.locator(".dag2 a[href='workshop-2.html#devprod']").count()) === 1, "dag 1: de stap met de variabelen wijst naar dag 2, dev en prod");
  const day2Url = pathToFileURL(join(root, "wizard", "workshop-2.html")).href;
  const day2 = await context.newPage();
  day2.setDefaultTimeout(15_000);
  day2.on("pageerror", (error) => browserErrors.push(`workshop-2: ${error.message}`));
  day2.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(`workshop-2: ${message.text()}`);
  });
  const day2Heading = async (expected, label) => {
    const h2 = day2.locator("#step-heading");
    await h2.waitFor({ state: "visible" });
    await settle(day2, expected);
    const text = (await h2.textContent())?.trim() ?? "";
    check(text.startsWith(expected), `workshop-2: ${label} (kop: ${text})`);
  };
  const day2Open = async (hash, expected, label) => {
    await day2.goto(`${day2Url}${hash}`);
    await day2Heading(expected, label);
  };
  const live = async (name) => (await day2.locator(`[data-live="${name}"]`).textContent()) ?? "";
  await day2.goto(day2Url);
  await day2Heading("Welkom", "opent op het welkom");
  check((await day2.locator("a.part").count()) === 4, "workshop-2: vier delen");
  check(((await day2.locator("nav.parts").textContent()) ?? "").includes("Dev en prod"), "workshop-2: deel B heet Dev en prod");
  check((await day2.title()).includes("Live @ Five, day 2"), "workshop-2: de titel is Live @ Five, day 2");
  check((await day2.locator('a[href="index.html"]').count()) > 0, "workshop-2: linkt terug naar de wizard van de eerste dag");
  // Zo werkt het, en in elke stap wat er gebeurt (feedback van dag 1: mensen willen weten wat er gebeurt).
  check((await day2.locator("ol.kaart > li").count()) === 4 && (await day2.locator(".kaart-nieuw").count()) === 1, "workshop-2: het welkom toont de vier plekken van je tool en de Console");
  for (const [id, steps] of [["voorbereiden", 8], ["devprod", 8], ["ontwerpen", 8], ["bouwen", 4]]) {
    const missing = [];
    for (let n = 1; n <= steps; n += 1) {
      await day2Open(`#${id}-${n}`, `Stap ${n} van ${steps}`, `${id}, stap ${n}`);
      const nu = (await day2.locator("#step-heading ~ .nu").textContent()) ?? "";
      if (!nu.startsWith("Wat gebeurt er nu?") || nu.length < 40) missing.push(n);
    }
    check(missing.length === 0, `workshop-2: ${id}: elke stap zegt wat er gebeurt${missing.length ? ` (niet bij stap ${missing.join(", ")})` : ""}`);
  }
  await day2Open("#devprod-0", "Dev en prod gescheiden", "deel B opent op de inleiding");
  check((await day2.locator("ol.kaart > li").count()) === 4, "workshop-2: deel B begint met de vier plekken");
  await day2.setViewportSize({ width: 390, height: 844 });
  const kaartWidth = await day2.evaluate(() => document.documentElement.scrollWidth);
  check(kaartWidth <= 390, `workshop-2: de vier plekken op 390 breed zonder horizontale scroll (${kaartWidth})`);
  await day2.setViewportSize({ width: 1280, height: 900 });

  // Deel A, stap 7: het huiswerk komt in deel C.
  await day2Open("#voorbereiden-7", "Stap 7 van 8", "het huiswerk opent via het adres");
  await day2.check("#a-route-1");
  await day2.fill("#a-test-2", "Aantal kinderen: 28\nWensen: een schoolreisje");
  await day2Open("#devprod-8", "Stap 8 van 8", "deel B, stap 8 over echte gegevens buiten productie");
  check(((await day2.locator("main").textContent()) ?? "").includes("een kopie van productie"), "workshop-2: deel B zegt dat de preview een kopie van productie is");
  await day2Open("#ontwerpen-3", "Stap 3 van 8", "deel C, stap 3");
  check(await day2.isChecked("#c-route-1"), "workshop-2: de keuze uit het huiswerk staat in deel C");

  // Deel C, stap 4: de nieuwe functie krijgt het formulier; er staat nog niets, dus geen vraag.
  await day2Open("#ontwerpen-4", "Stap 4 van 8", "deel C, stap 4");
  await day2.click("#intake-example");
  check((await day2.locator("fieldset[data-veld]").count()) === 8, "workshop-2: het formulier van de kinderboerderij heeft acht velden");
  await day2.click("#c-add");
  check((await day2.locator("fieldset[data-veld]").count()) === 9 && (await day2.evaluate(() => document.activeElement?.id === "c-f-8-label")), "workshop-2: een veld toevoegen werkt, met de focus erop");
  await day2.getByRole("button", { name: "Verwijder veld 9" }).click();
  const gets = await live("claude-gets");
  check(gets.includes("<gegevens>\nAantal kinderen: <waarde>") && !gets.includes("Naam ouder:") && gets.includes("Gaat nooit mee: Naam ouder"), "workshop-2: Claude krijgt alleen de aangevinkte velden, tussen <gegevens>");
  await day2.check("#c-f-0-ai");
  check((await day2.locator("#d-sensitive-ok").count()) === 1, "workshop-2: een gevoelig veld vraagt om een bevestiging");
  await day2.uncheck("#c-f-0-ai");

  // Deel D, stap 2 en 3: de opdracht voor de nieuwe functie, en de open punten voor de AI-functie.
  await day2Open("#bouwen-2", "Stap 2 van 4", "deel D, stap 2");
  const intakePrompt = await day2.inputValue("#intake-prompt-text");
  check(intakePrompt.includes("| Naam ouder | korte tekst | ja | ja |") && intakePrompt.includes("De AI-functie: die komt in de volgende ronde.") && intakePrompt.includes("Git doe ik zelf"), "workshop-2: de opdracht voor de nieuwe functie bevat de velden, laat AI voor later en git bij de mens");
  await day2.click("#intake-prompt-copy");
  await day2.locator("#intake-prompt-status").filter({ hasText: "Gekopieerd" }).waitFor({ state: "visible" });
  check((await day2.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, "\n") === intakePrompt, "workshop-2: het klembord bevat de opdracht");
  await day2Open("#bouwen-3", "Stap 3 van 4", "deel D, stap 3 zonder ontwerp");
  check((await day2.locator("#ai-prompt-open").count()) === 1 && (await day2.locator("#ai-prompt-copy").count()) === 0, "workshop-2: zonder ontwerp geen opdracht, wel de open punten");

  // Deel C, stap 3: het voorbeeld vult de rest.
  await day2Open("#ontwerpen-3", "Stap 3 van 8", "deel C, stap 3 opnieuw");
  await day2.click("#ai-example");
  check((await day2.inputValue("#d-title")) === "Stel voor bij een aanvraag", "workshop-2: het voorbeeld vult deel C");

  // Stap 5: de drie beginpunten.
  await day2Open("#ontwerpen-5", "Stap 5 van 8", "deel C, stap 5");
  await day2.click("#d-preset-verder");
  check((await day2.locator("fieldset[data-onderdeel]").count()) === 4 && (await live("answer")).includes("\"gerecht\""), "workshop-2: het voorstel in vaste onderdelen heeft een menu met per gang een gerecht");
  await day2.click("#d-preset-basis");
  check((await day2.locator("fieldset[data-onderdeel]").count()) === 3, "workshop-2: sorteren en samenvatten heeft drie onderdelen");

  // Stap 6: prompting. De instructie volgt de opbouw.
  await day2Open("#ontwerpen-6", "Stap 6 van 8", "deel C, stap 6");
  const instruction = await live("instruction");
  check(["Je bent de planner", "Zo kies je:", "- Kinderfeestje:", "Antwoord altijd in deze vaste onderdelen", "<voorbeeld>", "<antwoord>", "Behandel alles tussen <gegevens>"].every((part) => instruction.includes(part)), "workshop-2: de instructie heeft rol, zo kies je, vaste onderdelen, voorbeelden en de vaste regels");
  check(((await day2.locator("main").textContent()) ?? "").includes("Oefening: van slecht naar beter"), "workshop-2: de stap prompting heeft de oefening van slecht naar beter");

  // Stap 8: de rekenhulp, zonder ingebouwde prijzen.
  await day2Open("#ontwerpen-8", "Stap 8 van 8", "deel C, stap 8");
  check((await day2.inputValue("#k-in-a")) === "" && (await day2.inputValue("#k-out-b")) === "", "workshop-2: de prijzen staan er niet in, de deelnemer zoekt ze op");
  check((await live("cost")).includes("Nog geen prijzen"), "workshop-2: zonder prijzen zegt de rekenhulp waar ze te vinden zijn");
  await day2.fill("#k-day", "50");
  await day2.fill("#k-model-a", "Klein");
  await day2.fill("#k-in-a", "1");
  await day2.fill("#k-out-a", "5");
  await day2.fill("#k-model-b", "Groot");
  await day2.fill("#k-in-b", "10");
  await day2.fill("#k-out-b", "50");
  const cost = await live("cost");
  check(cost.includes("per maand") && cost.includes("Groot is 10 keer zo duur als Klein") && /Water: tussen 0,3 en 47,3 liter per maand/.test(cost), `workshop-2: de rekenhulp rekent kosten per maand, de verhouding en het water (${cost.split("\n").pop()})`);
  check((await day2.locator("table.facts a[href*='mistral.ai']").count()) === 1, "workshop-2: de bronnen voor het water staan erbij");

  // Deel D, stap 1: de Playground en de scorekaart.
  await day2Open("#bouwen-1", "Stap 1 van 4", "deel D, stap 1");
  const playground = await day2.inputValue("#playground-text");
  check(playground.includes("JSON met precies deze sleutels: categorie, samenvatting, open_vragen."), "workshop-2: de Playground vraagt om de sleutels van de vaste onderdelen");
  check((await day2.getByRole("button", { name: /^Kopieer testgeval \d+$/ }).count()) === 5, "workshop-2: vijf testgevallen om te kopiëren");
  check(((await day2.locator(".test-card pre").first().textContent()) ?? "").startsWith("<gegevens>"), "workshop-2: een testgeval staat tussen <gegevens>");
  await day2.check("#score-1-form");
  check(((await day2.locator("#score-summary").textContent()) ?? "").includes("vorm 1 van 5"), "workshop-2: de scorekaart telt mee");

  // Deel D, stap 3: de opdracht voor de AI-functie.
  await day2Open("#bouwen-3", "Stap 3 van 4", "deel D, stap 3 met ontwerp");
  const aiPrompt = await day2.inputValue("#ai-prompt-text");
  check(aiPrompt.includes("structured outputs") && aiPrompt.includes("ANTHROPIC_API_KEY") && aiPrompt.includes("| Categorie | keuze uit een vaste lijst | Kinderfeestje, Schoolbezoek, Groepsbezoek, Overig |") && aiPrompt.includes("denkniveau van deze prompt standaard op laag"), "workshop-2: de opdracht noemt structured outputs, de sleutel, de vaste structuur en het denkniveau");
  check(aiPrompt.includes("Nooit: Naam ouder") && aiPrompt.includes("(verwacht: Kinderfeestje)"), "workshop-2: de opdracht zegt wat nooit meegaat en wat elk testgeval verwacht");
  for (const [name, text] of [["de opdracht voor de nieuwe functie", intakePrompt], ["de instructie voor de Playground", playground], ["de opdracht voor de AI-functie", aiPrompt]]) {
    check(!text.includes(EM_DASH), `workshop-2: geen em-dash in ${name}`);
    const hits = FORBIDDEN.filter((word) => text.toLowerCase().includes(word.toLowerCase()));
    check(hits.length === 0, `workshop-2: ${name} is neutraal${hits.length ? ` (${hits.join(", ")})` : ""}`);
  }

  // De geheimenwacht: een sleutel in een veld geeft een melding en houdt de opdracht tegen.
  await day2Open("#ontwerpen-6", "Stap 6 van 8", "deel C, stap 6 met een sleutel");
  await day2.fill("#d-rules", "sk-ant-api03-abcdefghijklmnopqrstuvwxyz");
  check(((await day2.locator("#d-rules-err").textContent()) ?? "").includes("API-sleutel"), "workshop-2: een API-sleutel in een veld geeft meteen een melding");
  await day2Open("#bouwen-3", "Stap 3 van 4", "deel D, stap 3 met een sleutel");
  check((await day2.locator("#ai-prompt-copy").count()) === 0, "workshop-2: met een sleutel in de antwoorden geen opdracht");
  await day2Open("#ontwerpen-6", "Stap 6 van 8", "deel C, stap 6 opnieuw");
  await day2.fill("#d-rules", "Schrijf in gewone, vriendelijke taal.");
  check((await day2.evaluate(() => JSON.parse(window.localStorage.getItem("foundation-workshop2:v2") ?? "{}").route)) === "nieuw", "workshop-2: bewaart onder foundation-workshop2:v2");

  // Telefoonbreedte: niets schuift opzij.
  await day2.setViewportSize({ width: 390, height: 844 });
  for (const hash of ["#voorbereiden", "#devprod-1", "#ontwerpen-4", "#ontwerpen-8", "#bouwen-1"]) {
    await day2.goto(`${day2Url}${hash}`);
    await day2.locator("#step-heading").waitFor({ state: "visible" });
    const width = await day2.evaluate(() => document.documentElement.scrollWidth);
    check(width <= 390, `workshop-2: op 390 breed geen horizontale scroll bij ${hash} (${width})`);
  }
  await day2.close();

  /*
   * Het inlogscherm, alleen op de site. Een nagebootste site (https://wizard.test) serveert de
   * bestanden uit de repo, met een eigen wizard/toegang.js: twee testaccounts, waarvan één uit staat.
   * De echte accounts komen nooit in deze test.
   */
  const SITE = "https://wizard.test";
  const ITERATIONS = 1000;
  const account = (naam, actief, wachtwoord) => {
    const salt = randomBytes(16);
    return { naam, actief, zout: salt.toString("base64"), hash: pbkdf2Sync(wachtwoord, salt, ITERATIONS, 32, "sha256").toString("base64") };
  };
  const PASSWORD = "kxq7-m2pa-9vte-h4rn";
  const first = account("deelnemer-01", true, PASSWORD);
  const second = account("deelnemer-02", false, "abcd-efgh-jkmn-pqrs");
  let siteAccounts = [first, second];
  const site = await browser.newContext({ locale: "nl-NL", viewport: { width: 1280, height: 900 } });
  await site.route(`${SITE}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/wizard/toegang.js") {
      await route.fulfill({ contentType: "text/javascript", body: `window.WIZARD_TOEGANG = ${JSON.stringify({ versie: 1, iteraties: ITERATIONS, accounts: siteAccounts })};` });
      return;
    }
    const file = join(root, ...path.split("/").filter(Boolean));
    if (!file.startsWith(join(root, "wizard")) || !existsSync(file)) await route.fulfill({ status: 404, body: "" });
    else await route.fulfill({ path: file });
  });
  const gate = await site.newPage();
  gate.setDefaultTimeout(15_000);
  gate.on("pageerror", (error) => browserErrors.push(`inloggen: ${error.message}`));
  gate.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(`inloggen: ${message.text()}`);
  });
  const login = async (name, password) => {
    await gate.fill("#inloggen-naam", name);
    await gate.fill("#inloggen-wachtwoord", password);
    await gate.click("#inloggen button[type=submit]");
  };
  const errorText = async () => {
    await gate.locator("#inloggen-fout:not(:empty)").waitFor({ state: "visible" });
    return (await gate.locator("#inloggen-fout").textContent()) ?? "";
  };
  await gate.goto(`${SITE}/wizard/index.html`);
  await gate.locator("#inloggen-kop").waitFor({ state: "visible" });
  check(!(await gate.locator("#main").isVisible()) && !(await gate.locator("nav.parts").isVisible()), "inloggen: op de site eerst het inlogscherm, de wizard is verborgen");
  check(await gate.evaluate(() => document.activeElement?.id === "inloggen-naam"), "inloggen: de focus staat op de gebruikersnaam");
  await login("deelnemer-01", "fout-fout-fout-fout");
  check((await errorText()).includes("klopt niet"), "inloggen: een fout wachtwoord wordt geweigerd");
  await login("niemand-hier", PASSWORD);
  check((await errorText()).includes("klopt niet"), "inloggen: een onbekende naam krijgt dezelfde melding");
  await login("deelnemer-02", "abcd-efgh-jkmn-pqrs");
  check((await errorText()).includes("staat uit"), "inloggen: een account dat uit staat, komt er niet in");
  await login("  Deelnemer-01 ", PASSWORD.toUpperCase());
  await gate.locator("#step-heading").waitFor({ state: "visible" });
  check((await gate.locator("#inloggen").count()) === 0 && (await gate.locator("nav.parts").isVisible()), "inloggen: een goed wachtwoord opent de wizard, ook met hoofdletters en spaties");
  check(await gate.evaluate(() => document.activeElement?.id === "step-heading"), "inloggen: na inloggen staat de focus op de kop");
  check(((await gate.locator("#uitloggen").textContent()) ?? "").includes("deelnemer-01"), "inloggen: de kop toont de knop Uitloggen met de gebruikersnaam");
  for (const [file, label] of [["workshop-2.html", "de wizard van de tweede dag"], ["feedback.html", "de feedbackpagina"]]) {
    await gate.goto(`${SITE}/wizard/${file}`);
    await gate.locator("main").first().waitFor({ state: "visible" });
    check((await gate.locator("#inloggen").count()) === 0 && (await gate.locator("#uitloggen").count()) === 1, `inloggen: eenmaal ingelogd opent ook ${label}`);
  }
  siteAccounts = [{ ...first, actief: false }, second];
  await gate.goto(`${SITE}/wizard/index.html`);
  check(await gate.locator("#inloggen-kop").isVisible(), "inloggen: een account dat uit gaat, is bij de volgende pagina uitgelogd");
  const renewed = account("deelnemer-01", true, "nieu-wwww-acht-woor");
  siteAccounts = [renewed, second];
  await gate.goto(`${SITE}/wizard/index.html`);
  await login("deelnemer-01", "nieu-wwww-acht-woor");
  await gate.locator("#step-heading").waitFor({ state: "visible" });
  siteAccounts = [account("deelnemer-01", true, PASSWORD), second];
  await gate.goto(`${SITE}/wizard/index.html`);
  check(await gate.locator("#inloggen-kop").isVisible(), "inloggen: na een nieuw wachtwoord is een oude sessie uitgelogd");
  await login("deelnemer-01", PASSWORD);
  await gate.locator("#uitloggen").click();
  await gate.locator("#inloggen-kop").waitFor({ state: "visible" }).catch(() => undefined);
  check(await gate.locator("#inloggen-kop").isVisible(), "inloggen: uitloggen brengt je terug naar het inlogscherm");
  await gate.setViewportSize({ width: 390, height: 844 });
  await gate.reload();
  await gate.locator("#inloggen-kop").waitFor({ state: "visible" });
  const gateWidth = await gate.evaluate(() => document.documentElement.scrollWidth);
  check(gateWidth <= 390, `inloggen: op 390 breed geen horizontale scroll (${gateWidth})`);
  siteAccounts = [];
  await gate.goto(`${SITE}/wizard/index.html`);
  await gate.locator("#step-heading").waitFor({ state: "visible" });
  check((await gate.locator("#inloggen").count()) === 0, "inloggen: zonder accounts vraagt de site niet om in te loggen");
  await site.close();

  check(browserErrors.length === 0, `geen fouten in de browser${browserErrors.length === 0 ? "" : `:\n  ${browserErrors.join("\n  ")}`}`);
} catch (error) {
  /* Een test die halverwege omvalt (browser niet gevonden, een veld dat niet bestaat) is een probleem, geen stacktrace. */
  problems.push(`de test brak af: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
  console.error(error);
} finally {
  if (browser !== undefined) await browser.close();
  if (keep) console.log(`\nDownloads staan in ${out}`);
  else rmSync(out, { recursive: true, force: true });
}

if (problems.length > 0) {
  console.error(`\nWizard-rooktest: ${problems.length} probleem(en).`);
  process.exit(1);
}
console.log("\nWizard-rooktest: schoon.");
