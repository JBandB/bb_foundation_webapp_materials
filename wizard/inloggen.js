/*
 * Het inlogscherm van de wizard, gedeeld door index.html, workshop-2.html en feedback.html. Een
 * drempel, geen beveiliging (zie README.md, Inloggen): het houdt toevallige bezoekers van de
 * site tegen, meer niet. Daarom:
 *
 *   - alleen op de site (http of https), niet als je de wizard als bestand opent: wie de repo heeft,
 *     heeft de wizard al;
 *   - geen accounts in wizard/toegang.js, of geen wizard/toegang.js (een los gedownloade pagina):
 *     geen inlog;
 *   - een account dat uit staat, of een nieuw wachtwoord kreeg, is bij de volgende pagina uitgelogd.
 *
 * Het wachtwoord wordt in de browser gehasht met PBKDF2 (WebCrypto) en vergeleken met de hash in
 * wizard/toegang.js. Ingelogd blijven staat in localStorage, tot je uitlogt. Het script draait in de
 * kop van de pagina, zodat de wizard nooit even zichtbaar is voordat het inlogscherm er staat.
 */
(() => {
  "use strict";
  const SESSION_KEY = "foundation-wizard-toegang:v1";
  const NAME = /^[a-z][a-z0-9-]{2,39}$/;
  const list = window.WIZARD_TOEGANG;
  const valid = (a) => a && typeof a === "object" && NAME.test(String(a.naam)) && typeof a.actief === "boolean" && typeof a.zout === "string" && typeof a.hash === "string";
  const accounts = list && Array.isArray(list.accounts) ? list.accounts.filter(valid) : [];
  const iterations = list && Number.isInteger(list.iteraties) && list.iteraties > 0 ? list.iteraties : 100000;
  const onSite = window.location.protocol === "http:" || window.location.protocol === "https:";
  if (!onSite || accounts.length === 0) return;

  /* Wachtwoorden zijn willekeurig en in kleine letters; spaties eromheen en hoofdletters tellen niet. */
  const normal = (text) => String(text).trim().toLowerCase();
  const fromBase64 = (text) => Uint8Array.from(window.atob(text), (char) => char.charCodeAt(0));
  const toBase64 = (bytes) => window.btoa(String.fromCharCode(...bytes));
  async function hashOf(password, salt) {
    const key = await window.crypto.subtle.importKey("raw", new TextEncoder().encode(normal(password)), "PBKDF2", false, ["deriveBits"]);
    const bits = await window.crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromBase64(salt), iterations }, key, 256);
    return toBase64(new Uint8Array(bits));
  }
  function readSession() {
    try { return JSON.parse(window.localStorage.getItem(SESSION_KEY) || "null"); } catch { return null; }
  }
  function writeSession(value) {
    try {
      if (value) window.localStorage.setItem(SESSION_KEY, JSON.stringify(value)); else window.localStorage.removeItem(SESSION_KEY);
    } catch { /* Zonder opslag blijf je ingelogd tot je de pagina verlaat. */ }
  }
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (value === null || value === undefined || value === false) continue;
      if (typeof value === "function") el.addEventListener(key.slice(2), value);
      else if (key === "class") el.className = value;
      else el.setAttribute(key, value === true ? "" : String(value));
    }
    for (const kid of kids) if (kid !== null && kid !== undefined) el.append(kid);
    return el;
  }
  const whenReady = (run) => (document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", run, { once: true }) : run());

  /* De stijl volgt de tokens van de pagina zelf; elke wizardpagina heeft dezelfde. */
  document.head.append(h("style", {}, `
html.op-slot body > *:not(header):not(#inloggen) { display: none !important; }
html.op-slot header nav { display: none !important; }
#inloggen { max-width: 28rem; margin: 2.5rem auto 3rem; padding: 0 16px; }
#inloggen .kaart { background: var(--card); border: 1px solid var(--soft); border-left: 4px solid var(--dark); border-radius: 8px; padding: 1.25rem 1.25rem 1.5rem; }
#inloggen h2 { font-size: 1.625rem; margin: 0 0 .5rem; }
#inloggen p { margin: .5rem 0; }
#inloggen label { display: block; font-weight: 600; margin: 1rem 0 .25rem; }
#inloggen input { display: block; width: 100%; font: inherit; color: inherit; background: var(--card); border: 1px solid var(--line); border-radius: 4px; padding: .5rem .625rem; min-height: 44px; }
#inloggen .fout { color: var(--error); font-weight: 600; margin: .75rem 0 0; }
#inloggen .fout:empty { display: none; }
#inloggen button { margin-top: 1.25rem; width: 100%; }
#inloggen .hint { color: var(--muted); font-size: .9375rem; }
header .uitloggen { margin-left: auto; min-height: 36px; padding: .25rem .75rem; font-size: .875rem; background: transparent; color: var(--on-dark); border: 1px solid var(--on-dark-soft); box-shadow: none; }
header .uitloggen:hover { background: var(--rail-hover); color: var(--on-dark); }
`));

  function logoutButton(name) {
    const row = document.querySelector("header .brand-row");
    if (!row || row.querySelector(".uitloggen")) return;
    row.append(h("button", { type: "button", class: "uitloggen", id: "uitloggen", onclick: () => { writeSession(null); window.location.reload(); } }, `Uitloggen (${name})`));
  }

  /*
   * Al ingelogd met een account dat nog aan staat en hetzelfde wachtwoord heeft: alleen de knop om uit
   * te loggen. De sessie onthoudt het begin van de hash; die is openbaar, dus dat kan.
   */
  const fingerprint = (account) => account.hash.slice(0, 12);
  const session = readSession();
  const current = session && accounts.find((a) => a.naam === session.naam);
  if (current && current.actief && session.sleutel === fingerprint(current)) {
    whenReady(() => logoutButton(current.naam));
    return;
  }
  if (session) writeSession(null);

  document.documentElement.classList.add("op-slot");
  whenReady(() => {
    const name = h("input", { id: "inloggen-naam", name: "username", autocomplete: "username", autocapitalize: "off", spellcheck: "false", required: true });
    const password = h("input", { id: "inloggen-wachtwoord", name: "password", type: "password", autocomplete: "current-password", required: true });
    const error = h("p", { class: "fout", id: "inloggen-fout", role: "alert" });
    const button = h("button", { type: "submit", class: "primary" }, "Inloggen");
    const form = h("form", { novalidate: true, "aria-describedby": "inloggen-uitleg" },
      h("label", { for: "inloggen-naam" }, "Gebruikersnaam"), name,
      h("label", { for: "inloggen-wachtwoord" }, "Wachtwoord"), password,
      error, button);
    const section = h("section", { id: "inloggen", "aria-labelledby": "inloggen-kop" },
      h("div", { class: "kaart" },
        h("h2", { id: "inloggen-kop" }, "Inloggen"),
        h("p", { id: "inloggen-uitleg" }, "Deze wizard is voor de deelnemers van de workshop. Je gebruikersnaam en wachtwoord krijg je van wie de workshop geeft."),
        form));
    const header = document.querySelector("body > header");
    if (header) header.after(section); else document.body.prepend(section);
    name.focus();

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      error.textContent = "";
      if (!window.crypto || !window.crypto.subtle) {
        error.textContent = "Inloggen werkt hier niet. Open de wizard via een adres dat met https begint.";
        return;
      }
      button.disabled = true;
      button.textContent = "Even controleren";
      const account = accounts.find((a) => a.naam === normal(name.value));
      let ok = false;
      try { ok = Boolean(account) && (await hashOf(password.value, account.zout)) === account.hash; } catch { ok = false; }
      button.disabled = false;
      button.textContent = "Inloggen";
      if (!ok) {
        error.textContent = "Gebruikersnaam of wachtwoord klopt niet.";
        password.select();
        return;
      }
      if (!account.actief) {
        error.textContent = "Dit account staat uit. Vraag het aan wie de workshop geeft.";
        return;
      }
      writeSession({ naam: account.naam, sleutel: fingerprint(account) });
      section.remove();
      document.documentElement.classList.remove("op-slot");
      logoutButton(account.naam);
      const target = document.getElementById("step-heading") || document.querySelector("main h1, main h2") || document.getElementById("main");
      if (target) {
        if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
        target.focus();
      }
    });
  });
})();
