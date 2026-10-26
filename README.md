# Lesmateriaal bij BB_foundation_webapp

De wizard en het materiaal van de training rond het template
[BB_foundation_webapp](https://github.com/JBandB/bb_foundation_webapp): de wizard van dag 1, de
wizard van dag 2, de voorbereiding en de feedbackpagina. Alles in de huisstijl van Bos & Brouwer.
Wat de wizard oplevert (configuratie, projectplan, checklist, startprompt) is neutraal en draagt geen
merk; de rooktest bewijst dat.

Het template zelf staat in zijn eigen repo en bevat niets van de training. Het enige contract tussen
de twee is `project.config.json`: wat de wizard schrijft, moet de validator van het template halen.

## Openen

| Pagina | Op de site |
|---|---|
| De wizard (dag 1) | https://jbandb.github.io/bb_foundation_webapp_materials/wizard/ |
| Dag 2 | https://jbandb.github.io/bb_foundation_webapp_materials/wizard/workshop-2.html |
| Feedback | https://jbandb.github.io/bb_foundation_webapp_materials/wizard/feedback.html |

Lokaal: open `wizard/index.html` met een dubbelklik. Er is geen server en geen installatie nodig. Los
gedownload, zonder de mappen `brand/` en `img/`, werkt hij ook: dan zonder logo, eigen lettertypes
en schermafbeeldingen. `wizard/voorbereiding.html` stuurt door naar `index.html#voorbereiden`, zodat
oude links werken.

## Mappen

| Map of bestand | Wat |
|---|---|
| `wizard/` | de pagina's, het inlogscherm (`inloggen.js`), de accounts (`toegang.js`), de huisstijl (`brand/`), de schermafbeeldingen (`img/`, `schermen.json`) en het controlescript voor de laptop |
| `ci/` | de rooktest, het beheer van de accounts, het opnemen van schermen, de controle op em-dashes en de koppeling met het template |
| `template.json` | de versie van het template waar deze wizard bij hoort |

## Het contract met het template

`template.json` noemt de repo en de tag van het template. `ci/template.mjs` haalt die versie op in
`.template/` (staat niet in git) en de tests lezen daaruit:

- de **validator**: `project.config.json` uit de wizard gaat door `template:validate` van die versie;
- de **modules**: elke module die de wizard aanbiedt, is in het template te kiezen, en wat de wizard
  "later" noemt, is daar gereserveerd. Een module die het template wel heeft en de wizard niet
  aanbiedt (nu `ai`, dat op dag 2 komt), staat erbij als mededeling;
- de **verboden woorden** (`template/ci/forbidden-words.txt`): niets uit de uitvoer van de wizard mag
  erop staan;
- de **versies van Node en pnpm** uit `package.json`: het controlescript voor de laptop noemt dezelfde.

Bij een nieuwe release van het template: zet de tag in `template.json`, draai de tests, en pas de
wizard aan waar ze falen. Raakt de release de modules of de configuratie, kijk dan ook of de wizard
iets nieuws moet aanbieden.

Tegen een werkkopie van het template, voordat er een tag is:

    TEMPLATE_DIR=../bb_foundation_webapp node ci/wizard-smoke.mjs

(In PowerShell: `$env:TEMPLATE_DIR = "..\bb_foundation_webapp"` en dan de opdracht.) Wijkt de versie
af van `template.json`, dan zegt de test dat.

## Testen

    pnpm install
    pnpm exec playwright install chromium
    pnpm test

`pnpm test` draait drie dingen: `node ci/geen-em-dash.mjs`, `node --test ci/controle-laptop.test.mjs`
en de rooktest `node ci/wizard-smoke.mjs` (met `--keep` blijven de downloads staan). De rooktest
opent de wizard vanaf `file://` in een echte browser, loopt alle delen door met de casus van de
kinderboerderij, controleert de uitvoer tegen het template, en test het inlogscherm op een
nagebootste site. Lukt de download van Chromium niet, zet dan `WIZARD_BROWSER` op het pad van een
chrome.exe die er al staat. De CI (`.github/workflows/ci.yml`) draait hetzelfde bij elke push en pull
request.

## Wat de wizard oplevert: één startprompt

Het eindscherm van deel B heeft één knop: **Kopieer de startprompt**. Lukt kopiëren niet, dan staat
de tekst geselecteerd in een tekstvak. De startprompt bevat drie bestanden, elk in een eigen
codeblok met een afbakening die niet in de inhoud voorkomt:

| Bestand | Waar Claude het neerzet |
|---|---|
| `project.config.json` | in de hoofdmap, over de neutrale versie |
| `PROJECTPLAN.md` | `docs/PROJECTPLAN.md` |
| `00-checklist-<slug>.md` | `docs/handleiding/00-checklist-<slug>.md` |

Staat er al een bestand dat afwijkt van de neutrale versie, dan toont Claude eerst wat er staat en
wacht op een ja. Daarna stopt Claude: de deelnemer commit en synct de drie bestanden en zegt
"gedaan", want `pnpm template:apply` weigert op een werkmap met wijzigingen die nog niet gecommit
zijn.

Onder het ingeklapte kopje **Reserve: losse bestanden** staan de drie bestanden en `startprompt.md`
ook als download, plus `logo.svg` bij een eigen logo.

## De delen

| Pagina | Deel | Wat |
|---|---|---|
| Dag 1 | A. Voorbereiden | accounts, installeren, git, werkmap, het controlescript, je halve pagina, je huisstijl als design system in Claude; thuis, ongeveer een uur |
| | B. Je tool ontwerpen | acht stappen van projectbasis tot de startprompt; in stap 6 lees je het blok uit je design system in |
| | C. Op de dag: live zetten | acht stappen van Use this template tot werken via `release/next` |
| Dag 2 | A. Vooraf | tool online, template bijwerken, Vercel CLI, Neon, de Claude Console, akkoord over gegevens, huiswerk |
| | B. Dev en prod | variabelen per omgeving, een eigen database voor de laptop, previews met een eigen database, een ronde via `release/next`, migraties en terugzetten |
| | C. AI ontwerpen | de toepassing, de gegevens, de vaste structuur, prompting, testgevallen, kosten en water |
| | D. AI bouwen | de Playground met een scorekaart, een nieuwe functie, AI in de tool, onderhoud |

**De huisstijl uit een design system.** In deel A, stap 7 maakt de deelnemer in Claude (Claude
Design, nu in Claude zelf; het losse claude.ai/design sluit op 14 december 2026) een design system
van de huisstijl van de organisatie, haalt het logo als SVG op, en vraagt met een vaste vraag één
JSON-blok: `name`, de acht kleuren van het template, `radius` en `darkMode`. In deel B, stap 6 leest
de wizard dat blok in (`parseDesignBlock`): hij zoekt het blok tussen de accolades, ook met tekst of
code-fences eromheen, neemt alleen geldige waarden over, maakt van `round` zachte hoeken, en noemt
wat hij liet liggen. Het projectplan noemt het design system bij de huisstijl. Schermen ontwerpen en
merkletters horen bewust niet bij dag 1. De rooktest dekt de stap, het inlezen en het projectplan.

Een deel openen kan via het adres: `index.html#voorbereiden`, `#ontwerpen`, `#live`, of een stap
zoals `#live-3`. In de wizard van dag 1 wijzen labels "Dag 2" naar de stap van dag 2 waar een vraag
thuishoort.

De rode draad van dag 2, deel C en D: **AI vult de inhoud, de tool bepaalt de vorm.** Claude
antwoordt altijd in dezelfde vaste onderdelen, de tool toont ze altijd met dezelfde componenten, en
een mens bevestigt. Bedragen rekent de tool, nooit Claude. De opdrachten gaan uit van de module `ai`
en `pnpm doctor`, die in het template zitten vanaf v1.2.0.

- **Kosten.** De rekenhulp schat tokens per verzoek en per maand. Prijzen staan er bewust niet in: de
  deelnemer zoekt ze op de prijspagina van de Console op, als oefening, want ze veranderen.
- **Water.** Een bandbreedte van ongeveer 0,3 ml tot 45 ml per verzoek, uit de openbare cijfers van
  Google, OpenAI en Mistral (met bronnen en datum in de stap). Anthropic publiceert geen cijfer per
  verzoek. Werk de tabel bij als er betere cijfers komen, en zet de datum erbij.
- **Gegevens.** De wizard laat zien wat Claude precies krijgt, vraagt om een bevestiging als er een
  gevoelig veld meegaat, en geeft geen opdracht zolang er iets in de antwoorden staat dat op een
  sleutel of een verbindingsstring lijkt.
- **Wat gebeurt er nu?** Elke stap van dag 2 begint met een donker kader dat in één of twee zinnen,
  in gewone woorden, zegt wat er op dat moment gebeurt en waar. Het welkom en de inleiding van deel B
  tonen "Zo werkt het": de vier plekken van je tool (laptop, GitHub, Vercel, Neon), de Claude Console,
  en wat Claude Code doet als je iets typt. Dat komt uit de feedback van dag 1 (issue 1 in de repo
  van het template). De rooktest bewaakt dat elke stap het kader heeft.

## Privacy

Niets verlaat de browser. De antwoorden van dag 1 staan in `localStorage` onder
`foundation-wizard:v1`, de vinkjes en het open deel onder `foundation-wizard-delen:v1`, die van dag 2
onder `foundation-workshop2:v2`. Wie de oude voorbereidingspagina gebruikte
(`foundation-voorbereiding:v1`), houdt zijn vinkjes en zijn halve pagina. Werkt de opslag niet (een
privévenster), dan werkt de wizard gewoon, alleen zonder geheugen. Zet geen wachtwoorden of andere
geheimen in de wizard. Wie op de site inlogt, blijft ingelogd via `foundation-wizard-toegang:v1` (de
gebruikersnaam en het begin van de hash, geen wachtwoord); Uitloggen wist het.

Wie van het oude adres komt, houdt zijn antwoorden: beide adressen liggen op `jbandb.github.io`, en
de opslag van de browser hoort bij het domein, niet bij de repo.

## Inloggen

Op de site vragen alle drie de pagina's eerst om een gebruikersnaam en een wachtwoord, één account
per deelnemer. **Dit is een drempel, geen beveiliging.** De repo is openbaar: de wizard en de lijst
met accounts zijn voor iedereen te lezen, en wie wil, zet de controle in de browser uit. Het houdt
toevallige bezoekers van de site tegen, meer niet.

- **Alleen op de site.** Open je de wizard als bestand van je schijf, dan is er geen inlog: wie de
  repo heeft, heeft de wizard al.
- **De accounts** staan in `wizard/toegang.js`: per account een code als naam, aan of uit, een zout
  en een hash van het wachtwoord (PBKDF2 met SHA-256, in de browser met WebCrypto). Een `.js` en geen
  `.json`, omdat een pagina vanaf `file://` geen bestand mag ophalen. Zonder accounts is er geen
  inlog.
- **Nooit een naam of mailadres als gebruikersnaam**, want het bestand is openbaar. Gebruik codes
  (`deelnemer-01`) en houd buiten de repo bij wie welke code heeft.
- **Beheer** met het script:

      node ci/wizard-toegang.mjs                    de lijst
      node ci/wizard-toegang.mjs nieuw              de volgende deelnemer-NN, met een wachtwoord
      node ci/wizard-toegang.mjs uit deelnemer-03   uitzetten; bij de volgende pagina uitgelogd
      node ci/wizard-toegang.mjs aan deelnemer-03   weer aanzetten
      node ci/wizard-toegang.mjs wachtwoord deelnemer-03
      node ci/wizard-toegang.mjs verwijder deelnemer-03

  Een nieuw wachtwoord (vier groepjes van vier tekens, zonder letters en cijfers die op elkaar lijken)
  staat één keer in de terminal en nergens anders. Geef het door aan de deelnemer, niet via een chat
  met Claude. Commit en push; na de merge geldt het op de site.
- Hoofdletters en spaties rondom tellen niet bij het inloggen. Een fout wachtwoord en een onbekende
  naam krijgen dezelfde melding; een account dat uit staat, krijgt een eigen melding. Een nieuw
  wachtwoord logt wie met het oude was ingelogd uit.

## Huisstijl

Kleuren, logo's en lettertypes volgen de huisstijl van Bos & Brouwer: Dark Green als kop, Off White
als canvas, Lime alleen voor wat nu of actief is. De logo's in `wizard/brand/` zijn de officiële
bestanden en worden niet aangepast: het witte woordmerk op de donkere kop, de variant met Business
Intelligence op het welkom, het vierkante sublogo als favicon. De lettertypes staan in
`wizard/brand/fonts/`, zie de README daar.

## Schermafbeeldingen

Elke stap in deel A en C van dag 1 kan schermafbeeldingen tonen. De plaatjes staan in `wizard/img/`
(WebP, 1280 breed), beschreven in `wizard/schermen.json`: per scherm `id`, `opname` (openbaar,
ingelogd of handmatig), `bestand`, `alt`, `standVan`, `uitleg` (de officiële documentatie) en
`kaders`. Een kader is `{ x, y, b, h, label }` in procenten van het beeld. Zonder plaatje staat er
een kader "Waar je klikt" met het klikpad uit het veld `klikpad` en de officiële uitleg.

Vanaf `file://` mag een pagina geen `fetch` doen, daarom staat `schermen.json` ook ingebed in
`index.html`. `schermen.json` is de bron; na een wijziging met de hand bed je hem opnieuw in:

    node ci/schermen-opnemen.mjs inbedden

Opnemen gaat met Playwright, vanuit de hoofdmap:

    node ci/schermen-opnemen.mjs openbaar
    node ci/schermen-opnemen.mjs ingelogd --profiel <map buiten de repo> --team <vercel-team> --project <vercel-project>

`openbaar` neemt de openbare pagina's op in een schone browser; GitHub weigert een geautomatiseerde
browser op de aanmeldpagina, dat scherm houdt zijn klikpad. `ingelogd` neemt de schermen achter de
login op. Het browserprofiel staat in een map **buiten de repo**, want daar staan de cookies; het
script weigert een map binnen de repo. Log in met een **testaccount**; het script typt nooit een
wachtwoord. Het verbergt avatars en vervangt e-mailadressen in beeld, maar niet alles: **bekijk elke
opname voordat je hem commit**. De VS Code-schermen (`opname: handmatig`) maak je met de hand.

## Feedback

`feedback.html` zet de feedback klaar als **issue in deze repo**, met een titel die begint met
`[Feedback]`; de deelnemer klikt op GitHub op Submit new issue. Filteren: in Issues op
`[Feedback] in:title`. Feedback van vóór de scheiding staat in de issues van het template.

- **Openbaar.** De repo is publiek, dus elk issue ook, met de GitHub-naam erbij. De pagina zegt dat
  vooraf en biedt mailen als alternatief.
- Het concept blijft in de browser bewaard (`foundation-feedback:v1`) tot het verstuurd is. Te lange
  feedback past niet in één link; dan zet de pagina de tekst op het klembord en vraagt hem te plakken.
- Een label zet de pagina niet: GitHub negeert labels in de link van iemand zonder schrijfrechten.

## Het oude adres

Tot en met template v1.2.0 stond de wizard in de repo van het template, op
`https://jbandb.github.io/bb_foundation_webapp/wizard/`. Dat adres is offline; de pagina's staan alleen
nog hier.
