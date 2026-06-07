import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { utils, writeFile } from "xlsx";
import { loadProjectEnvConfig, readAiLiveConfig } from "./aiLiveConfig.js";
import { deepSeekApiKeySourceLabel, readDeepSeekApiKeyFromFirestore } from "./deepSeekApiKeyStore.js";

type Row = Record<string, string | number>;

type AiTask = {
  sheetName: string;
  artifact: string;
  model: "deepseek-v4-pro" | "deepseek-v4-flash";
  reasoningEffort: "high" | "medium";
  systemPrompt: string;
  userPrompt: string;
  columns: string[];
  fallbackRows: Row[];
};

const outputDir = path.resolve("qa-artifacts");
const outputFile = path.join(outputDir, "FoodHub-AI-Test-Analysis.xlsx");
const promptFile = path.join(outputDir, "ai-test-generation-prompt.txt");

loadProjectEnvConfig();

const liveAiEnabled = readAiLiveConfig();
const deepSeekApiUrl = process.env.DEEPSEEK_API_URL ?? "https://api.deepseek.com/chat/completions";
const apiKeySource = deepSeekApiKeySourceLabel();
const apiKey = await resolveDeepSeekApiKey();

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
    columns: ["ID", "Failure_Area", "Signal", "Evidence", "Likely_Root_Cause", "Classification", "Confidence", "Recommended_Fix", "Prompt_Source", "Model_Used"],
    fallbackRows: fallbackFailureAnalysis()
  },
  {
    sheetName: "Test Scenario Analysis",
    artifact: "AI-test-scenario-analysis",
    model: "deepseek-v4-flash",
    reasoningEffort: "medium",
    systemPrompt:
      "You are a senior QA automation engineer generating edge cases, missing scenarios, and coverage expansion ideas from requirements and code.",
    userPrompt:
      "Generate FoodHub test scenario rows from requirements/code context. Include a Scenario_Category column with exactly one of: Edge Case, Missing Scenario, Coverage Expansion. Include duplicate items, large orders, and invalid payload shapes as AI-suggested missing scenarios when appropriate. Cover API, UI, payment, invoice, observability, contract, persistence, visual, and load risks.",
    columns: ["ID", "Scenario_Category", "Area", "Scenario", "Risk", "Test_Level", "Expected_Result", "Test_Data_Need", "Status", "Evidence", "Notes", "Prompt_Source", "Model_Used"],
    fallbackRows: fallbackScenarioAnalysis()
  },
  {
    sheetName: "Test Data Suggestions",
    artifact: "Test Data Suggestions",
    model: "deepseek-v4-flash",
    reasoningEffort: "medium",
    systemPrompt:
      "You are a QA test-data specialist. Suggest deterministic builders and datasets that improve test coverage.",
    userPrompt:
      "Generate FoodHub test-data suggestion rows for the edge cases, missing scenarios, and coverage expansion scenarios in the scenario-analysis task. Include Scenario_Category and Scenario_ID columns so each dataset maps back to a scenario.",
    columns: ["ID", "Scenario_ID", "Scenario_Category", "Data_Type", "Builder", "Example", "Purpose", "Used_For", "Status", "Prompt_Source", "Model_Used"],
    fallbackRows: fallbackTestDataSuggestions()
  }
];

mkdirSync(outputDir, { recursive: true });

const workbook = utils.book_new();
const promptLines: string[] = [
  "FoodHub AI Test Analysis Generation",
  "",
  `Live DeepSeek API enabled: ${liveAiEnabled}`,
  "Flag: FOODHUB_AI_LIVE=true",
  `API key source: ${apiKeySource}`,
  ""
];

for (const task of tasks) {
  const rows = await generateRows(task);
  appendSheet(task.sheetName, rows, task.columns);
  promptLines.push(`## ${task.sheetName}`);
  promptLines.push(`Model: ${task.model}`);
  promptLines.push(`Thinking: enabled`);
  promptLines.push(`Reasoning effort: ${task.reasoningEffort}`);
  promptLines.push(task.userPrompt);
  promptLines.push("");
}

appendSheet("Run Configuration", [
  { Setting: "FOODHUB_AI_LIVE", Value: String(liveAiEnabled), Purpose: "Switches real-time DeepSeek API calls on/off" },
  { Setting: "DeepSeek API key", Value: apiKey ? "Configured" : "Not configured", Purpose: `DeepSeek bearer token loaded from ${apiKeySource}` },
  { Setting: "DEEPSEEK_API_URL", Value: deepSeekApiUrl, Purpose: "Optional override for DeepSeek chat completions endpoint" },
  { Setting: "Failure Analysis Model", Value: "deepseek-v4-pro / thinking enabled / high", Purpose: "Failure analysis from logs" },
  { Setting: "Scenario Analysis Model", Value: "deepseek-v4-flash / thinking enabled / medium", Purpose: "Edge cases, missing scenarios, and coverage expansion from requirements/code" },
  { Setting: "Test Data Model", Value: "deepseek-v4-flash / thinking enabled / medium", Purpose: "Test data suggestions mapped to scenario-analysis rows" }
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
    console.warn(`FOODHUB_AI_LIVE is enabled but the DeepSeek API key was not found in ${apiKeySource}. Using fallback rows for ${task.sheetName}.`);
    return task.fallbackRows;
  }

  try {
    const content = await callDeepSeek(task);
    return normalizeRows(parseJsonRows(content), task.fallbackRows, task.columns);
  } catch (error) {
    console.warn(`DeepSeek generation failed for ${task.sheetName}: ${error instanceof Error ? error.message : String(error)}`);
    return task.fallbackRows;
  }
}

async function resolveDeepSeekApiKey(): Promise<string | undefined> {
  if (!liveAiEnabled) {
    return undefined;
  }

  try {
    return await readDeepSeekApiKeyFromFirestore();
  } catch (error) {
    console.warn(`Unable to read DeepSeek API key from ${apiKeySource}: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
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
            "Each row must include exactly these columns:",
            task.columns.join(", "),
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

function normalizeRows(rows: Row[], fallbackRows: Row[], columns: string[]): Row[] {
  if (!rows.length) {
    return fallbackRows;
  }

  return rows.map((row, index) => ({
    ...Object.fromEntries(columns.map((column) => [column, row[column] ?? ""])),
    ID: row.ID ?? `AI-${String(index + 1).padStart(3, "0")}`
  }));
}

function appendSheet(name: string, rows: Row[], columns?: string[]) {
  const sheetRows = columns ? rows.map((row) => Object.fromEntries(columns.map((column) => [column, row[column] ?? ""]))) : rows;
  const worksheet = sheetRows.length ? utils.json_to_sheet(sheetRows, { header: columns }) : utils.aoa_to_sheet([columns ?? ["No data generated"]]);
  worksheet["!cols"] = autoWidths(sheetRows);
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

function fallbackScenarioAnalysis(): Row[] {
  return [
    scenario("AI-EDGE-001", "Edge Case", "Menu", "Menu API returns stable item contract", "API contract breaking", "Integration", "GET /menu returns items with id, name, price, and category", "Menu response fixture", "Implemented"),
    scenario("AI-EDGE-002", "Edge Case", "Order", "Order contains an unknown menu item", "Invalid menu items", "Integration", "POST /order returns 400 Invalid order", "Unknown item id payload", "Implemented"),
    scenario("AI-EDGE-003", "Edge Case", "Order", "Order contains no items", "Invalid empty orders", "Integration", "POST /order returns 400 with empty-order detail", "Empty items payload", "Implemented"),
    scenario("AI-EDGE-004", "Edge Case", "Totals", "Order has mixed item quantities and decimal prices", "Incorrect totals", "Unit", "Total is rounded to two decimals and payment is charged once", "Mixed quantity order builder", "Implemented"),
    scenario("AI-EDGE-005", "Edge Case", "Invoice", "Paid order invoice link shows transaction, order, card last 4, paid-via, and customer name", "Receipt/invoice evidence missing", "E2E", "Invoice panel opens from last transaction link and matches payment gateway data", "Approved checkout fixture", "Implemented"),
    scenario("AI-MISS-001", "Missing Scenario", "Order", "Duplicate items are submitted as separate order lines", "Duplicate lines can expose total-calculation mistakes", "Integration", "Submit the same menu item twice and verify totals remain correct", "Duplicate item order builder", "Implemented"),
    scenario("AI-MISS-002", "Missing Scenario", "Order", "Large order at maximum accepted quantity", "Boundary quantities can break validation or totals", "Integration", "Submit quantity 20 and verify the order is accepted with correct total", "Boundary quantity order builder", "Implemented"),
    scenario("AI-MISS-003", "Missing Scenario", "Order", "Invalid payload shapes are rejected predictably", "Malformed clients should receive predictable errors", "Integration", "Submit items as an object instead of an array and verify 400 response", "Malformed payload fixture", "Implemented"),
    scenario("AI-COV-001", "Coverage Expansion", "Payment", "Gateway cancellation should not create paid orders", "Cancelled payments must not create orders", "E2E", "Cancel gateway flow and verify no order is created", "Cancelled checkout fixture", "Candidate"),
    scenario("AI-COV-002", "Coverage Expansion", "Observability", "Dashboard refresh and truncate controls have script-level verification", "Observability drift", "Report", "Refresh Firebase-backed dashboard and verify generated workbook sheets", "Observability metrics fixture", "Implemented"),
    scenario("AI-COV-003", "Coverage Expansion", "Load", "API handles repeated browse-and-order traffic", "Performance regression", "Load", "k6 thresholds pass for p95 latency, HTTP failures, and paid-order failures", "k6 seeded load data", "Implemented")
  ];
}

function fallbackTestDataSuggestions(): Row[] {
  return [
    data("AI-DATA-001", "AI-EDGE-004", "Edge Case", "Randomized mixed order", "createRandomOrder(seed)", "Seeded deterministic mixed menu items", "Broaden order combinations without shared mutable data", "Mixed-quantity total validation", "Implemented"),
    data("AI-DATA-002", "AI-MISS-002", "Missing Scenario", "Boundary quantity", "createBoundaryQuantityOrder(20)", "burger-classic x 20", "Validate upper accepted quantity", "Large order missing scenario", "Implemented"),
    data("AI-DATA-003", "AI-MISS-001", "Missing Scenario", "Duplicate item lines", "createDuplicateItemOrder()", "burger-classic x 1 and burger-classic x 2", "Validate totals across repeated menu item ids", "Duplicate items missing scenario", "Implemented"),
    data("AI-DATA-004", "AI-EDGE-005", "Edge Case", "Invoice customer", "createApprovedCheckout().customerName", "FoodHub Demo User", "Verify invoice customer-name publishing", "Invoice receipt validation", "Implemented"),
    data("AI-DATA-005", "AI-COV-003", "Coverage Expansion", "Load traffic", "k6 __VU/__ITER payment token", "gateway_paid_load_1_1", "Avoid payment-token collisions during load execution", "Load coverage expansion", "Implemented"),
    data("AI-DATA-006", "AI-COV-002", "Coverage Expansion", "Observability metrics", "latest-observability-metrics.json", "requestCount, errorCount, p95DurationMs", "Feed Firebase and charted dashboard", "Observability coverage expansion", "Implemented")
  ];
}

function fallbackFailureAnalysis(): Row[] {
  return [
    failure("AI-FAIL-001", "Log capture", "Vitest, Pact, Playwright, Testcontainers, k6, and viewer logs retained", "Test logs and generated reports", "Unknown until logs are analyzed", "Unknown", "Medium", "Run analyzer and compare against observability artifacts", "Local fallback"),
    failure("AI-FAIL-002", "Pattern analysis", "Timeout, selector, startup, Pact, DB, and k6 signals scanned", "tests/fixtures/failureLogs/sample-flaky-log.txt", "Potential flaky test or environment issue", "Test or Environment", "Medium", "Classify each hit and attach next diagnostic command", "Local fallback"),
    failure("AI-FAIL-003", "Observability correlation", "Failure details compared with Firebase run history and request logs", "FoodHub-Observability-Dashboard.xlsx", "Request-level regression or missing metric evidence", "Product, Test, or Environment", "Medium", "Correlate failed test timestamp with request logs", "deepseek-v4-pro when live mode is enabled")
  ];
}

function scenario(id: string, category: string, area: string, scenarioText: string, risk: string, testLevel: string, expected: string, testDataNeed: string, status: string): Row {
  return { ID: id, Scenario_Category: category, Area: area, Scenario: scenarioText, Risk: risk, Test_Level: testLevel, Expected_Result: expected, Test_Data_Need: testDataNeed, Status: status, Model_Used: "Fallback unless FOODHUB_AI_LIVE=true" };
}

function data(id: string, scenarioId: string, category: string, dataType: string, builder: string, example: string, purpose: string, usedFor: string, status: string): Row {
  return { ID: id, Scenario_ID: scenarioId, Scenario_Category: category, Data_Type: dataType, Builder: builder, Example: example, Purpose: purpose, Used_For: usedFor, Status: status, Model_Used: "Fallback unless FOODHUB_AI_LIVE=true" };
}

function failure(id: string, area: string, signal: string, evidence: string, rootCause: string, classification: string, confidence: string, fix: string, source: string): Row {
  return { ID: id, Failure_Area: area, Signal: signal, Evidence: evidence, Likely_Root_Cause: rootCause, Classification: classification, Confidence: confidence, Recommended_Fix: fix, Prompt_Source: source, Model_Used: "deepseek-v4-pro high when FOODHUB_AI_LIVE=true" };
}
