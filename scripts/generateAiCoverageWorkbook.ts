import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { utils, writeFile } from "xlsx";

type Row = Record<string, string | number>;

const outputDir = path.resolve("qa-artifacts");
const outputFile = path.join(outputDir, "FoodHub-AI-Test-Coverage.xlsx");
const promptFile = path.join(outputDir, "ai-test-generation-prompt.txt");

const edgeCases: Row[] = [
  {
    ID: "AI-EDGE-001",
    Area: "Menu",
    Scenario: "Menu API returns stable item contract",
    Risk: "API contract breaking",
    Test_Level: "Integration",
    Expected_Result: "GET /menu returns items with id, name, price, and category"
  },
  {
    ID: "AI-EDGE-002",
    Area: "Order",
    Scenario: "Order contains an unknown menu item",
    Risk: "Invalid menu items",
    Test_Level: "Integration",
    Expected_Result: "POST /order returns 400 Invalid order"
  },
  {
    ID: "AI-EDGE-003",
    Area: "Order",
    Scenario: "Order contains no items",
    Risk: "Invalid empty orders",
    Test_Level: "Integration",
    Expected_Result: "POST /order returns 400 with empty-order detail"
  },
  {
    ID: "AI-EDGE-004",
    Area: "Totals",
    Scenario: "Order has mixed item quantities and decimal prices",
    Risk: "Incorrect totals",
    Test_Level: "Unit",
    Expected_Result: "Total is rounded to two decimals and payment is charged once"
  },
  {
    ID: "AI-EDGE-005",
    Area: "Payment",
    Scenario: "Gateway returns declined card",
    Risk: "Payment failures",
    Test_Level: "E2E",
    Expected_Result: "Gateway displays decline and order is not created"
  },
  {
    ID: "AI-EDGE-006",
    Area: "Payment",
    Scenario: "Gateway returns approved payment",
    Risk: "Checkout completion",
    Test_Level: "E2E",
    Expected_Result: "User returns to FoodHub and paid order receipt is shown"
  },
  {
    ID: "AI-EDGE-007",
    Area: "Contract",
    Scenario: "FoodHub Web consumer expects stable /menu and /order contracts",
    Risk: "Consumer/provider API contract drift",
    Test_Level: "Contract",
    Expected_Result: "Pact verifies GET /menu and POST /order response status, headers, and body shape"
  },
  {
    ID: "AI-EDGE-008",
    Area: "Database",
    Scenario: "Paid order persists in a real PostgreSQL database",
    Risk: "API returns success but order is not stored",
    Test_Level: "Integration",
    Expected_Result: "Testcontainers starts PostgreSQL and verifies saved order data can be read back"
  },
  {
    ID: "AI-EDGE-009",
    Area: "Load",
    Scenario: "API handles repeated browse-and-order traffic",
    Risk: "Performance regression or elevated failure rate under load",
    Test_Level: "Load",
    Expected_Result: "k6 thresholds pass for p95 latency, HTTP failures, and paid-order failures"
  },
  {
    ID: "AI-EDGE-010",
    Area: "Report",
    Scenario: "QA report includes functional, contract, database, and load evidence",
    Risk: "Mandatory add-on evidence missing from review artifacts",
    Test_Level: "Report",
    Expected_Result: "test-report.html shows Dashboard, Integration Testcontainers case, Contract, E2E, and Load metrics"
  },
  {
    ID: "AI-EDGE-011",
    Area: "Visual Regression",
    Scenario: "UI layout or styling changes unexpectedly",
    Risk: "Checkout UI regressions are missed by functional assertions",
    Test_Level: "E2E",
    Expected_Result: "Playwright snapshot assertions compare menu-visible, cart-ready, and gateway-ready baselines"
  }
];

const expandedCoverage: Row[] = [
  {
    ID: "AI-COV-001",
    AI_Suggested_Scenario: "Duplicate items",
    Why_It_Matters: "Duplicate lines can expose total-calculation mistakes",
    Proposed_Test: "Submit the same menu item twice as separate lines",
    Status: "Implemented"
  },
  {
    ID: "AI-COV-002",
    AI_Suggested_Scenario: "Large orders",
    Why_It_Matters: "Boundary quantities can break validation or totals",
    Proposed_Test: "Submit quantity 20, the maximum accepted value",
    Status: "Implemented"
  },
  {
    ID: "AI-COV-003",
    AI_Suggested_Scenario: "Invalid payload shapes",
    Why_It_Matters: "Malformed clients should receive predictable errors",
    Proposed_Test: "Submit items as an object instead of an array",
    Status: "Implemented"
  },
  {
    ID: "AI-COV-004",
    AI_Suggested_Scenario: "Missing payment token",
    Why_It_Matters: "Orders must not bypass gateway payment",
    Proposed_Test: "Submit otherwise valid order without paymentToken",
    Status: "Candidate"
  },
  {
    ID: "AI-COV-005",
    AI_Suggested_Scenario: "Gateway cancellation",
    Why_It_Matters: "Cancelled payments must not create orders",
    Proposed_Test: "Click cancel on FoodHub Payment Gateway",
    Status: "Candidate"
  },
  {
    ID: "AI-COV-006",
    AI_Suggested_Scenario: "Consumer/provider contract regression",
    Why_It_Matters: "Frontend can break if API fields or status codes change",
    Proposed_Test: "Use Pact to verify /menu and successful /order expectations",
    Status: "Implemented"
  },
  {
    ID: "AI-COV-007",
    AI_Suggested_Scenario: "Real database persistence",
    Why_It_Matters: "Mocked persistence can miss PostgreSQL schema or serialization bugs",
    Proposed_Test: "Use Testcontainers PostgreSQL to create an order and query it back",
    Status: "Implemented"
  },
  {
    ID: "AI-COV-008",
    AI_Suggested_Scenario: "Load-test endpoint hit accounting",
    Why_It_Matters: "Reviewers need to know how much traffic was generated per endpoint",
    Proposed_Test: "Report k6 VUs, iterations, total requests, and /health, /menu, /order hits",
    Status: "Implemented"
  },
  {
    ID: "AI-COV-009",
    AI_Suggested_Scenario: "Missing cardId in API order request",
    Why_It_Matters: "cardId is optional in schema but the checkout may rely on selected-card traceability",
    Proposed_Test: "Submit a valid paid order without cardId and verify accepted behavior is intentional",
    Status: "Candidate"
  },
  {
    ID: "AI-COV-010",
    AI_Suggested_Scenario: "Testcontainers unavailable in CI",
    Why_It_Matters: "Real DB tests depend on Docker availability",
    Proposed_Test: "Document or gate real DB tests when Docker/Testcontainers cannot start",
    Status: "Candidate"
  },
  {
    ID: "AI-COV-011",
    AI_Suggested_Scenario: "Visual regression for checkout UI",
    Why_It_Matters: "Functional E2E tests may pass even if layout, spacing, or visual hierarchy breaks",
    Proposed_Test: "Use Playwright screenshot snapshots for menu-visible, cart-ready, gateway-ready, declined-payment, fake-card, and receipt states",
    Status: "Partially Implemented"
  }
];

const generatedTestData: Row[] = [
  {
    ID: "AI-DATA-001",
    Type: "Randomized order",
    Builder: "createRandomOrder(seed)",
    Example: "Seed 7 creates deterministic mixed menu items",
    Purpose: "Broaden order combinations without shared mutable data"
  },
  {
    ID: "AI-DATA-002",
    Type: "Boundary quantity",
    Builder: "createBoundaryQuantityOrder(20)",
    Example: "burger-classic x 20",
    Purpose: "Validate upper accepted quantity"
  },
  {
    ID: "AI-DATA-003",
    Type: "Invalid quantity",
    Builder: "createBoundaryQuantityOrder(21)",
    Example: "burger-classic x 21",
    Purpose: "Validate upper rejected quantity"
  },
  {
    ID: "AI-DATA-004",
    Type: "Duplicate item lines",
    Builder: "createDuplicateItemOrder()",
    Example: "burger-classic x 1 and burger-classic x 2",
    Purpose: "Validate totals across repeated menu item ids"
  },
  {
    ID: "AI-DATA-005",
    Type: "E2E checkout scenario",
    Builder: "createApprovedCheckout()",
    Example: "Classic Burger, $9.50, CVV 123",
    Purpose: "Keep Playwright happy path data centralized and readable"
  },
  {
    ID: "AI-DATA-006",
    Type: "E2E declined card",
    Builder: "createDeclinedPaymentCard()",
    Example: "declined-card with masked number xxxx-xxxx-xxxx-8911",
    Purpose: "Keep payment failure browser data isolated per test"
  },
  {
    ID: "AI-DATA-007",
    Type: "PostgreSQL persisted order",
    Builder: "createOrder([{ menuItemId: 'burger-classic', quantity: 2 }])",
    Example: "Saved order total 19 with paymentId pay_testcontainers",
    Purpose: "Verify real DB persistence and JSONB item serialization"
  },
  {
    ID: "AI-DATA-008",
    Type: "k6 deterministic traffic accounting",
    Builder: "One k6 iteration calls /health, /menu, and /order once",
    Example: "218 iterations = 654 total API requests",
    Purpose: "Make load-test evidence easy to audit"
  }
];

const failureAnalysis: Row[] = [
  {
    Step: 1,
    Action: "Capture logs",
    Detail: "Run tests with reporters enabled, then keep Vitest output, Playwright traces, and test-results files"
  },
  {
    Step: 2,
    Action: "Run analyzer",
    Detail: "npm run ai:analyze-failures -- tests/fixtures/failureLogs/sample-flaky-log.txt"
  },
  {
    Step: 3,
    Action: "Feed AI prompt",
    Detail: "Use qa-artifacts/ai-failure-analysis-prompt.txt with ChatGPT or an internal AI tool"
  },
  {
    Step: 4,
    Action: "Review output",
    Detail: "Look for timeout, selector, network, Docker/Testcontainers, Pact verifier, k6 threshold, environment, retry, and ordering patterns"
  },
  {
    Step: 5,
    Action: "Feed current project context",
    Detail: "Include contract tests, Testcontainers PostgreSQL persistence, k6 load summary, and Playwright E2E artifacts in the AI prompt"
  }
];

const aiPrompt = [
  "You are a senior QA automation engineer reviewing the current FoodHub Takeaway SaaS project.",
  "",
  "Goal: generate meaningful AI-assisted test suggestions, not generic statements.",
  "",
  "Current project context:",
  "- Backend: Node.js, TypeScript, Express.",
  "- API endpoints: GET /health, GET /menu, POST /order, GET /openapi.json, /api-docs.",
  "- Payment flow: fake FoodHub Payment Gateway on port 4174, with approved and declined card paths.",
  "- Unit tests: OrderService and recommendation service.",
  "- Integration tests: API behavior plus Testcontainers PostgreSQL order persistence.",
  "- Contract tests: Pact consumer/provider contract between FoodHub Web and FoodHub API.",
  "- E2E tests: Playwright checkout, declined payment, and fake-card journey.",
  "- Load tests: k6 Docker test for /health, /menu, and /order with VU, iteration, hit-count, p95, and failure-rate metrics.",
  "- Visual regression: Playwright baseline screenshot comparison is implemented for menu-visible, cart-ready, and gateway-ready states.",
  "- Test data strategy: factories/builders in tests/fixtures/orderFactory.ts and tests/fixtures/e2eData.ts.",
  "",
  "Please return:",
  "1. Edge test cases for the food ordering API and checkout flow.",
  "2. Missing coverage suggestions, clearly marked Implemented or Candidate.",
  "3. Generated test data ideas using builders, randomized orders, and boundary values.",
  "4. Failure-analysis prompts for logs from Vitest, Pact, Testcontainers, Playwright, and k6.",
  "5. Any risks in the report/dashboard evidence.",
  "6. Visual regression suggestions for UI states already captured by Playwright screenshots.",
  "",
  "Be specific to FoodHub. Do not invent frameworks that are not present."
].join("\n");

mkdirSync(outputDir, { recursive: true });

const workbook = utils.book_new();
utils.book_append_sheet(workbook, utils.json_to_sheet(edgeCases), "AI Edge Cases");
utils.book_append_sheet(workbook, utils.json_to_sheet(expandedCoverage), "Coverage Expansion");
utils.book_append_sheet(workbook, utils.json_to_sheet(generatedTestData), "Generated Test Data");
utils.book_append_sheet(workbook, utils.json_to_sheet(failureAnalysis), "Failure Analysis");

writeFile(workbook, outputFile);
writeFileSync(promptFile, aiPrompt);

console.log(`Created ${outputFile}`);
console.log(`Created ${promptFile}`);
