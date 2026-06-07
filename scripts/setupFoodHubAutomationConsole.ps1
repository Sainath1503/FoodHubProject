$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Write-SetupLog([string]$phase, [string]$tool, [string]$status, [string]$detail = "") {
  $timestamp = Get-Date -Format "HH:mm:ss"
  $message = "[{0}] [{1}] {2,-18} {3}" -f $timestamp, $phase, $tool, $status
  if ($detail) {
    $message = "$message - $detail"
  }
  Write-Host $message
}

function Test-Command([string]$command) {
  return $null -ne (Get-Command $command -ErrorAction SilentlyContinue)
}

function Resolve-Executable([string[]]$commands) {
  foreach ($command in $commands) {
    $resolved = Get-Command $command -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($resolved) {
      return $resolved.Source
    }
  }

  return ""
}

function Get-CommandOutput([string]$command, [string[]]$arguments) {
  if (!(Test-Command $command)) {
    return ""
  }

  try {
    return (& $command @arguments 2>$null | Select-Object -First 1)
  } catch {
    return ""
  }
}

function Get-NodeMajorVersion {
  $version = Get-CommandOutput "node" @("--version")
  if ($version -match "^v(\d+)\.") {
    return [int]$Matches[1]
  }

  return 0
}

function Update-ProcessPath {
  $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = @($machinePath, $userPath) -join ";"
}

function Install-Node20 {
  if (!(Test-Command "winget")) {
    throw "Node.js 20+ is missing and winget is not available. Install Node.js 20 LTS manually, then run this setup again."
  }

  Write-SetupLog "Install" "Node.js 20+" "START" "Installing OpenJS Node.js LTS with winget"
  winget install --id OpenJS.NodeJS.LTS --exact --silent --accept-package-agreements --accept-source-agreements
  if ($LASTEXITCODE -ne 0) {
    throw "winget could not install Node.js 20 LTS. Install it manually, then run this setup again."
  }

  Update-ProcessPath
}

function Run-NpmCommand([string]$command, [string[]]$commandArguments = @()) {
  $npmCommand = Resolve-Executable @("npm.cmd", "npm.exe", "npm")
  if (!$npmCommand) {
    throw "npm executable was not found on PATH."
  }

  $allArguments = @($command) + $commandArguments
  $display = "npm $($allArguments -join ' ')"
  Write-SetupLog "Command" $display "START"
  & $npmCommand @allArguments
  if ($LASTEXITCODE -ne 0) {
    throw "$display failed with exit code $LASTEXITCODE."
  }
  Write-SetupLog "Command" $display "OK"
}

function Stop-AutomationConsole {
  $processes = Get-Process -Name "FoodHubAutomationConsole" -ErrorAction SilentlyContinue
  if (!$processes) {
    return
  }

  Write-SetupLog "Setup" "Automation Console" "STOP" "Closing running instance before rebuild"
  $processes | Stop-Process -Force
}

Write-Host "FoodHub Automation Console setup"
Write-Host "Repository: $repoRoot"
Write-Host ""

$nodeMajor = Get-NodeMajorVersion
$nodeVersion = Get-CommandOutput "node" @("--version")
if ($nodeMajor -ge 20) {
  Write-SetupLog "Prerequisite check" "Node.js 20+" "OK" $nodeVersion
} else {
  $detail = if ($nodeVersion) { "Found $nodeVersion; Node.js 20+ is required" } else { "Not installed" }
  Write-SetupLog "Prerequisite check" "Node.js 20+" "MISSING" $detail
  Install-Node20

  $nodeMajor = Get-NodeMajorVersion
  $nodeVersion = Get-CommandOutput "node" @("--version")
  if ($nodeMajor -lt 20) {
    throw "Node.js 20+ is still not available after installation. Restart this terminal or machine, then run setup again."
  }
  Write-SetupLog "Prerequisite check" "Node.js 20+" "OK" $nodeVersion
}

$npmCommand = Resolve-Executable @("npm.cmd", "npm.exe", "npm")
$npmVersion = if ($npmCommand) { (& $npmCommand "--version" 2>$null | Select-Object -First 1) } else { "" }
if ($npmVersion) {
  Write-SetupLog "Prerequisite check" "npm" "OK" $npmVersion
} else {
  throw "npm is missing after Node.js setup. Reinstall Node.js 20 LTS, then run this setup again."
}

Push-Location $repoRoot
try {
  Run-NpmCommand "install"
  Stop-AutomationConsole
  Run-NpmCommand "run" @("build:qa-report-viewer")
} finally {
  Pop-Location
}
