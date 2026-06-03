import { mkdirSync } from "node:fs";
import path from "node:path";
import { utils, writeFile } from "xlsx";

type Row = Record<string, string | number>;

const outputDir = path.resolve("qa-artifacts");
const outputFile = path.join(outputDir, "FoodHub-AI-Test-Coverage.xlsx");

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
    Detail: "Look for timeout, selector, network, environment, retry, and ordering patterns"
  }
];

mkdirSync(outputDir, { recursive: true });

const workbook = utils.book_new();
utils.book_append_sheet(workbook, utils.json_to_sheet(edgeCases), "AI Edge Cases");
utils.book_append_sheet(workbook, utils.json_to_sheet(expandedCoverage), "Coverage Expansion");
utils.book_append_sheet(workbook, utils.json_to_sheet(generatedTestData), "Generated Test Data");
utils.book_append_sheet(workbook, utils.json_to_sheet(failureAnalysis), "Failure Analysis");

writeFile(workbook, outputFile);

console.log(`Created ${outputFile}`);
