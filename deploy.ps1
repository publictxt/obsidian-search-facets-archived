# Build the plugin and copy it into a vault's .obsidian/plugins folder.
#
#   .\deploy.ps1                       # deploys to the default test vault (..\publictxt\txt)
#   .\deploy.ps1 -Vault C:\path\vault  # deploys elsewhere
#   .\deploy.ps1 -NoBuild              # copies the existing main.js without rebuilding
#
# Reload Obsidian (or toggle the plugin) afterwards to pick up the new build.

param(
    [string]$Vault = (Join-Path $PSScriptRoot "..\publictxt\txt"),
    [switch]$NoBuild
)

$ErrorActionPreference = "Stop"

$manifest = Get-Content (Join-Path $PSScriptRoot "manifest.json") -Raw | ConvertFrom-Json
$id = $manifest.id

if (-not (Test-Path $Vault)) { throw "Vault path '$Vault' does not exist" }
$obsidianDir = Join-Path $Vault ".obsidian"
if (-not (Test-Path $obsidianDir)) { throw "'$obsidianDir' not found. Open the vault in Obsidian once first." }

if (-not $NoBuild) {
    Push-Location $PSScriptRoot
    try {
        npm run build
        if ($LASTEXITCODE -ne 0) { throw "Build failed" }
    } finally {
        Pop-Location
    }
}

$target = Join-Path $obsidianDir "plugins\$id"
New-Item -ItemType Directory -Force $target | Out-Null

foreach ($f in "main.js", "manifest.json", "styles.css") {
    $src = Join-Path $PSScriptRoot $f
    if (Test-Path $src) { Copy-Item $src $target -Force }
}

Write-Host "Deployed $id $($manifest.version) to $target"
