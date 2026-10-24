/**
 * Neemt de schermafbeeldingen van de wizard op en zet ze in wizard/img/, met de kaders erbij in
 * wizard/schermen.json. Daarna bedt het de manifest in wizard/index.html in, want vanaf file:// mag
 * de wizard geen fetch doen.
 *
 *   node ci/schermen-opnemen.mjs openbaar [--alleen id,id]
 *       Openbare pagina's (aanmelden, downloadpagina's) in een schone browser, 1280 breed.
 *
 *   node ci/schermen-opnemen.mjs ingelogd --profiel <map buiten de repo> --team <vercel-team>
 *       --project <vercel-project> [--repo eigenaar/naam] [--alleen id,id]
 *       De schermen achter een login. Het browserprofiel staat in een map buiten de repo; de eerste
 *       keer log je daar zelf in met een testaccount, daarna onthoudt het profiel dat. Het script
 *       typt nooit een wachtwoord en schrijft geen tokens of cookies weg.
 *
 *   node ci/schermen-opnemen.mjs inbedden
 *       Alleen wizard/schermen.json opnieuw in wizard/index.html zetten, na een wijziging met de hand.
 *
 * Elke opname bekijkt een mens voordat hij wordt gecommit, op namen, adressen en andere persoonlijke
 * gegevens. Het script maskeert wat het kan (avatars, e-mailadressen), maar niet alles.
 *
 * Plaatjes worden WebP: Playwright maakt een PNG en de browser zelf zet die om, zodat er geen
 * extra pakket nodig is. Mislukt een pagina, dan blijft dat scherm op "volgt" staan.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = fileURLToPath(new URL("..", import.meta.url));
const MANIFEST = join(root, "wizard", "schermen.json");
const INDEX = join(root, "wizard", "index.html");
const IMG = join(root, "wizard", "img");
const WIDTH = 1280;
const HEIGHT = 800;
const QUALITY = 0.8;
/* Een gewone Windows-laptop met Chrome, zodat downloadpagina's de Windows-versie voor x64 tonen. */
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const OPEN_TAG = '<script type="application/json" id="schermen">';

const args = process.argv.slice(2);
const mode = args[0];
const option = (name) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
};
const only = (option("alleen") ?? "").split(",").map((id) => id.trim()).filter(Boolean);

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* Wat je per scherm ziet en waar het kader komt. De teksten (alt, uitleg) staan in schermen.json. */
const PUBLIC = [
  {
    id: "github-aanmelden",
    url: "https://github.com/signup",
    kaders: [{ label: "Je e-mailadres van het werk", find: (page) => page.locator("input[type=email], #email").first() }],
  },
  {
    id: "vercel-aanmelden",
    url: "https://vercel.com/signup",
    kaders: [{ label: "Continue with GitHub", find: (page) => page.getByRole("button", { name: /continue with github/i }).first() }],
  },
  {
    id: "git-windows",
    url: "https://git-scm.com/downloads/win",
    kaders: [{ label: "Git for Windows/x64 Setup", find: (page) => page.getByRole("link", { name: /x64 setup/i }).first() }],
  },
  {
    id: "nodejs-download",
    url: "https://nodejs.org/en/download",
    /* De pagina raadt de processor; een gewone Windows-laptop is x64. */
    prepare: async (page) => {
      const architecture = page.getByRole("combobox").filter({ hasText: /arm64/i }).first();
      if (await architecture.isVisible({ timeout: 1500 }).catch(() => false)) {
        await architecture.click();
        await page.getByRole("option", { name: /^x64$/i }).first().click({ timeout: 3000 }).catch(() => undefined);
      }
    },
    kaders: [{ label: "Windows Installer (.msi)", find: (page) => page.locator("a", { hasText: /windows installer/i }).first() }],
  },
  {
    id: "vscode-download",
    url: "https://code.visualstudio.com/download",
    kaders: [{ label: "Download voor Windows", find: (page) => page.getByRole("button", { name: /windows/i }).or(page.getByRole("link", { name: /^windows/i })).first() }],
  },
  {
    id: "claude-code-installeren",
    url: "https://code.claude.com/docs/en/vs-code",
    fallback: "https://docs.claude.com/en/docs/claude-code/vs-code",
    kaders: [{ label: "Install for VS Code", find: (page) => page.getByRole("link", { name: /install for vs code/i }).first() }],
  },
];

/* Achter de login. De adressen hangen af van het team en het project van de opname. */
function privateScreens(team, project, repo) {
  return [
    {
      id: "github-use-template",
      url: `https://github.com/${repo}`,
      kaders: [{ label: "Use this template", find: (page) => page.getByRole("button", { name: /use this template/i }).or(page.getByRole("link", { name: /use this template/i })).first() }],
    },
    {
      id: "vercel-nieuw-project",
      url: "https://vercel.com/new",
      kaders: [{ label: "Import bij je repo", find: (page) => page.getByRole("button", { name: /^import$/i }).first() }],
    },
    {
      id: "vercel-storage-neon",
      url: `https://vercel.com/${team}/${project}/stores`,
      kaders: [{ label: "Create Database", find: (page) => page.getByRole("button", { name: /create database|create/i }).first() }],
    },
    {
      id: "vercel-variabelen",
      url: `https://vercel.com/${team}/${project}/settings/environment-variables`,
      kaders: [
        { label: "Key: de naam die Claude noemt", find: (page) => page.locator("input[name*=key i], input[placeholder*=KEY]").first() },
        { label: "Value: alleen van jou", find: (page) => page.locator("textarea, input[name*=value i]").first() },
      ],
    },
  ];
}

/* Avatars en e-mailadressen weg, zo goed als het gaat. Een mens kijkt daarna toch. */
const MASK_CSS = `
  img[src*="avatars"], img[alt^="@"], [class*="avatar" i], [data-testid*="avatar" i] { visibility: hidden !important; }
`;
async function maskPersonal(page) {
  await page.addStyleTag({ content: MASK_CSS }).catch(() => undefined);
  await page
    .evaluate(() => {
      const email = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (email.test(node.nodeValue ?? "")) node.nodeValue = (node.nodeValue ?? "").replace(email, "naam@voorbeeld.nl");
      }
      for (const input of document.querySelectorAll("input")) {
        if (email.test(input.value)) input.value = "naam@voorbeeld.nl";
      }
    })
    .catch(() => undefined);
}

/* Een cookiebanner wegklikken: eerst weigeren, dan accepteren. Lukt het niet, dan staat hij in beeld. */
async function dismissBanners(page) {
  const names = [/reject all|reject|decline|weigeren|alles weigeren|only necessary|necessary only|save preferences/i, /accept all|accept|agree|allow all|alles accepteren|akkoord|got it|ok/i];
  for (const name of names) {
    const button = page.getByRole("button", { name }).first();
    if (await button.isVisible({ timeout: 800 }).catch(() => false)) {
      await button.click({ timeout: 2000 }).catch(() => undefined);
      await page.waitForTimeout(400);
      return true;
    }
  }
  return false;
}

/* De PNG van Playwright naar WebP, door de browser zelf. */
async function toWebp(browserPage, png) {
  const dataUrl = `data:image/png;base64,${png.toString("base64")}`;
  const webp = await browserPage.evaluate(
    async ({ dataUrl, quality }) => {
      const image = new Image();
      image.src = dataUrl;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext("2d").drawImage(image, 0, 0);
      return canvas.toDataURL("image/webp", quality);
    },
    { dataUrl, quality: QUALITY },
  );
  if (!webp.startsWith("data:image/webp")) throw new Error("de browser maakt geen WebP");
  return Buffer.from(webp.slice(webp.indexOf(",") + 1), "base64");
}

/* Een kader in procenten van het beeld, met een kleine marge rond het element. */
async function frameOf(page, kader) {
  const box = await kader.find(page).boundingBox({ timeout: 3000 }).catch(() => null);
  if (box === null || box.width === 0) return null;
  const pad = 6;
  const x = Math.max(0, box.x - pad);
  const y = Math.max(0, box.y - pad);
  const right = Math.min(WIDTH, box.x + box.width + pad);
  const bottom = Math.min(HEIGHT, box.y + box.height + pad);
  if (y >= HEIGHT || bottom <= 0) return null;
  const pct = (value, total) => Math.round((value / total) * 1000) / 10;
  return { x: pct(x, WIDTH), y: pct(y, HEIGHT), b: pct(right - x, WIDTH), h: pct(bottom - y, HEIGHT), label: kader.label };
}

async function record(page, converter, screen, { mask }) {
  let url = screen.url;
  let response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => null);
  if ((response === null || !response.ok()) && screen.fallback !== undefined) {
    url = screen.fallback;
    response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => null);
  }
  if (response === null) return { ok: false, reason: "de pagina laadde niet" };
  if (!response.ok()) return { ok: false, reason: `de pagina gaf status ${response.status()}` };
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
  await dismissBanners(page);
  if (mask) await maskPersonal(page);
  if (screen.prepare !== undefined) await screen.prepare(page).catch(() => undefined);
  /* Het eerste kader op een derde van de hoogte zetten als het niet helemaal in beeld staat. */
  const first = screen.kaders[0];
  if (first !== undefined) {
    const box = await first.find(page).boundingBox({ timeout: 3000 }).catch(() => null);
    if (box !== null && (box.y < 0 || box.y + box.height > HEIGHT - 40)) {
      await page.evaluate((top) => window.scrollBy(0, top - 260), box.y);
    }
  }
  await page.waitForTimeout(600);
  const kaders = [];
  for (const kader of screen.kaders) {
    const frame = await frameOf(page, kader);
    if (frame !== null) kaders.push(frame);
  }
  const png = await page.screenshot({ type: "png", animations: "disabled" });
  const webp = await toWebp(converter, png);
  mkdirSync(IMG, { recursive: true });
  const file = `img/${screen.id}.webp`;
  writeFileSync(join(root, "wizard", file), webp);
  return { ok: true, file, kaders, bytes: webp.length, missing: screen.kaders.length - kaders.length, url };
}

function readManifest() {
  return JSON.parse(readFileSync(MANIFEST, "utf8"));
}

/* De manifest in index.html zetten, tussen de open- en sluittag van het scriptblok. */
function embed() {
  const manifest = readManifest();
  const html = readFileSync(INDEX, "utf8");
  const start = html.indexOf(OPEN_TAG);
  const end = start === -1 ? -1 : html.indexOf("</script>", start);
  if (start === -1 || end === -1) throw new Error(`wizard/index.html mist ${OPEN_TAG}`);
  const json = JSON.stringify(manifest, null, 2).replace(/</g, "\\u003c");
  const next = `${html.slice(0, start + OPEN_TAG.length)}\n${json}\n${html.slice(end)}`;
  if (next !== html) writeFileSync(INDEX, next, "utf8");
  return next !== html;
}

async function run(screens, context, { mask }) {
  const manifest = readManifest();
  const page = context.pages()[0] ?? (await context.newPage());
  const converter = await context.newPage();
  const report = [];
  for (const screen of screens) {
    if (only.length > 0 && !only.includes(screen.id)) continue;
    const entry = manifest.schermen.find((item) => item.id === screen.id);
    if (entry === undefined) {
      report.push(`${screen.id}: staat niet in wizard/schermen.json, overgeslagen`);
      continue;
    }
    try {
      const result = await record(page, converter, screen, { mask });
      if (!result.ok) {
        report.push(`${screen.id}: VOLGT, ${result.reason}`);
        continue;
      }
      Object.assign(entry, { bestand: result.file, standVan: today(), kaders: result.kaders });
      report.push(`${screen.id}: opgenomen (${Math.round(result.bytes / 1024)} kB, ${result.kaders.length} kader(s)${result.missing ? `, ${result.missing} kader(s) niet gevonden` : ""})`);
    } catch (error) {
      report.push(`${screen.id}: VOLGT, ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
    }
  }
  await converter.close();
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return report;
}

async function main() {
  if (mode === "inbedden") {
    console.log(embed() ? "wizard/index.html bijgewerkt." : "wizard/index.html was al gelijk.");
    return;
  }
  if (mode === "openbaar") {
    const browser = await chromium.launch(process.env.WIZARD_BROWSER ? { executablePath: process.env.WIZARD_BROWSER } : {});
    const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, userAgent: USER_AGENT, locale: "en-US", colorScheme: "light", deviceScaleFactor: 1 });
    try {
      const report = await run(PUBLIC, context, { mask: false });
      console.log(report.join("\n"));
    } finally {
      await browser.close();
    }
    embed();
    console.log("\nBekijk elke opname in wizard/img/ voordat je hem commit.");
    return;
  }
  if (mode === "ingelogd") {
    const profile = option("profiel");
    const team = option("team");
    const project = option("project");
    const repo = option("repo") ?? "JBandB/bb_foundation_webapp";
    if (profile === undefined || team === undefined || project === undefined) {
      console.error("Gebruik: node ci/schermen-opnemen.mjs ingelogd --profiel <map buiten de repo> --team <vercel-team> --project <vercel-project> [--repo eigenaar/naam]");
      process.exit(2);
    }
    const dir = resolve(profile);
    const inside = relative(root, dir);
    if (inside === "" || (!inside.startsWith("..") && !isAbsolute(inside))) {
      console.error("Het profiel moet buiten de repo staan: daar staan cookies van een ingelogde sessie in, en die horen nooit in git.");
      process.exit(2);
    }
    const fresh = !existsSync(dir);
    const context = await chromium.launchPersistentContext(dir, { headless: false, viewport: { width: WIDTH, height: HEIGHT }, locale: "en-US", colorScheme: "light", deviceScaleFactor: 1 });
    try {
      if (fresh || args.includes("--inloggen")) {
        const page = context.pages()[0] ?? (await context.newPage());
        await page.goto("https://github.com/login");
        const tab = await context.newPage();
        await tab.goto("https://vercel.com/login");
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        await rl.question("Log in het browservenster in bij GitHub en Vercel met een testaccount. Druk daarna hier op Enter.\n");
        rl.close();
        await tab.close();
      }
      const report = await run(privateScreens(team, project, repo), context, { mask: true });
      console.log(report.join("\n"));
    } finally {
      await context.close();
    }
    embed();
    console.log("\nBekijk elke opname in wizard/img/ op namen, adressen en avatars voordat je hem commit.");
    return;
  }
  console.error("Gebruik: node ci/schermen-opnemen.mjs openbaar | ingelogd --profiel <map> --team <team> --project <project> | inbedden");
  process.exit(2);
}

await main();
