param(
  [switch]$SkipMavenPackage
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$viewerRoot = Join-Path $repoRoot "qa-report-viewer"
$targetRoot = Join-Path $viewerRoot "target"
$packageInput = Join-Path $targetRoot "package-input"
$packageOutput = Join-Path $targetRoot "package"
$appImage = Join-Path $packageOutput "FoodHubQAReportViewer"
$rootExe = Join-Path $repoRoot "FoodHubQAReportViewer.exe"
$rootIcon = Join-Path $repoRoot "FoodHubQAReportViewer.ico"
$rootApp = Join-Path $repoRoot "app"
$rootRuntime = Join-Path $repoRoot "runtime"
$viewerIcon = Join-Path $viewerRoot "src\main\resources\com\foodhub\tools\qareportviewer\foodhub-report-viewer.ico"

if (!(Test-Path $viewerRoot)) {
  throw "QA report viewer project was not found at $viewerRoot"
}

Push-Location $viewerRoot
try {
  if (!$SkipMavenPackage) {
    mvn clean package
  }

  Remove-Item -LiteralPath $packageInput -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $packageOutput -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path $packageInput | Out-Null

  Copy-Item -LiteralPath (Join-Path $targetRoot "qa-report-viewer-1.0.0.jar") -Destination $packageInput
  Copy-Item -Path (Join-Path $targetRoot "dependency\*.jar") -Destination $packageInput

  jpackage `
    --type app-image `
    --name FoodHubQAReportViewer `
    --input $packageInput `
    --main-jar qa-report-viewer-1.0.0.jar `
    --main-class com.foodhub.tools.qareportviewer.MainLauncher `
    --icon $viewerIcon `
    --dest $packageOutput
}
finally {
  Pop-Location
}

if (!(Test-Path $appImage)) {
  throw "jpackage did not create the expected app image at $appImage"
}

foreach ($path in @($rootExe, $rootIcon, $rootApp, $rootRuntime)) {
  $resolvedRoot = [System.IO.Path]::GetFullPath($repoRoot)
  $resolvedPath = [System.IO.Path]::GetFullPath($path)
  if (!$resolvedPath.StartsWith($resolvedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to clean path outside repository root: $resolvedPath"
  }
  Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction SilentlyContinue
}

Copy-Item -LiteralPath (Join-Path $appImage "FoodHubQAReportViewer.exe") -Destination $repoRoot
Copy-Item -LiteralPath (Join-Path $appImage "FoodHubQAReportViewer.ico") -Destination $repoRoot
Copy-Item -LiteralPath (Join-Path $appImage "app") -Destination $repoRoot -Recurse
Copy-Item -LiteralPath (Join-Path $appImage "runtime") -Destination $repoRoot -Recurse

Remove-Item -LiteralPath $packageOutput -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "FoodHubQAReportViewer.exe published to $rootExe"
