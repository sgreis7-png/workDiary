# Run the converter on this machine, reading Supabase settings from the app's .env.
# Docker is the deployment path; this is for developing against `npm run dev`.
#
#   pwsh services/mpp-converter/run-local.ps1
#
# Needs a full JRE. Point MPP_JAVA_HOME at one, or unpack Temurin under ~/.local/jre —
# a trimmed runtime cannot read .mpp (see README.md).

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path $here '..\..\.env'

if (-not (Test-Path $envFile)) { throw "No .env at $envFile" }

foreach ($line in Get-Content $envFile) {
  if ($line -match '^\s*VITE_SUPABASE_URL\s*=\s*(.+)$')      { $env:SUPABASE_URL = $Matches[1].Trim() }
  if ($line -match '^\s*VITE_SUPABASE_ANON_KEY\s*=\s*(.+)$') { $env:SUPABASE_ANON_KEY = $Matches[1].Trim() }
}
if (-not $env:SUPABASE_URL -or -not $env:SUPABASE_ANON_KEY) {
  throw 'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in .env'
}

if (-not $env:MPP_JAVA_HOME) {
  $jre = Get-ChildItem "$HOME\.local\jre" -Directory -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending | Select-Object -First 1
  if ($jre) { $env:MPP_JAVA_HOME = $jre.FullName }
}

# the Vite dev server, so the browser's preflight passes
$env:MPP_ALLOWED_ORIGINS = 'http://localhost:5173,http://127.0.0.1:5173'

Write-Host "java: $env:MPP_JAVA_HOME"
Write-Host "supabase: $env:SUPABASE_URL"
python (Join-Path $here 'app.py')
