# Controle van je laptop

Een script dat in een minuut nakijkt of je laptop klaar is om met dit template te werken. Draai het
een paar dagen vóór je begint. Dan heb je tijd om iets op te lossen, of om IT te vragen.

Het script installeert niets en verandert niets. Het kijkt alleen. Per onderdeel zegt het `[OK]`, of
`[ACTIE]` met eronder wat je moet doen. De laatste regel zegt "Alles in orde" of "Nog x dingen te
doen". Los die op en draai het script opnieuw, tot alles in orde is.

Er zijn twee versies:

| Laptop | Bestand |
|---|---|
| Windows | `controle-laptop.ps1` |
| Mac | `controle-laptop.sh` |

## Windows

1. Open **PowerShell**: druk op de Windows-toets, typ `PowerShell` en druk op Enter.
2. Plak deze drie regels, één voor één, en druk na elke regel op Enter:

   ```powershell
   cd $HOME\Downloads
   curl.exe -fsSLO https://jbandb.github.io/bb_foundation_webapp_materials/wizard/controle-laptop.ps1
   powershell -ExecutionPolicy Bypass -File .\controle-laptop.ps1
   ```

Heb je het bestand al via de browser gedownload, dan volstaan de eerste en de laatste regel.

**Waarom niet rechtsklikken en "Uitvoeren met PowerShell"?** Windows weigert standaard scripts
van internet. Dat heet het uitvoeringsbeleid. Met `-ExecutionPolicy Bypass` sta je dit ene script
toe, alleen voor deze keer. Je instellingen blijven zoals ze waren.

Je project komt straks in `C:\Projecten`. Wil je een andere map laten controleren, zet die dan achter
het commando: `-Werkmap D:\Code`.

## Mac

1. Open **Terminal**: druk Cmd+Spatie, typ `Terminal` en druk op Enter.
2. Plak deze drie regels, één voor één, en druk na elke regel op Enter:

   ```bash
   cd ~/Downloads
   curl -fsSLO https://jbandb.github.io/bb_foundation_webapp_materials/wizard/controle-laptop.sh
   bash controle-laptop.sh
   ```

Je project komt straks in `~/Projecten`. Wil je een andere map laten controleren, zet die dan achter
het commando: `bash controle-laptop.sh ~/Code`.

## Wat het script controleert

| Controle | Waarom het ertoe doet |
|---|---|
| **Git** staat erop | Git bewaart elke versie van je code en zet die op GitHub. Zonder Git geen project. Op een Mac zit Git in de command line tools van Apple; het script kijkt eerst of die er zijn. |
| Git kent je **naam en e-mailadres** | Elke wijziging die je opslaat draagt een naam. Zonder naam weigert Git op te slaan, en dat merk je pas midden in het werk. Het script geeft het commando om ze te zetten. Gebruik het adres van je GitHub-account. |
| **Lange paden**, alleen Windows | Een project bevat de map `node_modules`, met mappen in mappen in mappen. Windows stopt standaard bij 260 tekens. Het script kijkt naar twee dingen: de instelling in Git (`core.longpaths`) en die in Windows zelf. De tweede vraagt beheerdersrechten en een herstart; heb je die rechten niet, vraag het dan aan IT. |
| **Node.js**, versie 24 | Node.js draait de tool op je laptop. Het project vraagt versie 24. Een oudere werkt niet; een nieuwere werkt meestal, en dan meldt het script dat ook zo. |
| **pnpm** | Daarmee installeer je de onderdelen van het project. Laat Claude het installeren, zoals in de wizard, deel A, stap 2. Het script noemt ook een commando dat zonder beheerdersrechten werkt. |
| **Uitvoeringsbeleid**, alleen Windows | npm en pnpm starten in PowerShell via een klein script. Staat het uitvoeringsbeleid op de standaard, dan weigert Windows dat met de melding dat scripts zijn uitgeschakeld. Het script geeft het commando om het voor jezelf aan te zetten; daar zijn geen beheerdersrechten voor nodig. |
| **VS Code** | De editor waarin je de code ziet en Claude Code gebruikt. Op een Mac moet ook het commando `code` werken; het script zegt hoe je dat aanzet. |
| **Claude Code** | Bouwt met je mee. De extensie in VS Code is genoeg. Het commando `claude` in een gewoon terminalvenster is handig maar niet nodig. |
| De **werkmap** | Code hoort niet in OneDrive of iCloud. Een project heeft tienduizenden kleine bestanden, en de synchronisatie maakt alles traag en vergrendelt bestanden terwijl je werkt. Let op: op veel zakelijke laptops valt de map Documenten onder OneDrive. Gebruik daarom `C:\Projecten` of `~/Projecten`. |
| **Bereikbaarheid** van github.com, vercel.com, neon.tech en api.anthropic.com | Op die vier draait alles: je code, je website, je database en Claude. Het script doet per site één korte aanvraag. Een proxy of firewall van je werkgever blokkeert soms een van deze sites. Dat los je niet zelf op: overleg met IT en noem de vier namen. |

## Wat het script niet ziet

- Of je accounts bij GitHub, Vercel en Claude werken. Dat staat in de wizard, deel A (`index.html#voorbereiden`). Een
  account bij Neon heb je vooraf niet nodig: de database maak je op de dag aan via Vercel.
- Of de database van Neon zelf bereikbaar is. Die gebruikt een eigen poort (5432), die een
  bedrijfsnetwerk soms dichtzet terwijl de website wel werkt. Merk je dat pas op de dag zelf, dan
  helpt een hotspot via je telefoon.
- Of een proxy van je werkgever het verkeer openbreekt en opnieuw ondertekent. Git, Node.js en
  Claude Code geven dan foutmeldingen over certificaten. Ook dan: IT.
