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
- The workbook has separate sheets for `Failure Analysis`, `AI Edge Cases`, `Missing Test Scenarios`, `Coverage Expansion`, and `Test Data Suggestions`.
- AI-suggested missing scenarios are implemented in integration tests: duplicate items, large orders, invalid payload shapes, and randomized order data.
- Test builders generate deterministic randomized order inputs and boundary values in `tests/fixtures/orderFactory.ts`.
- Failure logs can be analyzed with `npm run ai:analyze-failures -- <log-file>`, which creates a local report and an AI-ready prompt.

Live DeepSeek API generation is opt-in. By default `npm run ai:coverage` uses local deterministic fallback rows and does not call an external model.

Local `.env` file:

```env
FOODHUB_AI_LIVE=true
DEEPSEEK_API_KEY=<your DeepSeek API key>
DEEPSEEK_API_URL=https://api.deepseek.com/chat/completions
```

Then run:

```powershell
npm run ai:coverage
```

CI/CD can use the same switch by setting `FOODHUB_AI_LIVE=true` and storing `DEEPSEEK_API_KEY` as a secret. Leave `FOODHUB_AI_LIVE` unset or set to `false` to disable real-time API usage.

The checkout also includes an AI-assisted recommendation endpoint. It uses deterministic menu and cart signals to suggest add-ons without calling an external AI provider, keeping tests fast and reliable while still demonstrating meaningful AI-style decision support in the product.

Payment is handled by a separate fake service named **FoodHub Payment Gateway** on port `4174`. The main app launches the gateway with the selected masked card, the user enters a fake card user name and CVV, and the order is created only after the gateway returns an approved payment result.

## Commands

```bash
npm install
npm run dev
npm run test
npm run test:contract
npm run test:coverage
npm run test:e2e
npm run test:load:smoke
npm run test:load
npm run test:load:docker:smoke
npm run test:load:docker
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

## Local Observability Dashboard

FoodHub includes a portable local observability flow for QA environments where a central dashboard is not available.

```bash
npm run observability:refresh
```

This command collects structured request logs and QA metrics, ingests them into `qa-artifacts/observability/foodhub-observability.sqlite`, and generates `qa-artifacts/FoodHub-Observability-Dashboard.xlsx`. The QA Report Viewer also has controls to refresh the dashboard, open the workbook, and truncate the SQLite observability tables.

## Test Automation Strategy

- Unit tests provide fast service-level feedback with Vitest.
- Integration tests validate API contracts, request/response behavior, and error handling with Supertest.
- E2E tests validate critical business journeys through the UI and FoodHub Payment Gateway with Playwright.
- Critical business logic coverage is enforced at 90%+ for statements, branches, functions, and lines with `npm run test:coverage`.
- Contract tests validate the consumer/provider agreement between FoodHub Web and FoodHub API with Pact.
- Load tests exercise `/health`, `/menu`, and `/order` with k6 thresholds for request failures, p95 latency, and paid-order failures.
- Testcontainers integration tests start a real PostgreSQL database and verify paid orders can be persisted and read back.
- Visual regression uses Playwright screenshot snapshots for key UI states: menu visible, cart ready, and gateway ready.
- The GitHub Actions PR gate runs unit, integration, contract, coverage, E2E, and k6 load checks as parallel jobs whenever a pull request targets `main`.
- To block merges when tests fail, enable branch protection or a repository ruleset for `main` and require the PR gate status checks before merging.

## Load Testing With k6

The k6 load test is in `tests/load/foodhub-api.k6.js`.
It requires the k6 CLI to be installed and available on your `PATH`.

Start the API first:

```bash
npm run dev:app
```

Then run a short smoke load test:

```bash
npm run test:load:smoke
```

Or run the default load profile:

```bash
npm run test:load
```

You can also run k6 through Docker. This is useful for CI or machines where you do not want to install the k6 CLI directly:

```bash
npm run test:load:docker:smoke
npm run test:load:docker
```

The Docker runner targets `http://host.docker.internal:4173` by default so the container can reach the API running on your host machine.
Start the API with `HOST=0.0.0.0` when running Docker-based load tests so the container can reach it.

The default target is `http://127.0.0.1:4173`. You can override it in PowerShell:

```powershell
$env:BASE_URL="http://127.0.0.1:4173"; $env:VUS="10"; npm run test:load
```

Or in bash:

```bash
BASE_URL=http://127.0.0.1:4173 VUS=10 npm run test:load
```

The test writes a JSON summary to `qa-artifacts/load-test-summary.json`.

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
