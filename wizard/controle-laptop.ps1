# Controle van je laptop, voor Windows. Werkt in Windows PowerShell 5.1 en in PowerShell 7.
#
# Draaien, vanuit de map waar dit bestand staat:
#
#   powershell -ExecutionPolicy Bypass -File .\controle-laptop.ps1
#
# Het script installeert niets en verandert niets. Het kijkt alleen, en zegt per onderdeel
# [OK] of [ACTIE] met wat je moet doen. Uitleg per controle: controle-laptop.md.
#
# Dit bestand bevat bewust alleen ASCII-tekens: Windows PowerShell 5.1 leest een bestand zonder
# BOM als Windows-1252, en dan worden letters met een trema of accent onleesbaar.

param(
  # De map waar je je project straks neerzet. Het script controleert alleen of die goed ligt.
  [string]$Werkmap = 'C:\Projecten'
)

# Houd deze twee gelijk aan package.json (engines.node en packageManager); de test
# ci/controle-laptop.test.mjs bewaakt dat, tegen package.json van het template.
$NodeMajor = 24
$PnpmVersion = '11.20.0'

$script:Todo = 0

function Write-Ok([string]$Text, [string[]]$Detail = @()) {
  Write-Host '[OK]    ' -ForegroundColor Green -NoNewline
  Write-Host $Text
  foreach ($line in $Detail) { Write-Host "        $line" }
}

function Write-Actie([string]$Text, [string[]]$Detail = @()) {
  $script:Todo++
  Write-Host '[ACTIE] ' -ForegroundColor Red -NoNewline
  Write-Host $Text
  foreach ($line in $Detail) { Write-Host "        $line" }
}

function Find-Tool([string]$Name) {
  Get-Command $Name -CommandType Application, ExternalScript -ErrorAction SilentlyContinue |
    Select-Object -First 1
}

# Voert een gevonden programma uit en geeft de eerste regel van de uitvoer, of $null.
function Get-FirstLine($Command, [string[]]$Arguments) {
  try {
    $out = & $Command.Source @Arguments 2>$null
    if ($LASTEXITCODE -ne 0 -or $null -eq $out) { return $null }
    $first = @($out)[0]
    if ($null -eq $first) { return $null }
    $text = "$first".Trim()
    if ($text -eq '') { return $null }
    return $text
  } catch {
    return $null
  }
}

function Get-Major([string]$Version) {
  if ($Version -match '(\d+)\.\d+') { return [int]$Matches[1] }
  return $null
}

function Test-UnderCloudSync([string]$Path) {
  $roots = @($env:OneDrive, $env:OneDriveCommercial, $env:OneDriveConsumer) |
    Where-Object { $_ -and $_.Trim() -ne '' }
  foreach ($root in $roots) {
    if ($Path.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) { return $true }
  }
  return ($Path -match '\\OneDrive( - [^\\]+)?(\\|$)')
}

Write-Host ''
Write-Host 'Controle van je laptop voor de workshop'
Write-Host '======================================='
Write-Host ''

# --- Git -------------------------------------------------------------------------------------

$git = Find-Tool 'git'
if ($null -eq $git) {
  Write-Actie 'Git ontbreekt.' @(
    'Installeer Git: winget install --id Git.Git -e',
    'Of download het van https://git-scm.com/download/win.',
    'Sluit daarna dit venster, open een nieuw venster en draai dit script opnieuw.'
  )
} else {
  $gitVersion = Get-FirstLine $git @('--version')
  Write-Ok "Git staat erop ($gitVersion)."

  $name = Get-FirstLine $git @('config', '--global', 'user.name')
  $email = Get-FirstLine $git @('config', '--global', 'user.email')
  if ($null -eq $name) {
    Write-Actie 'Git weet je naam nog niet. Elke wijziging die je opslaat, draagt die naam.' @(
      'Zet hem met: git config --global user.name "Voornaam Achternaam"'
    )
  } else {
    Write-Ok "Git kent je naam: $name."
  }
  if ($null -eq $email) {
    Write-Actie 'Git weet je e-mailadres nog niet.' @(
      'Zet het met: git config --global user.email "naam@voorbeeld.nl"',
      'Gebruik hetzelfde adres als bij GitHub.'
    )
  } else {
    Write-Ok "Git kent je e-mailadres: $email."
  }

  $longGit = Get-FirstLine $git @('config', '--global', 'core.longpaths')
  if ($longGit -eq 'true') {
    Write-Ok 'Git mag lange paden gebruiken.'
  } else {
    Write-Actie 'Git staat lange paden nog niet toe.' @(
      'Een project heeft diep geneste mappen (node_modules). Zonder deze instelling',
      'faalt Git op bestanden met een lang pad.',
      'Zet het aan met: git config --global core.longpaths true'
    )
  }
}

# --- Lange paden in Windows ------------------------------------------------------------------

$longWin = $null
try {
  $longWin = (Get-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name 'LongPathsEnabled' -ErrorAction Stop).LongPathsEnabled
} catch {
  $longWin = $null
}
if ($longWin -eq 1) {
  Write-Ok 'Windows staat lange paden toe.'
} else {
  Write-Actie 'Windows staat lange paden nog niet toe.' @(
    'Windows stopt standaard bij paden van 260 tekens, en node_modules gaat daar soms overheen.',
    'Zet het aan in een PowerShell-venster dat je opent met "Als administrator uitvoeren":',
    '  New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name LongPathsEnabled -Value 1 -PropertyType DWORD -Force',
    'Start daarna je laptop opnieuw. Ben je geen beheerder van je laptop, vraag het dan aan IT.'
  )
}

# --- Node.js en pnpm -------------------------------------------------------------------------

$node = Find-Tool 'node'
if ($null -eq $node) {
  Write-Actie 'Node.js ontbreekt.' @(
    "Download Node.js versie $NodeMajor van https://nodejs.org/en/download en installeer het.",
    'Open daarna een nieuw venster en draai dit script opnieuw.'
  )
} else {
  $nodeVersion = Get-FirstLine $node @('--version')
  $major = Get-Major $nodeVersion
  if ($null -eq $major) {
    Write-Actie 'Node.js is gevonden maar start niet goed.' @(
      "Installeer Node.js versie $NodeMajor opnieuw van https://nodejs.org/en/download."
    )
  } elseif ($major -lt $NodeMajor) {
    Write-Actie "Node.js is te oud ($nodeVersion). Het project vraagt versie $NodeMajor." @(
      "Installeer versie $NodeMajor van https://nodejs.org/en/download."
    )
  } elseif ($major -gt $NodeMajor) {
    Write-Ok "Node.js staat erop ($nodeVersion)." @(
      "Het project vraagt versie $NodeMajor. Een nieuwere werkt meestal; loop je vast, installeer dan $NodeMajor."
    )
  } else {
    Write-Ok "Node.js staat erop ($nodeVersion)."
  }
}

$pnpm = Find-Tool 'pnpm'
$pnpmFix = @(
  'Laat Claude het installeren, zoals in stap 2 van de voorbereiding. Of typ zelf, in een gewoon',
  "venster (geen beheerdersrechten nodig): npm install -g pnpm@$PnpmVersion",
  'Open daarna een nieuw venster en draai dit script opnieuw.'
)
if ($null -eq $pnpm) {
  Write-Actie 'pnpm ontbreekt. Daarmee installeer je straks de onderdelen van het project.' $pnpmFix
} else {
  $pnpmVersion = Get-FirstLine $pnpm @('--version')
  $pnpmMajor = Get-Major $pnpmVersion
  $wanted = Get-Major $PnpmVersion
  if ($null -eq $pnpmMajor) {
    Write-Actie 'pnpm is gevonden maar start niet goed.' $pnpmFix
  } elseif ($pnpmMajor -lt $wanted) {
    Write-Actie "pnpm is te oud ($pnpmVersion). Het project vraagt versie $PnpmVersion." $pnpmFix
  } else {
    Write-Ok "pnpm staat erop ($pnpmVersion)."
  }
}

# --- Uitvoeringsbeleid -----------------------------------------------------------------------

# Dit script draait met Bypass, maar alleen voor zichzelf. Kijk naar wat er buiten dit venster
# geldt: npm en pnpm starten in PowerShell via een klein script, en dat weigert Windows standaard.
$policy = 'Undefined'
try {
  foreach ($scope in @('MachinePolicy', 'UserPolicy', 'CurrentUser', 'LocalMachine')) {
    $value = "$(Get-ExecutionPolicy -Scope $scope -ErrorAction Stop)"
    if ($value -ne 'Undefined') { $policy = $value; break }
  }
} catch {
  $policy = 'Undefined'
}
if ($policy -eq 'Undefined') { $policy = 'Restricted' }
if (@('RemoteSigned', 'Unrestricted', 'Bypass') -contains $policy) {
  Write-Ok "PowerShell mag npm en pnpm starten (uitvoeringsbeleid $policy)."
} else {
  Write-Actie "PowerShell weigert npm en pnpm te starten (uitvoeringsbeleid $policy)." @(
    'Je ziet dan de melding dat het uitvoeren van scripts is uitgeschakeld.',
    'Zet het voor jezelf aan, zonder beheerdersrechten, en bevestig met J of Y:',
    '  Set-ExecutionPolicy -Scope CurrentUser RemoteSigned',
    'Lukt dat niet, dan heeft je werkgever het vastgezet. Vraag het dan aan IT.'
  )
}

# --- VS Code ---------------------------------------------------------------------------------

$code = Find-Tool 'code'
if ($null -eq $code) {
  Write-Actie 'VS Code ontbreekt, of het commando code is niet bekend.' @(
    'Installeer VS Code: winget install --id Microsoft.VisualStudioCode -e',
    'Of download het van https://code.visualstudio.com.',
    'Open daarna een nieuw venster en draai dit script opnieuw.'
  )
} else {
  $codeVersion = Get-FirstLine $code @('--version')
  if ($null -eq $codeVersion) {
    # code.cmd struikelt over een & in het pad van je gebruikersmap. Lees dan de versie
    # van Code.exe zelf, die twee mappen hoger staat.
    $exe = Join-Path (Split-Path (Split-Path $code.Source -Parent) -Parent) 'Code.exe'
    if (Test-Path $exe) { $codeVersion = (Get-Item $exe).VersionInfo.ProductVersion }
  }
  if ($null -eq $codeVersion) {
    Write-Ok 'VS Code staat erop.'
  } else {
    Write-Ok "VS Code staat erop ($codeVersion)."
  }
}

# --- Claude Code -----------------------------------------------------------------------------

$claude = Find-Tool 'claude'
$claudeLocal = Join-Path $env:USERPROFILE '.local\bin\claude.exe'
if ($null -eq $claude -and (Test-Path $claudeLocal)) {
  Write-Actie 'Claude Code staat erop, maar Windows vindt het commando claude niet.' @(
    "Het staat in $(Split-Path $claudeLocal -Parent).",
    'Sluit alle vensters en open een nieuw venster. Helpt dat niet, voeg die map dan toe aan',
    'je PATH: Instellingen, zoek op "omgevingsvariabelen", Path, Nieuw.'
  )
} elseif ($null -eq $claude -and (Test-Path (Join-Path $env:USERPROFILE '.vscode\extensions\anthropic.claude-code-*'))) {
  Write-Ok 'Claude Code staat erop als extensie in VS Code.' @(
    'Het commando claude in een gewoon terminalvenster ontbreekt. Dat is niet nodig zolang je in VS Code werkt.',
    'Wil je het toch: irm https://claude.ai/install.ps1 | iex'
  )
} elseif ($null -eq $claude) {
  Write-Actie 'Claude Code ontbreekt.' @(
    'Installeer het in PowerShell met: irm https://claude.ai/install.ps1 | iex',
    'Open daarna een nieuw venster en draai dit script opnieuw.'
  )
} else {
  $claudeVersion = Get-FirstLine $claude @('--version')
  if ($null -eq $claudeVersion) {
    Write-Actie 'Claude Code is gevonden maar start niet goed.' @(
      'Installeer het opnieuw met: irm https://claude.ai/install.ps1 | iex'
    )
  } else {
    Write-Ok "Claude Code staat erop ($claudeVersion)."
  }
}

# --- De werkmap ------------------------------------------------------------------------------

$here = (Get-Location).Path
$docs = [Environment]::GetFolderPath('MyDocuments')
if (Test-UnderCloudSync $here) {
  Write-Actie "Deze map valt onder OneDrive: $here" @(
    'Zet je project niet in OneDrive. Een project heeft tienduizenden kleine bestanden (node_modules)',
    'en OneDrive gaat die allemaal synchroniseren. Dat is traag en geeft vergrendelde bestanden.',
    "Gebruik een map buiten OneDrive, bijvoorbeeld $Werkmap."
  )
} else {
  Write-Ok "Deze map valt niet onder OneDrive ($here)."
}

if (Test-UnderCloudSync $Werkmap) {
  Write-Actie "De voorgestelde werkmap valt onder OneDrive: $Werkmap" @(
    'Kies een map buiten OneDrive, bijvoorbeeld C:\Projecten, en draai dit script met:',
    '  powershell -ExecutionPolicy Bypass -File .\controle-laptop.ps1 -Werkmap C:\Projecten'
  )
} else {
  $detail = @()
  if (-not (Test-Path $Werkmap)) { $detail += "De map bestaat nog niet. Maak hem met: mkdir $Werkmap" }
  if ($docs -and (Test-UnderCloudSync $docs)) {
    $detail += "Let op: je map Documenten valt onder OneDrive. Zet je project dus niet daar, maar in $Werkmap."
  }
  if ($Werkmap.Contains('&')) {
    $detail += 'De naam bevat een &. Sommige programma''s struikelen daarover; kies liever een naam zonder.'
  }
  Write-Ok "Voorgestelde werkmap: $Werkmap (niet in OneDrive)." $detail
}

# --- Bereikbaarheid --------------------------------------------------------------------------

try {
  Add-Type -AssemblyName System.Net.Http -ErrorAction Stop
  # Alleen voor dit venster: Windows PowerShell 5.1 kent TLS 1.2 anders niet standaard.
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch {
  # Valt dit weg, dan meldt de controle hieronder het vanzelf als onbereikbaar.
}

# Alle vier tegelijk, zodat een geblokkeerd netwerk niet vier keer de wachttijd kost.
$sites = @('github.com', 'vercel.com', 'neon.tech', 'api.anthropic.com')
$client = $null
$requests = @{}
try {
  $client = New-Object System.Net.Http.HttpClient
  $client.Timeout = [TimeSpan]::FromSeconds(8)
  foreach ($site in $sites) { $requests[$site] = $client.GetAsync("https://$site/") }
} catch {
  # Geen client: alles telt hieronder als onbereikbaar.
}

$blocked = @()
foreach ($site in $sites) {
  $ok = $false
  try {
    if ($requests.ContainsKey($site)) {
      # Elk antwoord van de site telt, ook een foutcode. Behalve 407: dat is een proxy van je
      # werkgever die eerst een wachtwoord wil, en dan kwam de site zelf niet aan bod.
      $response = $requests[$site].GetAwaiter().GetResult()
      $ok = ($null -ne $response) -and ([int]$response.StatusCode -ne 407)
      if ($null -ne $response) { $response.Dispose() }
    }
  } catch {
    $ok = $false
  }
  if ($ok) { Write-Ok "$site is bereikbaar." } else { $blocked += $site }
}
if ($null -ne $client) { $client.Dispose() }
if ($blocked.Count -gt 0) {
  Write-Actie "Niet bereikbaar: $($blocked -join ', ')." @(
    'Controleer eerst of je internet hebt. Werkt de rest van internet wel, dan blokkeert',
    'waarschijnlijk een proxy of firewall van je werkgever deze sites. Overleg met IT:',
    'deze vier moeten bereikbaar zijn, ook voor Git, Node.js en Claude Code.'
  )
}

# --- Slot ------------------------------------------------------------------------------------

Write-Host ''
if ($script:Todo -eq 0) {
  Write-Host 'Alles in orde.' -ForegroundColor Green
  exit 0
}
if ($script:Todo -eq 1) {
  Write-Host 'Nog 1 ding te doen. Los het op en draai dit script opnieuw.' -ForegroundColor Red
} else {
  Write-Host "Nog $($script:Todo) dingen te doen. Los ze op en draai dit script opnieuw." -ForegroundColor Red
}
exit 1
