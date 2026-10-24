#!/usr/bin/env bash
#
# Controle van je laptop, voor macOS. Werkt in bash en in zsh.
#
# Draaien, vanuit de map waar dit bestand staat:
#
#   bash controle-laptop.sh
#
# Wil je een andere werkmap laten controleren dan ~/Projecten, geef hem dan mee:
#
#   bash controle-laptop.sh ~/Code
#
# Het script installeert niets en verandert niets. Het kijkt alleen, en zegt per onderdeel
# [OK] of [ACTIE] met wat je moet doen. Uitleg per controle: controle-laptop.md.

# Houd deze twee gelijk aan package.json (engines.node en packageManager); de test
# ci/controle-laptop.test.mjs bewaakt dat, tegen package.json van het template.
NODE_MAJOR=24
PNPM_VERSION=11.20.0

WERKMAP="${1:-$HOME/Projecten}"
TODO=0

if [ -t 1 ]; then
  GREEN=$(printf '\033[32m')
  RED=$(printf '\033[31m')
  RESET=$(printf '\033[0m')
else
  GREEN=""
  RED=""
  RESET=""
fi

ok() {
  printf '%s[OK]%s    %s\n' "$GREEN" "$RESET" "$1"
}

actie() {
  TODO=$((TODO + 1))
  printf '%s[ACTIE]%s %s\n' "$RED" "$RESET" "$1"
}

# Een regel uitleg onder de vorige.
uitleg() {
  printf '        %s\n' "$1"
}

have() {
  command -v "$1" >/dev/null 2>&1
}

# Het eerste getal van een versie als "v24.1.0" of "11.20.0".
major_of() {
  printf '%s\n' "$1" | sed -n 's/^[^0-9]*\([0-9][0-9]*\)\..*/\1/p'
}

# Ligt dit pad in een map die OneDrive of iCloud synchroniseert?
under_cloud_sync() {
  case "$1" in
    *"/Library/CloudStorage/"* | *"/OneDrive"* | *"/Library/Mobile Documents/"*) return 0 ;;
  esac
  return 1
}

echo ""
echo "Controle van je laptop voor de workshop"
echo "======================================="
echo ""

IS_MAC=0
if [ "$(uname -s)" = "Darwin" ]; then IS_MAC=1; fi

# --- Git -------------------------------------------------------------------------------------

# Op een Mac zonder de command line tools is git een lege huls die een installatievenster opent.
# Daarom eerst kijken of die tools er zijn, en git pas daarna aanroepen.
GIT_OK=0
if [ "$IS_MAC" = 1 ] && ! xcode-select -p >/dev/null 2>&1; then
  actie "Git ontbreekt: de command line tools van Apple staan er nog niet op."
  uitleg "Installeer ze met: xcode-select --install"
  uitleg "Er opent een venster; kies Installeren. Dat duurt een paar minuten."
elif ! have git; then
  actie "Git ontbreekt."
  uitleg "Installeer het van https://git-scm.com/downloads."
else
  GIT_OK=1
  ok "Git staat erop ($(git --version 2>/dev/null))."
fi

if [ "$GIT_OK" = 1 ]; then
  GIT_NAME=$(git config --global user.name 2>/dev/null)
  GIT_EMAIL=$(git config --global user.email 2>/dev/null)
  if [ -z "$GIT_NAME" ]; then
    actie "Git weet je naam nog niet. Elke wijziging die je opslaat, draagt die naam."
    uitleg 'Zet hem met: git config --global user.name "Voornaam Achternaam"'
  else
    ok "Git kent je naam: $GIT_NAME."
  fi
  if [ -z "$GIT_EMAIL" ]; then
    actie "Git weet je e-mailadres nog niet."
    uitleg 'Zet het met: git config --global user.email "naam@voorbeeld.nl"'
    uitleg "Gebruik hetzelfde adres als bij GitHub."
  else
    ok "Git kent je e-mailadres: $GIT_EMAIL."
  fi
fi

# --- Node.js en pnpm -------------------------------------------------------------------------

if ! have node; then
  actie "Node.js ontbreekt."
  uitleg "Download Node.js versie $NODE_MAJOR van https://nodejs.org/en/download en installeer het."
  uitleg "Open daarna een nieuw terminalvenster en draai dit script opnieuw."
else
  NODE_VERSION=$(node --version 2>/dev/null)
  NODE_HAVE=$(major_of "$NODE_VERSION")
  if [ -z "$NODE_HAVE" ]; then
    actie "Node.js is gevonden maar start niet goed."
    uitleg "Installeer Node.js versie $NODE_MAJOR opnieuw van https://nodejs.org/en/download."
  elif [ "$NODE_HAVE" -lt "$NODE_MAJOR" ]; then
    actie "Node.js is te oud ($NODE_VERSION). Het project vraagt versie $NODE_MAJOR."
    uitleg "Installeer versie $NODE_MAJOR van https://nodejs.org/en/download."
  elif [ "$NODE_HAVE" -gt "$NODE_MAJOR" ]; then
    ok "Node.js staat erop ($NODE_VERSION)."
    uitleg "Het project vraagt versie $NODE_MAJOR. Een nieuwere werkt meestal; loop je vast, installeer dan $NODE_MAJOR."
  else
    ok "Node.js staat erop ($NODE_VERSION)."
  fi
fi

pnpm_fix() {
  uitleg "Laat Claude het installeren, zoals in stap 2 van de voorbereiding. Of plak zelf, zonder sudo:"
  uitleg "  curl -fsSL https://get.pnpm.io/install.sh | sh -"
  uitleg "Open daarna een nieuw terminalvenster en draai dit script opnieuw."
}

PNPM_WANTED=$(major_of "$PNPM_VERSION")
if ! have pnpm; then
  actie "pnpm ontbreekt. Daarmee installeer je straks de onderdelen van het project."
  pnpm_fix
else
  PNPM_HAVE_VERSION=$(pnpm --version 2>/dev/null)
  PNPM_HAVE=$(major_of "$PNPM_HAVE_VERSION")
  if [ -z "$PNPM_HAVE" ]; then
    actie "pnpm is gevonden maar start niet goed."
    pnpm_fix
  elif [ "$PNPM_HAVE" -lt "$PNPM_WANTED" ]; then
    actie "pnpm is te oud ($PNPM_HAVE_VERSION). Het project vraagt versie $PNPM_VERSION."
    pnpm_fix
  else
    ok "pnpm staat erop ($PNPM_HAVE_VERSION)."
  fi
fi

# --- VS Code ---------------------------------------------------------------------------------

if have code; then
  ok "VS Code staat erop ($(code --version 2>/dev/null | head -n 1))."
elif [ -d "/Applications/Visual Studio Code.app" ] || [ -d "$HOME/Applications/Visual Studio Code.app" ]; then
  actie "VS Code staat erop, maar het commando code werkt nog niet in de terminal."
  uitleg "Open VS Code, druk Cmd+Shift+P, typ: Shell Command: Install 'code' command in PATH"
  uitleg "en kies die regel. Open daarna een nieuw terminalvenster."
else
  actie "VS Code ontbreekt."
  uitleg "Download het van https://code.visualstudio.com en sleep het naar Programma's."
fi

# --- Claude Code -----------------------------------------------------------------------------

if have claude; then
  CLAUDE_VERSION=$(claude --version 2>/dev/null | head -n 1)
  if [ -n "$CLAUDE_VERSION" ]; then
    ok "Claude Code staat erop ($CLAUDE_VERSION)."
  else
    actie "Claude Code is gevonden maar start niet goed."
    uitleg "Installeer het opnieuw met: curl -fsSL https://claude.ai/install.sh | bash"
  fi
elif [ -x "$HOME/.local/bin/claude" ]; then
  actie "Claude Code staat erop, maar de terminal vindt het commando claude niet."
  uitleg "Het staat in ~/.local/bin. Voeg die map toe aan je PATH:"
  uitleg "  echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.zshrc"
  uitleg "Open daarna een nieuw terminalvenster."
elif [ -n "$(find "$HOME/.vscode/extensions" -maxdepth 1 -name 'anthropic.claude-code-*' 2>/dev/null | head -n 1)" ]; then
  # Bewust find en geen glob: zsh stopt het hele script bij een glob zonder treffer.
  ok "Claude Code staat erop als extensie in VS Code."
  uitleg "Het commando claude in de terminal ontbreekt. Dat is niet nodig zolang je in VS Code werkt."
  uitleg "Wil je het toch: curl -fsSL https://claude.ai/install.sh | bash"
else
  actie "Claude Code ontbreekt."
  uitleg "Installeer het met: curl -fsSL https://claude.ai/install.sh | bash"
  uitleg "Open daarna een nieuw terminalvenster en draai dit script opnieuw."
fi

# --- De werkmap ------------------------------------------------------------------------------

HERE=$(pwd)
if under_cloud_sync "$HERE"; then
  actie "Deze map valt onder OneDrive of iCloud: $HERE"
  uitleg "Zet je project niet in een map die synchroniseert. Een project heeft tienduizenden kleine"
  uitleg "bestanden (node_modules), en de synchronisatie maakt het traag en vergrendelt bestanden."
  uitleg "Gebruik een map buiten OneDrive en iCloud, bijvoorbeeld $WERKMAP."
else
  ok "Deze map valt niet onder OneDrive of iCloud ($HERE)."
fi

if under_cloud_sync "$WERKMAP"; then
  actie "De voorgestelde werkmap valt onder OneDrive of iCloud: $WERKMAP"
  uitleg "Kies een map buiten de synchronisatie, bijvoorbeeld ~/Projecten, en draai dit script met:"
  uitleg "  bash controle-laptop.sh ~/Projecten"
else
  ok "Voorgestelde werkmap: $WERKMAP (niet in OneDrive of iCloud)."
  if [ ! -d "$WERKMAP" ]; then
    uitleg "De map bestaat nog niet. Maak hem met: mkdir -p \"$WERKMAP\""
  fi
  # iCloud kan Bureaublad en Documenten synchroniseren; dan staan ze in Mobile Documents.
  if [ -d "$HOME/Library/Mobile Documents/com~apple~CloudDocs/Documents" ]; then
    uitleg "Let op: iCloud synchroniseert je map Documenten. Zet je project dus niet daar, maar in $WERKMAP."
  fi
fi

# --- Bereikbaarheid --------------------------------------------------------------------------

BLOCKED=""
for site in github.com vercel.com neon.tech api.anthropic.com; do
  # Elk antwoord telt, ook een foutcode: dan is de site bereikbaar.
  if curl -s -o /dev/null --connect-timeout 5 --max-time 8 "https://$site/" 2>/dev/null; then
    ok "$site is bereikbaar."
  else
    if [ -z "$BLOCKED" ]; then BLOCKED="$site"; else BLOCKED="$BLOCKED, $site"; fi
  fi
done
if [ -n "$BLOCKED" ]; then
  actie "Niet bereikbaar: $BLOCKED."
  uitleg "Controleer eerst of je internet hebt. Werkt de rest van internet wel, dan blokkeert"
  uitleg "waarschijnlijk een proxy of firewall van je werkgever deze sites. Overleg met IT:"
  uitleg "deze vier moeten bereikbaar zijn, ook voor Git, Node.js en Claude Code."
fi

# --- Slot ------------------------------------------------------------------------------------

echo ""
if [ "$TODO" -eq 0 ]; then
  printf '%sAlles in orde.%s\n' "$GREEN" "$RESET"
  exit 0
fi
if [ "$TODO" -eq 1 ]; then
  printf '%sNog 1 ding te doen. Los het op en draai dit script opnieuw.%s\n' "$RED" "$RESET"
else
  printf '%sNog %s dingen te doen. Los ze op en draai dit script opnieuw.%s\n' "$RED" "$TODO" "$RESET"
fi
exit 1
