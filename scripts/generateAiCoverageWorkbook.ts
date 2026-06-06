import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { utils, writeFile } from "xlsx";

type Row = Record<string, string | number>;

type AiTask = {
  sheetName: string;
  artifact: string;
  model: "deepseek-v4-pro" | "deepseek-v4-flash";
  reasoningEffort: "high" | "medium";
  systemPrompt: string;
  userPrompt: string;
  fallbackRows: Row[];
};

const outputDir = path.resolve("qa-artifacts");
const outputFile = path.join(outputDir, "FoodHub-AI-Test-Coverage.xlsx");
const promptFile = path.join(outputDir, "ai-test-generation-prompt.txt");

loadEnvFile();

const liveAiEnabled = ["1", "true", "yes", "on"].includes((process.env.FOODHUB_AI_LIVE ?? "").toLowerCase());
const apiKey = process.env.DEEPSEEK_API_KEY;
const deepSeekApiUrl = process.env.DEEPSEEK_API_URL ?? "https://api.deepseek.com/chat/completions";

const projectContext = readProjectContext();
const tasks: AiTask[] = [
  {
    sheetName: "Failure Analysis",
    artifact: "AI-failure-analysis",
    model: "deepseek-v4-pro",
    reasoningEffort: "high",
    systemPrompt:
      "You are a senior QA failure-analysis engineer. Analyze logs and classify likely product, test, environment, or data issues.",
    userPrompt:
      "Generate FoodHub failure-analysis rows from the provided logs and project context. Focus on timeout, selector, network, Docker/Testcontainers, Pact, k6, payment gateway, and report-generation signals.",
    fallbackRows: fallbackFailureAnalysis()
  },
  {
    sheetName: "AI Edge Cases",
    artifact: "AI-test-generation edge cases",
    model: "deepseek-v4-flash",
    reasoningEffort: "medium",
    systemPrompt:
      "You are a senior QA automation engineer generating edge-case tests from requirements and code.",
    userPrompt:
      "Generate FoodHub edge-case test rows for new and existing features from requirements/code context. Include API, UI, payment, invoice, observability, contract, persistence, visual, and load risks.",
    fallbackRows: fallbackEdgeCases()
  },
  {
    sheetName: "Missing Test Scenarios",
    artifact: "ai-test-suggestions missing scenarios",
    model: "deepseek-v4-flash",
    reasoningEffort: "medium",
    systemPrompt:
      "You are a QA coverage reviewer. Find missing scenarios by comparing requirements, code, and current test assets.",
    userPrompt:
      "Generate FoodHub missing-test-scenario rows. Mark each as Implemented, Partially Implemented, or Candidate based on current project evidence.",
    fallbackRows: fallbackMissingScenarios()
  },
  {
    sheetName: "Coverage Expansion",
    artifact: "Coverage Expansion",
    model: "deepseek-v4-flash",
    reasoningEffort: "medium",
    systemPrompt:
      "You are a test strategy lead expanding meaningful coverage while avoiding redundant tests.",
    userPrompt:
      "Generate FoodHub coverage-expansion rows. Focus on high-value additions across unit, integration, contract, E2E, visual, load, observability, and CI evidence.",
    fallbackRows: fallbackCoverageExpansion()
  },
  {
    sheetName: "Test Data Suggestions",
    artifact: "Test Data Suggestions",
    model: "deepseek-v4-flash",
    reasoningEffort: "medium",
    systemPrompt:
      "You are a QA test-data specialist. Suggest deterministic builders and datasets that improve test coverage.",
    userPrompt:
      "Generate FoodHub test-data suggestion rows for order, payment, customer, invoice, observability, load, and persistence test data.",
    fallbackRows: fallbackTestDataSuggestions()
  }
];

mkdirSync(outputDir, { recursive: true });

const workbook = utils.book_new();
const promptLines: string[] = [
  "FoodHub AI Test Coverage Generation",
  "",
  `Live DeepSeek API enabled: ${liveAiEnabled}`,
  "Flag: FOODHUB_AI_LIVE=true",
  "API key env var: DEEPSEEK_API_KEY",
  ""
];

for (const task of tasks) {
  const rows = await generateRows(task);
  appendSheet(task.sheetName, rows);
  promptLines.push(`## ${task.sheetName}`);
  promptLines.push(`Model: ${task.model}`);
  promptLines.push(`Thinking: enabled`);
  promptLines.push(`Reasoning effort: ${task.reasoningEffort}`);
  promptLines.push(task.userPrompt);
  promptLines.push("");
}

appendSheet("Run Configuration", [
  { Setting: "FOODHUB_AI_LIVE", Value: String(liveAiEnabled), Purpose: "Switches real-time DeepSeek API calls on/off" },
  { Setting: "DEEPSEEK_API_KEY", Value: apiKey ? "Configured" : "Not configured", Purpose: "DeepSeek bearer token, supplied from local shell or CI/CD secret" },
  { Setting: "DEEPSEEK_API_URL", Value: deepSeekApiUrl, Purpose: "Optional override for DeepSeek chat completions endpoint" },
  { Setting: "Failure Analysis Model", Value: "deepseek-v4-pro / thinking enabled / high", Purpose: "Failure analysis from logs" },
  { Setting: "Edge Cases Model", Value: "deepseek-v4-flash / thinking enabled / medium", Purpose: "Test generation from requirements/code" },
  { Setting: "Missing Scenarios Model", Value: "deepseek-v4-flash / thinking enabled / medium", Purpose: "Missing test scenarios" },
  { Setting: "Coverage Expansion Model", Value: "deepseek-v4-flash / thinking enabled / medium", Purpose: "Coverage expansion" },
  { Setting: "Test Data Model", Value: "deepseek-v4-flash / thinking enabled / medium", Purpose: "Test data suggestions" }
]);

writeFile(workbook, outputFile, { compression: true });
writeFileSync(promptFile, promptLines.join("\n"), "utf8");

console.log(`Created ${outputFile}`);
console.log(`Created ${promptFile}`);
console.log(liveAiEnabled ? "DeepSeek live API mode was enabled." : "DeepSeek live API mode was disabled; used local fallback rows.");

async function generateRows(task: AiTask): Promise<Row[]> {
  if (!liveAiEnabled) {
    return task.fallbackRows;
  }

  if (!apiKey) {
    console.warn(`FOODHUB_AI_LIVE is enabled but DEEPSEEK_API_KEY is missing. Using fallback rows for ${task.sheetName}.`);
    return task.fallbackRows;
  }

  try {
    const content = await callDeepSeek(task);
    return normalizeRows(parseJsonRows(content), task.fallbackRows);
  } catch (error) {
    console.warn(`DeepSeek generation failed for ${task.sheetName}: ${error instanceof Error ? error.message : String(error)}`);
    return task.fallbackRows;
  }
}

async function callDeepSeek(task: AiTask): Promise<string> {
  const response = await fetch(deepSeekApiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: task.model,
      messages: [
        {
          role: "system",
          content: `${task.systemPrompt}\nReturn only a JSON array of flat objects. Do not wrap it in Markdown.`
        },
        {
          role: "user",
          content: [
            task.userPrompt,
            "",
            "Each row must include these columns where applicable:",
            "ID, Area, Scenario, Risk, Test_Level, Expected_Result, Status, Evidence, Notes, Prompt_Source, Model_Used.",
            "",
            "Project context:",
            projectContext
          ].join("\n")
        }
      ],
      thinking: { type: "enabled" },
      reasoning_effort: task.reasoningEffort,
      stream: false
    })
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("DeepSeek response did not include message content.");
  }

  return content;
}

function parseJsonRows(content: string): Row[] {
  const cleaned = content
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");

  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) {
    throw new Error("AI response was not a JSON array.");
  }

  return parsed.filter((row): row is Row => row && typeof row === "object" && !Array.isArray(row));
}

function normalizeRows(rows: Row[], fallbackRows: Row[]): Row[] {
  if (!rows.length) {
    return fallbackRows;
  }

  return rows.map((row, index) => ({
    ID: row.ID ?? `AI-${String(index + 1).padStart(3, "0")}`,
    ...row
  }));
}

function appendSheet(name: string, rows: Row[]) {
  const worksheet = rows.length ? utils.json_to_sheet(rows) : utils.aoa_to_sheet([["No data generated"]]);
  worksheet["!cols"] = autoWidths(rows);
  utils.book_append_sheet(workbook, worksheet, name);
}

function autoWidths(rows: Row[]) {
  if (!rows.length) {
    return [{ wch: 24 }];
  }

  return Object.keys(rows[0]).map((key) => ({
    wch: Math.min(
      64,
      Math.max(key.length + 2, ...rows.map((row) => String(row[key] ?? "").length + 2))
    )
  }));
}

function readProjectContext(): string {
  const files = [
    "README.md",
    "src/app.ts",
    "src/services/orderService.ts",
    "src/services/paymentService.ts",
    "src/middleware/requestLogger.ts",
    "public/app.js",
    "tests/integration/api.test.ts",
    "tests/e2e/order-flow.spec.ts",
    "tests/load/foodhub-api.k6.js",
    "qa-artifacts/FoodHub-Requirements-Checklist.xlsx",
    "qa-artifacts/failure-analysis-report.md",
    "tests/fixtures/failureLogs/sample-flaky-log.txt"
  ];

  return files
    .map((file) => {
      if (!existsSync(file) || file.endsWith(".xlsx")) {
        return `# ${file}\n${file.endsWith(".xlsx") ? "Excel checklist exists and is used as QA requirement evidence." : "File not found."}`;
      }
      const text = readFileSync(file, "utf8").slice(0, 12_000);
      return `# ${file}\n${text}`;
    })
    .join("\n\n");
}

function loadEnvFile() {
  const envPath = path.resolve(".env");
  if (!existsSync(envPath)) {
    return;
  }

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function fallbackEdgeCases(): Row[] {
  return [
    row("AI-EDGE-001", "Menu", "Menu API returns stable item contract", "API contract breaking", "Integration", "GET /menu returns items with id, name, price, and category", "Implemented"),
    row("AI-EDGE-002", "Order", "Order contains an unknown menu item", "Invalid menu items", "Integration", "POST /order returns 400 Invalid order", "Implemented"),
    row("AI-EDGE-003", "Order", "Order contains no items", "Invalid empty orders", "Integration", "POST /order returns 400 with empty-order detail", "Implemented"),
    row("AI-EDGE-004", "Totals", "Order has mixed item quantities and decimal prices", "Incorrect totals", "Unit", "Total is rounded to two decimals and payment is charged once", "Implemented"),
    row("AI-EDGE-005", "Invoice", "Paid order invoice link shows transaction, order, card last 4, paid-via, and customer name", "Receipt/invoice evidence missing", "E2E", "Invoice panel opens from last transaction link and matches payment gateway data", "Implemented"),
    row("AI-EDGE-006", "Observability", "Request logs and QA metrics are refreshed into SQLite and Excel charts", "Observability drift", "Report", "observability:refresh creates JSON metrics, SQLite DB, and charted dashboard", "Implemented"),
    row("AI-EDGE-007", "Load", "API handles repeated browse-and-order traffic", "Performance regression", "Load", "k6 thresholds pass for p95 latency, HTTP failures, and paid-order failures", "Implemented")
  ];
}

function fallbackMissingScenarios(): Row[] {
  return [
    suggestion("AI-MISS-001", "Payment cancellation", "Gateway cancel/abandon path is not yet a dedicated E2E test", "Candidate", "Add cancel/return-without-payment gateway scenario"),
    suggestion("AI-MISS-002", "Payment idempotency", "No duplicate payment/idempotency key protection exists", "Candidate", "Add API test after idempotency support is implemented"),
    suggestion("AI-MISS-003", "Rate limiting", "No rate limiting middleware exists", "Candidate", "Add API abuse/429 tests after rate limiting is introduced"),
    suggestion("AI-MISS-004", "Authentication", "No user auth exists for SaaS-style tenant/user flows", "Candidate", "Add auth/session tests after auth feature exists"),
    suggestion("AI-MISS-005", "Observability truncate", "Viewer truncate control exists but lacks an automated desktop UI assertion", "Candidate", "Add JavaFX smoke/manual checklist or script-level truncate verification")
  ];
}

function fallbackCoverageExpansion(): Row[] {
  return [
    coverage("AI-COV-001", "Duplicate items", "Duplicate lines can expose total-calculation mistakes", "Submit the same menu item twice as separate lines", "Implemented"),
    coverage("AI-COV-002", "Large orders", "Boundary quantities can break validation or totals", "Submit quantity 20, the maximum accepted value", "Implemented"),
    coverage("AI-COV-003", "Invalid payload shapes", "Malformed clients should receive predictable errors", "Submit items as an object instead of an array", "Implemented"),
    coverage("AI-COV-004", "Invoice rendering", "Receipts need auditable payment details", "Verify invoice transaction id, order id, paid-via, last four, and customer name", "Implemented"),
    coverage("AI-COV-005", "Local observability dashboard", "Central dashboards are unavailable in this project", "Refresh SQLite-backed Excel dashboard and verify chart objects exist", "Implemented"),
    coverage("AI-COV-006", "Gateway cancellation", "Cancelled payments must not create orders", "Click cancel/close gateway and verify no order is created", "Candidate")
  ];
}

function fallbackTestDataSuggestions(): Row[] {
  return [
    data("AI-DATA-001", "Randomized order", "createRandomOrder(seed)", "Seeded deterministic mixed menu items", "Broaden order combinations without shared mutable data"),
    data("AI-DATA-002", "Boundary quantity", "createBoundaryQuantityOrder(20)", "burger-classic x 20", "Validate upper accepted quantity"),
    data("AI-DATA-003", "Duplicate item lines", "createDuplicateItemOrder()", "burger-classic x 1 and burger-classic x 2", "Validate totals across repeated menu item ids"),
    data("AI-DATA-004", "Invoice customer", "createApprovedCheckout().customerName", "FoodHub Demo User", "Verify invoice customer-name publishing"),
    data("AI-DATA-005", "Load traffic", "k6 __VU/__ITER payment token", "gateway_paid_load_1_1", "Avoid payment-token collisions during load execution"),
    data("AI-DATA-006", "Observability metrics", "latest-observability-metrics.json", "requestCount, errorCount, p95DurationMs", "Feed SQLite and charted Excel dashboard")
  ];
}

function fallbackFailureAnalysis(): Row[] {
  return [
    failure(1, "Capture logs", "Run Vitest, Pact, Playwright, Testcontainers, k6, and viewer scripts with output retained", "Local fallback"),
    failure(2, "Run analyzer", "npm run ai:analyze-failures -- tests/fixtures/failureLogs/sample-flaky-log.txt", "Local fallback"),
    failure(3, "Classify failure", "Classify as product bug, test bug, environment issue, data issue, or unknown", "deepseek-v4-pro when live mode is enabled"),
    failure(4, "Correlate observability", "Compare request_logs.jsonl, SQLite run history, and FoodHub-Observability-Dashboard.xlsx", "Local fallback"),
    failure(5, "Recommend fix", "Return suspected root cause, owner, next diagnostic command, and missing test coverage", "deepseek-v4-pro when live mode is enabled")
  ];
}

function row(id: string, area: string, scenario: string, risk: string, testLevel: string, expected: string, status: string): Row {
  return { ID: id, Area: area, Scenario: scenario, Risk: risk, Test_Level: testLevel, Expected_Result: expected, Status: status, Model_Used: "Fallback unless FOODHUB_AI_LIVE=true" };
}

function suggestion(id: string, area: string, scenario: string, status: string, notes: string): Row {
  return { ID: id, Area: area, Missing_Scenario: scenario, Status: status, Notes: notes, Model_Used: "Fallback unless FOODHUB_AI_LIVE=true" };
}

function coverage(id: string, scenario: string, why: string, proposed: string, status: string): Row {
  return { ID: id, AI_Suggested_Scenario: scenario, Why_It_Matters: why, Proposed_Test: proposed, Status: status, Model_Used: "Fallback unless FOODHUB_AI_LIVE=true" };
}

function data(id: string, type: string, builder: string, example: string, purpose: string): Row {
  return { ID: id, Type: type, Builder: builder, Example: example, Purpose: purpose, Model_Used: "Fallback unless FOODHUB_AI_LIVE=true" };
}

function failure(step: number, action: string, detail: string, source: string): Row {
  return { Step: step, Action: action, Detail: detail, Prompt_Source: source, Model_Used: "deepseek-v4-pro high when FOODHUB_AI_LIVE=true" };
}
