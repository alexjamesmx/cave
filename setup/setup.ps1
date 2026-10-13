$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent

function Test-Command($name) { [bool](Get-Command $name -ErrorAction SilentlyContinue) }

function Update-SessionPath {
  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$machine;$user;$env:USERPROFILE\.local\bin;$env:USERPROFILE\.bun\bin"
}

Write-Host "`n== Tools" -ForegroundColor Cyan
if (-not (Test-Command git)) { winget install --id Git.Git -e --source winget }
if (-not (Test-Command node)) { winget install --id OpenJS.NodeJS.LTS -e --source winget }
if (-not (Test-Command bun)) { Invoke-RestMethod https://bun.sh/install.ps1 | Invoke-Expression }
if (-not (Test-Command claude)) { Invoke-RestMethod https://claude.ai/install.ps1 | Invoke-Expression }
Update-SessionPath
foreach ($tool in 'git', 'node', 'bun', 'claude') {
  if (-not (Test-Command $tool)) { throw "$tool is still not on PATH. Open a new terminal and run setup again." }
  Write-Host ("{0,-7} {1}" -f $tool, (& $tool --version | Select-Object -First 1))
}

Write-Host "`n== API keys (stored as user environment variables, never in the repo)" -ForegroundColor Cyan
$keys = [ordered]@{
  CONTEXT7_API_KEY  = 'https://context7.com/dashboard'
  EXA_API_KEY       = 'https://dashboard.exa.ai/api-keys'
  FIRECRAWL_API_KEY = 'https://www.firecrawl.dev/app/api-keys'
  GITHUB_PAT        = 'https://github.com/settings/personal-access-tokens/new'
}
foreach ($name in $keys.Keys) {
  if ([Environment]::GetEnvironmentVariable($name, 'User')) { Write-Host "$name already set"; continue }
  $secure = Read-Host "$name (create at $($keys[$name]); Enter to skip)" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $value = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  if ($value) {
    [Environment]::SetEnvironmentVariable($name, $value, 'User')
    Set-Item "env:$name" $value
  } else {
    Write-Host "$name skipped: that MCP server will fail to connect until it is set." -ForegroundColor Yellow
  }
}

Write-Host "`n== Global Claude rules" -ForegroundColor Cyan
$userDir = Join-Path $HOME '.claude'
New-Item -ItemType Directory -Force $userDir | Out-Null
$target = Join-Path $userDir 'CLAUDE.md'
if (Test-Path $target) {
  Copy-Item (Join-Path $PSScriptRoot 'user-CLAUDE.md') "$target.suggested" -Force
  Write-Host "Kept your existing $target. Suggested version: $target.suggested"
} else {
  Copy-Item (Join-Path $PSScriptRoot 'user-CLAUDE.md') $target
  Write-Host "Wrote $target"
}

Write-Host "`n== Playwright MCP (user scope)" -ForegroundColor Cyan
try { claude mcp get playwright *> $null; $hasPlaywright = $LASTEXITCODE -eq 0 } catch { $hasPlaywright = $false }
if (-not $hasPlaywright) {
  claude mcp add --scope user playwright -- cmd /c npx -y '@playwright/mcp@latest'
} else {
  Write-Host 'playwright already configured'
}

Write-Host "`n== Plugins" -ForegroundColor Cyan
$plugins = 'superpowers', 'feature-dev', 'code-review', 'commit-commands', 'security-guidance', 'skill-creator', 'claude-md-management'
foreach ($plugin in $plugins) { claude plugin install "$plugin@claude-plugins-official" }

Write-Host "`n== Project config" -ForegroundColor Cyan
$projectFiles = [ordered]@{ 'mcp.json' = '.mcp.json'; 'claude-settings.json' = '.claude\settings.json' }
foreach ($source in $projectFiles.Keys) {
  $destination = Join-Path $root $projectFiles[$source]
  if (Test-Path $destination) { Write-Host "$($projectFiles[$source]) exists, left unchanged"; continue }
  New-Item -ItemType Directory -Force (Split-Path $destination) | Out-Null
  Copy-Item (Join-Path $PSScriptRoot $source) $destination
  Write-Host "Wrote $($projectFiles[$source])"
}

Write-Host "`n== Repository" -ForegroundColor Cyan
if (-not (Test-Path (Join-Path $root '.git'))) { git -C $root init -b main }

Write-Host "`nDone. Next:" -ForegroundColor Green
Write-Host "  cd `"$root`""
Write-Host '  claude        (approve the project MCP servers when asked, then run /mcp to check them)'
