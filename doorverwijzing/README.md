# Doorverwijzing van het oude adres

Tot en met template v1.2.0 stond de wizard in de repo van het template, op
`https://jbandb.github.io/bb_foundation_webapp/wizard/`. Deze pagina's sturen dat adres door naar het
nieuwe, met het deel of de stap uit het adres erbij (`#live-3` blijft `#live-3`).

| Oud adres, onder `/bb_foundation_webapp/` | Gaat naar |
|---|---|
| `wizard/` en `wizard/index.html` | de wizard |
| `wizard/workshop-2.html` | de wizard van dag 2 |
| `wizard/feedback.html` | de feedbackpagina |
| `wizard/voorbereiding.html` | deel A van de wizard |
| de root | de wizard |

Antwoorden en vinkjes komen mee: beide adressen liggen op `jbandb.github.io`, en de opslag van de
browser hoort bij het domein, niet bij de repo.

## Inrichten, eenmalig

De pagina's horen in de repo van het template, op een eigen branch `gh-pages` waar alleen GitHub
Pages uit leest. Projecten krijgen die branch nooit, want die komen uit `main`. Doe dit pas als de
nieuwe site werkt.

1. Maak de branch naast je werkkopie van het template, zonder geschiedenis (git 2.42 of nieuwer):

       cd <map van het template>
       git worktree add --orphan -b gh-pages ../bb_foundation_webapp-pages
       cd ../bb_foundation_webapp-pages

2. Kopieer de inhoud van deze map erin, behalve dit README-bestand: `index.html`, `.nojekyll` en de
   map `wizard/` met de vier pagina's.
3. Commit en push:

       git add -A
       git commit -m "chore(pages): doorverwijzing naar het lesmateriaal"
       git push -u origin gh-pages

4. Op GitHub, in de repo van het template: **Settings, Pages**, Source **Deploy from a branch**,
   branch `gh-pages`, map `/ (root)`. Opslaan.
5. Ruim de werkmap op: `cd <map van het template>` en `git worktree remove ../bb_foundation_webapp-pages`.

**Controle:** `https://jbandb.github.io/bb_foundation_webapp/wizard/workshop-2.html#ontwerpen` opent
dag 2 op het nieuwe adres, bij deel C.

De twee controlescripts (`controle-laptop.ps1` en `.sh`) hebben geen doorverwijzing: een script kan
dat niet. Wie ze op het oude adres downloadde, haalt ze voortaan van de nieuwe site.
