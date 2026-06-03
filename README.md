# FoodHub Takeaway SaaS

A small, testable takeaway SaaS system built with Node.js, TypeScript, Express, Vitest, Supertest, Playwright, and GitHub Actions.

## Scope

Core flows under test:

- View menu
- Create order
- Calculate total
- Process a fake payment through FoodHub Payment Gateway
- Handle invalid items and payment failures

Main risks covered:

- Incorrect totals
- Invalid menu items
- Payment failures
- API contract regressions

## AI Usage

AI is used as a QA accelerator, not just as a label:

- AI-generated edge cases are exported to `qa-artifacts/FoodHub-AI-Test-Coverage.xlsx`.
- The workbook has separate sheets for `AI Edge Cases`, `Coverage Expansion`, `Generated Test Data`, and `Failure Analysis`.
- AI-suggested missing scenarios are implemented in integration tests: duplicate items, large orders, invalid payload shapes, and randomized order data.
- Test builders generate deterministic randomized order inputs and boundary values in `tests/fixtures/orderFactory.ts`.
- Failure logs can be analyzed with `npm run ai:analyze-failures -- <log-file>`, which creates a local report and an AI-ready prompt.

The checkout also includes an AI-assisted recommendation endpoint. It uses deterministic menu and cart signals to suggest add-ons without calling an external AI provider, keeping tests fast and reliable while still demonstrating meaningful AI-style decision support in the product.

Payment is handled by a separate fake service named **FoodHub Payment Gateway** on port `4174`. The main app launches the gateway with the selected masked card, the user enters a fake card user name and CVV, and the order is created only after the gateway returns an approved payment result.

## Commands

```bash
npm install
npm run dev
npm run test
npm run test:e2e
npm run test:all
npm run test:report
npm run ai:coverage
npm run ai:analyze-failures -- tests/fixtures/failureLogs/sample-flaky-log.txt
```

The app runs on `http://127.0.0.1:4173`. The payment gateway runs on `http://127.0.0.1:4174`.

Swagger/OpenAPI documentation is available at:

- FoodHub app: `http://127.0.0.1:4173/api-docs`
- Payment gateway: `http://127.0.0.1:4174/api-docs`
- Raw OpenAPI JSON: `http://127.0.0.1:4173/openapi.json`

The HTML test report is generated at `qa-artifacts/test-report.html`.
The Playwright E2E report is generated at `playwright-report/index.html` and includes UI screenshots attached from the E2E checks.

## Test Automation Strategy

- Unit tests provide fast service-level feedback with Vitest.
- Integration tests validate API contracts, request/response behavior, and error handling with Supertest.
- E2E tests validate critical business journeys through the UI and FoodHub Payment Gateway with Playwright.
- The GitHub Actions PR gate runs unit, integration, and E2E tests inside a Docker container whenever a pull request targets `main`.
- To block merges when tests fail, enable branch protection or a repository ruleset for `main` and require the `Unit, integration, and E2E tests` status check before merging.

## Test Data Strategy

- Tests use order factories in `tests/fixtures/orderFactory.ts` instead of repeating raw payloads.
- Builders such as `createOrder`, `createInvalidOrder`, `createEmptyOrder`, `createDeclinedPaymentOrder`, `createDuplicateItemOrder`, `createBoundaryQuantityOrder`, and `createRandomOrder` keep test data isolated and readable.
- Each test creates its own request payload, so cases do not share mutable order state.

## Failure Log Analysis With AI

To feed logs into AI for flaky-pattern analysis:

1. Capture the failing command output or Playwright `test-results` error context.
2. Run `npm run ai:analyze-failures -- <path-to-log-file>`.
3. Review `qa-artifacts/failure-analysis-report.md` for local pattern detection.
4. Paste `qa-artifacts/ai-failure-analysis-prompt.txt` into ChatGPT or an internal AI tool.
5. Ask the AI to classify each failure as product bug, test bug, environment issue, or unknown.

The analyzer looks for timeout, locator, network, retry, and payment-gateway signals, then creates a structured prompt with FoodHub context included.
