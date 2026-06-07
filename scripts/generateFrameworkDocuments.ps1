$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$outputDir = Join-Path $repoRoot "Framework Documents"

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

function Escape-Xml([string]$text) {
  if ($null -eq $text) {
    return ""
  }
  return [System.Security.SecurityElement]::Escape($text)
}

function Paragraph([string]$text, [string]$style = "Normal") {
  $escaped = Escape-Xml $text
  $styleXml = if ($style -eq "Normal") { "" } else { "<w:pPr><w:pStyle w:val=`"$style`"/></w:pPr>" }
  return "<w:p>$styleXml<w:r><w:t xml:space=`"preserve`">$escaped</w:t></w:r></w:p>"
}

function CodeParagraph([string]$text) {
  $escaped = Escape-Xml $text
  return "<w:p><w:pPr><w:pStyle w:val=`"Code`"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii=`"Consolas`" w:hAnsi=`"Consolas`"/><w:sz w:val=`"18`"/></w:rPr><w:t xml:space=`"preserve`">$escaped</w:t></w:r></w:p>"
}

function New-Section([string]$Heading, [string[]]$Paragraphs) {
  [pscustomobject]@{
    Heading = $Heading
    Paragraphs = $Paragraphs
  }
}

function New-Docx($doc) {
  $safeName = $doc.FileName
  $target = Join-Path $outputDir $safeName
  $temp = Join-Path ([System.IO.Path]::GetTempPath()) ("foodhub-docx-" + [Guid]::NewGuid())
  $wordDir = Join-Path $temp "word"
  $relsDir = Join-Path $temp "_rels"
  $wordRelsDir = Join-Path $wordDir "_rels"
  New-Item -ItemType Directory -Force -Path $wordDir | Out-Null
  New-Item -ItemType Directory -Force -Path $relsDir | Out-Null
  New-Item -ItemType Directory -Force -Path $wordRelsDir | Out-Null

  $body = New-Object System.Collections.Generic.List[string]
  $body.Add((Paragraph $doc.Title "Title"))
  $body.Add((Paragraph ("Audience: " + $doc.Audience) "Subtitle"))
  $body.Add((Paragraph ("Purpose: " + $doc.Purpose) "Subtitle"))
  $body.Add((Paragraph ("Generated: " + (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")) "Subtitle"))

  foreach ($section in $doc.Sections) {
    $body.Add((Paragraph $section.Heading "Heading1"))
    foreach ($line in $section.Paragraphs) {
      if ($line.StartsWith("CODE:")) {
        $body.Add((CodeParagraph $line.Substring(5)))
      } elseif ($line.StartsWith("- ")) {
        $body.Add((Paragraph $line "ListParagraph"))
      } else {
        $body.Add((Paragraph $line))
      }
    }
  }

  $documentXml = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    $($body -join "`n")
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="900" w:right="900" w:bottom="900" w:left="900" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>
"@

  $stylesXml = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/>
    <w:rPr><w:b/><w:color w:val="1F4E79"/><w:sz w:val="36"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Subtitle">
    <w:name w:val="Subtitle"/>
    <w:rPr><w:color w:val="666666"/><w:sz w:val="20"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="Heading 1"/>
    <w:pPr><w:spacing w:before="280" w:after="80"/></w:pPr>
    <w:rPr><w:b/><w:color w:val="2F5496"/><w:sz w:val="28"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="ListParagraph">
    <w:name w:val="List Paragraph"/>
    <w:pPr><w:ind w:left="360"/></w:pPr>
    <w:rPr><w:sz w:val="22"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Code">
    <w:name w:val="Code"/>
    <w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="18"/></w:rPr>
  </w:style>
</w:styles>
"@

  $contentTypes = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>
"@

  $rels = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>
"@

  $documentRels = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>
"@

  Set-Content -LiteralPath (Join-Path $temp "[Content_Types].xml") -Value $contentTypes -Encoding UTF8
  Set-Content -LiteralPath (Join-Path $relsDir ".rels") -Value $rels -Encoding UTF8
  Set-Content -LiteralPath (Join-Path $wordDir "document.xml") -Value $documentXml -Encoding UTF8
  Set-Content -LiteralPath (Join-Path $wordRelsDir "document.xml.rels") -Value $documentRels -Encoding UTF8
  Set-Content -LiteralPath (Join-Path $wordDir "styles.xml") -Value $stylesXml -Encoding UTF8

  if (Test-Path -LiteralPath $target) {
    Remove-Item -LiteralPath $target -Force
  }

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [System.IO.Compression.ZipFile]::CreateFromDirectory($temp, $target)
  Remove-Item -LiteralPath $temp -Recurse -Force
  Write-Host "Created $target"
}

function New-ArchitectureDiagramHtml {
  $target = Join-Path $outputDir "15 Framework Architecture Diagrams.html"
  $html = @'
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>FoodHub Framework Architecture Diagrams</title>
  <style>
    body {
      margin: 0;
      font-family: "Segoe UI", Arial, sans-serif;
      color: #172033;
      background: #f5f7fb;
    }
    header {
      padding: 32px 44px 20px;
      background: #12355b;
      color: white;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 30px;
    }
    main {
      padding: 28px 44px 44px;
      display: grid;
      gap: 28px;
    }
    section {
      background: white;
      border: 1px solid #d8deea;
      border-radius: 8px;
      padding: 22px;
      box-shadow: 0 10px 24px rgba(18, 53, 91, 0.08);
    }
    h2 {
      margin: 0 0 16px;
      color: #12355b;
      font-size: 22px;
    }
    svg {
      width: 100%;
      max-width: 1180px;
      height: auto;
      display: block;
      margin: 0 auto;
    }
    .box {
      fill: #ffffff;
      stroke: #2f6f9f;
      stroke-width: 2;
      rx: 10;
    }
    .store {
      fill: #edf7f2;
      stroke: #2d8a5f;
      stroke-width: 2;
      rx: 10;
    }
    .ai {
      fill: #f7f0ff;
      stroke: #7c4dbe;
      stroke-width: 2;
      rx: 10;
    }
    .ci {
      fill: #fff7e8;
      stroke: #cc7a00;
      stroke-width: 2;
      rx: 10;
    }
    .label {
      font: 600 16px "Segoe UI", Arial, sans-serif;
      fill: #172033;
    }
    .small {
      font: 13px "Segoe UI", Arial, sans-serif;
      fill: #4d5b73;
    }
    .arrow {
      stroke: #53657d;
      stroke-width: 2.2;
      fill: none;
      marker-end: url(#arrow);
    }
    .note {
      margin: 14px auto 0;
      max-width: 1100px;
      color: #4d5b73;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <header>
    <h1>FoodHub Framework Architecture Diagrams</h1>
    <div>Readable architecture diagrams for architects, developers, QA leads, and management.</div>
  </header>
  <main>
    <section>
      <h2>1. Framework Component Architecture</h2>
      <svg viewBox="0 0 1180 620" role="img" aria-label="FoodHub framework component architecture">
        <defs>
          <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L0,6 L9,3 z" fill="#53657d"></path>
          </marker>
        </defs>
        <rect class="box" x="430" y="30" width="320" height="72"></rect>
        <text class="label" x="590" y="62" text-anchor="middle">FoodHub Automation Console</text>
        <text class="small" x="590" y="84" text-anchor="middle">services, tests, reports, docs, AI switch</text>

        <rect class="box" x="60" y="170" width="270" height="78"></rect>
        <text class="label" x="195" y="202" text-anchor="middle">FoodHub API</text>
        <text class="small" x="195" y="224" text-anchor="middle">menu, order, health, OpenAPI</text>

        <rect class="box" x="455" y="170" width="270" height="78"></rect>
        <text class="label" x="590" y="202" text-anchor="middle">Payment Gateway</text>
        <text class="small" x="590" y="224" text-anchor="middle">approval, decline, invoice data</text>

        <rect class="box" x="850" y="170" width="270" height="78"></rect>
        <text class="label" x="985" y="202" text-anchor="middle">Automation Test Layers</text>
        <text class="small" x="985" y="224" text-anchor="middle">unit, API, Pact, E2E, load</text>

        <rect class="store" x="60" y="340" width="310" height="86"></rect>
        <text class="label" x="215" y="374" text-anchor="middle">Firebase Realtime DB</text>
        <text class="small" x="215" y="398" text-anchor="middle">shared observability metrics</text>

        <rect class="ai" x="435" y="340" width="310" height="86"></rect>
        <text class="label" x="590" y="374" text-anchor="middle">Cloud Firestore + DeepSeek</text>
        <text class="small" x="590" y="398" text-anchor="middle">API key lookup and live AI analysis</text>

        <rect class="ci" x="810" y="340" width="310" height="86"></rect>
        <text class="label" x="965" y="374" text-anchor="middle">GitHub Actions CI/CD</text>
        <text class="small" x="965" y="398" text-anchor="middle">quality gates and artifacts</text>

        <rect class="box" x="230" y="500" width="320" height="72"></rect>
        <text class="label" x="390" y="532" text-anchor="middle">Excel / HTML Reports</text>
        <text class="small" x="390" y="554" text-anchor="middle">QA report, observability, AI analysis</text>

        <rect class="box" x="630" y="500" width="320" height="72"></rect>
        <text class="label" x="790" y="532" text-anchor="middle">Framework Documents</text>
        <text class="small" x="790" y="554" text-anchor="middle">audience guides and diagrams</text>

        <path class="arrow" d="M500 102 L245 170"></path>
        <path class="arrow" d="M590 102 L590 170"></path>
        <path class="arrow" d="M680 102 L935 170"></path>
        <path class="arrow" d="M195 248 L215 340"></path>
        <path class="arrow" d="M985 248 L965 340"></path>
        <path class="arrow" d="M590 248 L590 340"></path>
        <path class="arrow" d="M215 426 L390 500"></path>
        <path class="arrow" d="M590 426 L390 500"></path>
        <path class="arrow" d="M965 426 L790 500"></path>
        <path class="arrow" d="M590 102 L790 500"></path>
      </svg>
      <p class="note">The console is the user-facing command center. It launches services/tests, opens reports, toggles live AI, and opens framework documents. Firebase and Firestore provide shared metrics and live AI configuration support.</p>
    </section>

    <section>
      <h2>2. Observability Data Flow</h2>
      <svg viewBox="0 0 1180 390" role="img" aria-label="Observability data flow">
        <defs>
          <marker id="arrow2" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L0,6 L9,3 z" fill="#53657d"></path>
          </marker>
        </defs>
        <rect class="box" x="40" y="120" width="210" height="76"></rect>
        <text class="label" x="145" y="151" text-anchor="middle">Tests + App</text>
        <text class="small" x="145" y="174" text-anchor="middle">requests and execution</text>

        <rect class="box" x="310" y="120" width="230" height="76"></rect>
        <text class="label" x="425" y="151" text-anchor="middle">Local Artifacts</text>
        <text class="small" x="425" y="174" text-anchor="middle">logs, HTML report, JSON</text>

        <rect class="store" x="600" y="120" width="245" height="76"></rect>
        <text class="label" x="722" y="151" text-anchor="middle">Firebase Realtime DB</text>
        <text class="small" x="722" y="174" text-anchor="middle">/observability shared store</text>

        <rect class="box" x="905" y="120" width="235" height="76"></rect>
        <text class="label" x="1022" y="151" text-anchor="middle">Observability Dashboard</text>
        <text class="small" x="1022" y="174" text-anchor="middle">Excel workbook and charts</text>

        <path class="arrow" marker-end="url(#arrow2)" d="M250 158 L310 158"></path>
        <path class="arrow" marker-end="url(#arrow2)" d="M540 158 L600 158"></path>
        <path class="arrow" marker-end="url(#arrow2)" d="M845 158 L905 158"></path>
      </svg>
      <p class="note">Local and CI runs push metrics into the same Firebase-backed observability path, then dashboard generation pulls the shared snapshot for trend and route/status analysis.</p>
    </section>

    <section>
      <h2>3. Live AI Analysis Flow</h2>
      <svg viewBox="0 0 1180 470" role="img" aria-label="Live AI analysis flow">
        <rect class="box" x="60" y="60" width="240" height="76"></rect>
        <text class="label" x="180" y="91" text-anchor="middle">FOODHUB_AI_LIVE</text>
        <text class="small" x="180" y="114" text-anchor="middle">console switch / config</text>

        <rect class="box" x="440" y="30" width="270" height="76"></rect>
        <text class="label" x="575" y="61" text-anchor="middle">False</text>
        <text class="small" x="575" y="84" text-anchor="middle">fallback rows and prompts</text>

        <rect class="ai" x="440" y="170" width="270" height="76"></rect>
        <text class="label" x="575" y="201" text-anchor="middle">True</text>
        <text class="small" x="575" y="224" text-anchor="middle">Firestore key + DeepSeek</text>

        <rect class="box" x="830" y="100" width="290" height="86"></rect>
        <text class="label" x="975" y="133" text-anchor="middle">AI Test Analysis Workbook</text>
        <text class="small" x="975" y="157" text-anchor="middle">failure, scenarios, test data</text>

        <rect class="box" x="315" y="330" width="250" height="76"></rect>
        <text class="label" x="440" y="361" text-anchor="middle">Failure Analysis</text>
        <text class="small" x="440" y="384" text-anchor="middle">deepseek-v4-pro high</text>

        <rect class="box" x="610" y="330" width="250" height="76"></rect>
        <text class="label" x="735" y="361" text-anchor="middle">Scenario Analysis</text>
        <text class="small" x="735" y="384" text-anchor="middle">deepseek-v4-flash medium</text>

        <path class="arrow" d="M300 98 L440 68"></path>
        <path class="arrow" d="M300 98 L440 208"></path>
        <path class="arrow" d="M710 68 L830 130"></path>
        <path class="arrow" d="M710 208 L830 156"></path>
        <path class="arrow" d="M575 246 L440 330"></path>
        <path class="arrow" d="M575 246 L735 330"></path>
        <path class="arrow" d="M860 368 L975 186"></path>
      </svg>
      <p class="note">When live AI is off, the same workbook still populates using deterministic fallback logic. When live AI is on, DeepSeek responses are normalized into stable workbook columns.</p>
    </section>
  </main>
</body>
</html>
'@

  Set-Content -LiteralPath $target -Value $html -Encoding UTF8
  Write-Host "Created $target"
}

$commonSections = @(
  New-Section "Framework Snapshot" @(
    "FoodHub combines a Node.js API, a fake payment gateway, layered automated tests, AI-assisted analysis, Firebase observability, and a desktop automation console.",
    "- Primary app: Express and TypeScript APIs for menu, order, health, OpenAPI, and payment callback flows.",
    "- Automation layers: unit, integration, contract, E2E, load, coverage, visual snapshots, and report generation.",
    "- Shared visibility: Firebase Realtime Database stores observability metrics across local users and CI/CD."
  ),
  New-Section "Core Commands" @(
    "Use the console for common operations. The commands below remain useful for terminal users.",
    "CODE:npm install",
    "CODE:npm run dev",
    "CODE:npm run test",
    "CODE:npm run observability:refresh",
    "CODE:npm run ai:coverage"
  )
)

$documents = @(
  [pscustomobject]@{
    FileName = "01 Executive Overview.docx"
    Title = "FoodHub Framework - Executive Overview"
    Audience = "Directors, CIOs, management, delivery leaders"
    Purpose = "Explain business value, visibility, governance, and decision support."
    Sections = @(
      New-Section "Value Proposition" @(
        "The framework demonstrates a quality engineering operating model, not just a set of tests. It combines repeatable execution, reporting, AI-assisted analysis, and shared observability.",
        "- Reduces manual coordination by centralizing test execution in FoodHub Automation Console.",
        "- Improves release confidence with automated gates across API, UI, contract, load, persistence, and coverage.",
        "- Gives managers shared execution visibility through generated reports and Firebase-backed metrics."
      ),
      New-Section "Management Outcomes" @(
        "- Faster evidence collection for release readiness.",
        "- Traceable quality signals for engineering and QA leadership.",
        "- Clear separation between live AI recommendations and deterministic fallback output.",
        "- Portable framework assets that can be reused in local execution and CI/CD."
      ),
      New-Section "Decision Points" @(
        "- Whether Firebase Test Mode is acceptable for demos or needs production security hardening.",
        "- Whether DeepSeek live AI should be enabled for each execution cycle.",
        "- Which reports should be reviewed as part of release governance."
      )
    ) + $commonSections
  },
  [pscustomobject]@{
    FileName = "02 Architecture Guide.docx"
    Title = "FoodHub Framework - Architecture Guide"
    Audience = "Architects and senior engineers"
    Purpose = "Describe system components, data flows, test architecture, and integration points."
    Sections = @(
      New-Section "Component Architecture" @(
        "- FoodHub API: Express application exposing health, menu, order, OpenAPI, and API docs.",
        "- Payment Gateway: fake gateway used to validate approval, decline, and invoice flows.",
        "- Test Harness: Vitest, Supertest, Pact, Playwright, Testcontainers, and k6.",
        "- Automation Console: JavaFX desktop launcher for services, tests, reports, docs, and AI toggle.",
        "- Firebase Realtime Database: shared observability metrics store.",
        "- Cloud Firestore: DeepSeek API key source when live AI mode is enabled."
      ),
      New-Section "Data Flow" @(
        "Runtime requests are logged locally, summarized into metrics JSON, ingested into Firebase Realtime Database, and pulled back into the observability workbook.",
        "AI analysis reads project context and failure logs, optionally calls DeepSeek, and writes FoodHub-AI-Test-Analysis.xlsx."
      ),
      New-Section "Architecture Diagrams" @(
        "Open the separate document named 15 Framework Architecture Diagrams.docx for layout diagrams that can be pasted into design decks."
      )
    ) + $commonSections
  },
  [pscustomobject]@{
    FileName = "03 Quick Start Guide.docx"
    Title = "FoodHub Framework - Quick Start Guide"
    Audience = "All users"
    Purpose = "Get a new user running the framework quickly."
    Sections = @(
      New-Section "First Run" @(
        "Install dependencies and start from the automation console whenever possible.",
        "CODE:npm install",
        "CODE:npm run build:qa-report-viewer",
        "CODE:FoodHubAutomationConsole.exe"
      ),
      New-Section "Common Console Actions" @(
        "- Start Service to launch FoodHub and gateway services.",
        "- Use Test Runner to run a selected test group.",
        "- Refresh Observability Dashboard to push/pull Firebase metrics.",
        "- Open FoodHub AI Test Analysis Report to review AI-generated or fallback analysis.",
        "- Use Framework Documents to open this documentation set."
      ),
      New-Section "Terminal Fallback" @(
        "If the console is unavailable, run commands directly.",
        "CODE:npm run test:unit",
        "CODE:npm run test:integration",
        "CODE:npm run test:e2e",
        "CODE:npm run test:report"
      )
    ) + $commonSections
  },
  [pscustomobject]@{
    FileName = "04 Developer Guide.docx"
    Title = "FoodHub Framework - Developer Guide"
    Audience = "Developers"
    Purpose = "Explain code layout, development workflow, and validation commands."
    Sections = @(
      New-Section "Code Areas" @(
        "- src/app.ts contains the Express app wiring.",
        "- src/services contains order, payment, and recommendation business logic.",
        "- src/data contains persistence repositories.",
        "- public and payment-public contain browser UI assets.",
        "- tests contains unit, integration, contract, E2E, load, and fixture assets."
      ),
      New-Section "Developer Workflow" @(
        "- Add or update service logic.",
        "- Add focused unit tests for business rules.",
        "- Add integration tests for API behavior.",
        "- Update contract or E2E tests when external behavior changes.",
        "- Run build and relevant tests before pushing."
      ),
      New-Section "Validation Commands" @(
        "CODE:npm run build:ci",
        "CODE:npm run test:unit",
        "CODE:npm run test:integration",
        "CODE:npm run test:contract"
      )
    ) + $commonSections
  },
  [pscustomobject]@{
    FileName = "05 Tester Guide.docx"
    Title = "FoodHub Framework - Tester Guide"
    Audience = "Automation testers and QA engineers"
    Purpose = "Explain test execution, evidence, reports, and interpretation."
    Sections = @(
      New-Section "Test Layers" @(
        "- Unit tests validate service-level rules quickly.",
        "- Integration tests validate API request and response behavior.",
        "- Pact contract tests protect consumer/provider agreements.",
        "- Playwright E2E tests validate user journeys and screenshots.",
        "- k6 load tests validate latency and failure thresholds.",
        "- Coverage gate enforces critical logic coverage."
      ),
      New-Section "Evidence Artifacts" @(
        "- qa-artifacts/test-report.html summarizes all test levels.",
        "- qa-artifacts/FoodHub-Observability-Dashboard.xlsx shows Firebase-backed trends.",
        "- qa-artifacts/FoodHub-AI-Test-Analysis.xlsx contains AI or fallback analysis.",
        "- playwright-report/index.html contains E2E execution evidence."
      ),
      New-Section "Recommended Flow" @(
        "Run selected tests, generate the QA report, refresh observability, and review AI analysis for scenario gaps and test data suggestions."
      )
    ) + $commonSections
  },
  [pscustomobject]@{
    FileName = "06 Functional Tester UAT Guide.docx"
    Title = "FoodHub Framework - Functional Tester and UAT Guide"
    Audience = "Manual testers, functional testers, UAT participants"
    Purpose = "Describe business scenarios and expected behavior."
    Sections = @(
      New-Section "Core Business Scenarios" @(
        "- Browse menu and verify item names, categories, and prices.",
        "- Add items to cart and verify totals.",
        "- Submit an approved payment and verify order confirmation.",
        "- Submit a declined payment and verify order is not created.",
        "- Open invoice and verify transaction id, order id, card last four, and customer name."
      ),
      New-Section "Useful Test Data" @(
        "- Approved checkout fixture for happy path.",
        "- Declined card fixture for negative payment path.",
        "- Duplicate item order for total calculation checks.",
        "- Boundary quantity order for large-order checks."
      ),
      New-Section "Defect Reporting" @(
        "Capture expected result, actual result, browser, timestamp, test data, screenshots, and the related report artifact when raising a defect."
      )
    ) + $commonSections
  },
  [pscustomobject]@{
    FileName = "07 FoodHub Automation Console Guide.docx"
    Title = "FoodHub Automation Console Guide"
    Audience = "All hands-on users"
    Purpose = "Explain every console tab and common user actions."
    Sections = @(
      New-Section "Observability and Reporting Tab" @(
        "- Opens QA test report, Playwright report, coverage report, observability dashboard, and AI analysis report.",
        "- Refresh Observability Dashboard collects metrics, writes Firebase, pulls snapshot, and generates the workbook.",
        "- Reset Firebase Observability Logs clears shared Firebase dashboard history for maintenance or fresh runs."
      ),
      New-Section "Services and Test Runner Tab" @(
        "- Starts and stops FoodHub services.",
        "- Shows app, Swagger, and payment gateway URLs.",
        "- Toggles Live AI with FOODHUB_AI_LIVE.",
        "- Runs selected test groups through the dropdown.",
        "- All Tests runs local checks in parallel with fail-fast behavior.",
        "- Stop terminates the active command, releases spawned resources, and marks pending checks as skipped in the QA report."
      ),
      New-Section "Framework Documents Tab" @(
        "- Lists Word/PDF documents from the Framework Documents folder.",
        "- Opens the selected document in the default desktop application."
      )
    ) + $commonSections
  },
  [pscustomobject]@{
    FileName = "08 AI Test Analysis Guide.docx"
    Title = "AI Test Analysis Guide"
    Audience = "QA leads, testers, architects"
    Purpose = "Explain live AI, fallback analysis, models, and workbook interpretation."
    Sections = @(
      New-Section "Model Mapping" @(
        "- Failure Analysis: deepseek-v4-pro, thinking enabled, high reasoning.",
        "- Test Scenario Analysis: deepseek-v4-flash, thinking enabled, medium reasoning.",
        "- Test Data Suggestions: deepseek-v4-flash, thinking enabled, medium reasoning."
      ),
      New-Section "Workbook Sheets" @(
        "- Failure Analysis classifies likely issues from logs.",
        "- Test Scenario Analysis categorizes rows as Edge Case, Missing Scenario, or Coverage Expansion.",
        "- Test Data Suggestions maps test data to scenario IDs and categories.",
        "- Run Configuration records FOODHUB_AI_LIVE and key source status."
      ),
      New-Section "Fallback Mode" @(
        "When FOODHUB_AI_LIVE is false or the DeepSeek call fails, the framework uses deterministic fallback rows and prompt generation."
      )
    ) + $commonSections
  },
  [pscustomobject]@{
    FileName = "09 Observability and Reporting Guide.docx"
    Title = "Observability and Reporting Guide"
    Audience = "QA, DevOps, management"
    Purpose = "Explain Firebase metrics, dashboards, and reporting artifacts."
    Sections = @(
      New-Section "Metrics Flow" @(
        "Request logs and QA summaries are collected locally, stored as latest-observability-metrics.json, ingested to Firebase Realtime Database, and rendered into the dashboard workbook."
      ),
      New-Section "Dashboard Meaning" @(
        "- Total, passed, failed, pass percentage, and fail percentage show execution-so-far health across Firebase history.",
        "- PR Check Failures highlights accumulated failed or skipped CI/local checks.",
        "- Load Rollup shows overall k6/load behavior across previous runs.",
        "- Service Health shows health-check success, uptime percentage, latest health timestamp, and crash indicators.",
        "- Route and status distributions help identify API hot spots and error patterns."
      ),
      New-Section "Shared Execution" @(
        "Local users and CI/CD use the same Firebase path by default, so dashboard history is shared unless the path is overridden."
      )
    ) + $commonSections
  },
  [pscustomobject]@{
    FileName = "10 CI CD Guide.docx"
    Title = "CI/CD Guide"
    Audience = "DevOps, developers, architects"
    Purpose = "Explain pipeline jobs, gates, artifacts, and runtime configuration."
    Sections = @(
      New-Section "Pipeline Jobs" @(
        "- Unit, integration, contract, coverage, E2E, and load checks run in a parallel GitHub Actions matrix.",
        "- Matrix fail-fast is enabled so queued or in-progress checks are cancelled after the first reported failure.",
        "- Each completed check writes a CI status artifact; missing matrix statuses are reported as skipped due to fail-fast.",
        "- QA report job runs with if: always(), downloads available artifacts, generates reports, refreshes Firebase observability, and generates AI analysis.",
        "- Artifacts are uploaded for review."
      ),
      New-Section "Runtime Live AI Decision" @(
        "CI reads project config from .env.example and generated files. It does not need GitHub repository variables or DeepSeek secrets for the live AI decision."
      ),
      New-Section "Troubleshooting CI" @(
        "- Check dependency installation and Node version.",
        "- Check Playwright container behavior for E2E.",
        "- Check Docker/k6 for load execution.",
        "- Check Firebase/Firestore availability for observability and AI key lookup."
      )
    ) + $commonSections
  },
  [pscustomobject]@{
    FileName = "11 Troubleshooting Guide.docx"
    Title = "Troubleshooting Guide"
    Audience = "All technical users"
    Purpose = "Provide fixes for common local and CI issues."
    Sections = @(
      New-Section "Common Local Issues" @(
        "- Port 4173 or 4174 busy: stop existing services or restart the console.",
        "- npm install failure: clear node_modules and rerun npm ci or npm install.",
        "- Playwright issue: reinstall browsers or use the configured Playwright container in CI.",
        "- Excel open issue: close the workbook before regenerating it."
      ),
      New-Section "Firebase and AI Issues" @(
        "- Firebase permission error: confirm database rules and URL/path.",
        "- Firestore key lookup failure: confirm project, collection, document, and field names.",
        "- DeepSeek fetch failure: rerun or switch FOODHUB_AI_LIVE=false for fallback output.",
        "- Empty observability dashboard: run npm run observability:refresh."
      ),
      New-Section "Diagnostic Commands" @(
        "CODE:npm run build:ci",
        "CODE:npm run test:all",
        "CODE:npm run test:report",
        "CODE:npm run observability:dashboard:base",
        "CODE:npm run ai:coverage"
      )
    ) + $commonSections
  },
  [pscustomobject]@{
    FileName = "12 Security and Configuration Guide.docx"
    Title = "Security and Configuration Guide"
    Audience = "Architects, DevOps, management"
    Purpose = "Explain security posture, risks, and production hardening."
    Sections = @(
      New-Section "Current Demo Posture" @(
        "The project has used Firebase Test Mode for ease of local and CI access. This is convenient for demos but should not be considered production-ready."
      ),
      New-Section "Sensitive Data" @(
        "- DeepSeek API key is read from Cloud Firestore.",
        "- Open Firestore rules can expose the key to anyone who knows the path.",
        "- Production use should move secrets to a protected secret store or lock Firestore rules to trusted service accounts."
      ),
      New-Section "Hardening Recommendations" @(
        "- Disable Firebase Test Mode before production-like use.",
        "- Use least-privilege rules for observability writes and reads.",
        "- Rotate exposed API keys.",
        "- Use CI identity federation or secure service account credentials when needed.",
        "- Avoid committing generated artifacts containing sensitive content."
      )
    ) + $commonSections
  },
  [pscustomobject]@{
    FileName = "13 Contribution Guide.docx"
    Title = "Contribution Guide"
    Audience = "Developers and test automation engineers"
    Purpose = "Explain how to safely modify and extend the framework."
    Sections = @(
      New-Section "Before You Change Code" @(
        "- Understand the owning module and existing test coverage.",
        "- Keep changes focused and avoid unrelated report churn.",
        "- Preserve generated artifact names used by the console unless intentionally changing them."
      ),
      New-Section "Adding Tests" @(
        "- Add unit tests for business logic.",
        "- Add integration tests for API behavior.",
        "- Add Pact tests for consumer/provider contract changes.",
        "- Add E2E tests for user journey changes.",
        "- Add test data builders for repeated fixtures."
      ),
      New-Section "Validation Checklist" @(
        "CODE:npm run build:ci",
        "CODE:npm run test",
        "CODE:npm run test:report",
        "CODE:npm run observability:refresh",
        "CODE:npm run ai:coverage"
      )
    ) + $commonSections
  },
  [pscustomobject]@{
    FileName = "14 Release Notes Change Log.docx"
    Title = "Release Notes and Change Log"
    Audience = "All users"
    Purpose = "Summarize notable framework changes."
    Sections = @(
      New-Section "Recent Changes" @(
        "- Migrated dashboard metrics from SQLite runtime storage to Firebase Realtime Database.",
        "- Added Cloud Firestore lookup for the DeepSeek API key.",
        "- Added FOODHUB_AI_LIVE switch to the automation console.",
        "- Renamed FoodHubQAReportViewer.exe to FoodHubAutomationConsole.exe.",
        "- Renamed FoodHub-AI-Test-Coverage.xlsx to FoodHub-AI-Test-Analysis.xlsx.",
        "- Added Framework Documents tab and generated audience-specific Word documents."
      ),
      New-Section "Compatibility Notes" @(
        "Older references to FoodHubQAReportViewer.exe and FoodHub-AI-Test-Coverage.xlsx should be replaced with the new automation console and AI analysis report names."
      ),
      New-Section "Operational Notes" @(
        "Regenerate documents with npm run docs:framework after major framework changes."
      )
    ) + $commonSections
  },
  [pscustomobject]@{
    FileName = "15 Framework Architecture Diagrams.docx"
    Title = "FoodHub Framework - Architecture Diagrams"
    Audience = "Architects, developers, QA leads, management"
    Purpose = "Provide neatly separated architecture and data-flow diagrams."
    Sections = @(
      New-Section "Framework Component Diagram" @(
        "CODE:+-----------------------------+      +------------------------------+",
        "CODE:| FoodHub Automation Console |----->| npm scripts / local commands  |",
        "CODE:+-------------+---------------+      +---------------+--------------+",
        "CODE:              |                                      |",
        "CODE:              v                                      v",
        "CODE:+-----------------------------+      +------------------------------+",
        "CODE:| Reports and Word Documents  |      | FoodHub API and Gateway      |",
        "CODE:+-------------+---------------+      +---------------+--------------+",
        "CODE:              |                                      |",
        "CODE:              v                                      v",
        "CODE:+-----------------------------+      +------------------------------+",
        "CODE:| AI Analysis Workbook        |      | Tests: unit/API/E2E/load     |",
        "CODE:+-------------+---------------+      +---------------+--------------+",
        "CODE:              |                                      |",
        "CODE:              v                                      v",
        "CODE:+-----------------------------+      +------------------------------+",
        "CODE:| Firestore DeepSeek key      |      | Firebase Realtime metrics    |",
        "CODE:+-----------------------------+      +------------------------------+"
      ),
      New-Section "Observability Data Flow" @(
        "CODE:Tests and app requests",
        "CODE:        |",
        "CODE:        v",
        "CODE:request-logs.jsonl + test-report.html",
        "CODE:        |",
        "CODE:        v",
        "CODE:latest-observability-metrics.json",
        "CODE:        |",
        "CODE:        v",
        "CODE:Firebase Realtime Database /observability",
        "CODE:        |",
        "CODE:        v",
        "CODE:FoodHub-Observability-Dashboard.xlsx"
      ),
      New-Section "AI Analysis Flow" @(
        "CODE:FOODHUB_AI_LIVE config",
        "CODE:        |",
        "CODE:        +-- false --> deterministic fallback rows + prompts",
        "CODE:        |",
        "CODE:        +-- true  --> Firestore key lookup --> DeepSeek API",
        "CODE:                                      |",
        "CODE:                                      v",
        "CODE:Failure Analysis / Scenario Analysis / Test Data Suggestions",
        "CODE:                                      |",
        "CODE:                                      v",
        "CODE:FoodHub-AI-Test-Analysis.xlsx"
      ),
      New-Section "CI/CD Flow" @(
        "CODE:Pull Request",
        "CODE:   |",
        "CODE:   +--> unit tests",
        "CODE:   +--> integration tests",
        "CODE:   +--> contract tests",
        "CODE:   +--> coverage gate",
        "CODE:   +--> E2E tests",
        "CODE:   +--> load tests",
        "CODE:   |",
        "CODE:   v",
        "CODE:QA artifact job --> reports + Firebase observability + AI analysis"
      )
    )
  }
)

foreach ($doc in $documents) {
  if ($doc.FileName -ne "15 Framework Architecture Diagrams.docx") {
    New-Docx $doc
  }
}

$legacyDiagramDocx = Join-Path $outputDir "15 Framework Architecture Diagrams.docx"
if (Test-Path -LiteralPath $legacyDiagramDocx) {
  try {
    Remove-Item -LiteralPath $legacyDiagramDocx -Force
  } catch {
    Write-Warning "Could not remove locked legacy diagram document: $legacyDiagramDocx. Close it in Word and rerun npm run docs:framework."
  }
}
New-ArchitectureDiagramHtml

Write-Host "Framework documents generated in $outputDir"
