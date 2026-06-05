# QA Artifacts Guide

This folder contains QA artifacts created for the FoodHub Takeaway SaaS test strategy.

## Files

- `FoodHub-AI-Test-Coverage.xlsx`
  Excel workbook containing AI-assisted QA coverage.

- `failure-analysis-report.md`
  Local summary generated from a test failure log.

- `ai-failure-analysis-prompt.txt`
  Prompt you can paste into ChatGPT or an internal AI tool to analyze flaky test patterns.

- `ai-test-generation-prompt.txt`
  Prompt you can paste into ChatGPT or an internal AI tool to regenerate FoodHub-specific edge-case and coverage suggestions.

- `test-report.html`
  Interactive QA dashboard with Unit, Integration, Contract, E2E, and Load test evidence.

- `coverage/`
  Vitest HTML and JSON summary for the 90%+ critical logic coverage gate.

## Excel Workbook

Open `FoodHub-AI-Test-Coverage.xlsx` in Excel. It contains these sheets:

- `AI Edge Cases`
  AI-generated edge cases for the food ordering API, payment flow, Pact contracts, Testcontainers persistence, k6 load testing, and report evidence.

- `Coverage Expansion`
  Missing scenarios suggested by AI, including duplicate items, large orders, invalid payload shapes, consumer/provider contracts, real DB persistence, and load-test hit accounting.

- `Generated Test Data`
  Test data ideas and builders, including randomized order inputs, boundary values, E2E card fixtures, persisted orders, and k6 hit-count accounting.

- `Failure Analysis`
  Process steps for using logs with AI to identify flaky patterns.

Regenerate the workbook with:

```bash
npm run ai:coverage
```

## Test Report

Generate the test report with:

```bash
npm run test:report
```

Open:

```text
qa-artifacts/test-report.html
```

The report includes:

- Dashboard section with total checks, passed, failed, duration, execution coverage, and status mix
- 90%+ critical logic coverage gate results for lines, statements, functions, and branches
- section-level views for Unit, Integration, Contract, E2E, and Load tests
- Testcontainers PostgreSQL evidence under Integration tests
- Pact contract evidence under Contract tests
- k6 thresholds, configured VUs, endpoint hit counts, and total API requests under Load tests
- Visual regression evidence from Playwright screenshot snapshots for menu visible, cart ready, and gateway ready states.

## Feeding Logs To AI

Use this flow when a test fails or behaves inconsistently.

1. Capture the failure log.

   Examples:

   ```bash
   npm run test:e2e > test-results/e2e-failure.log
   npm run test:integration > test-results/integration-failure.log
   ```

2. Run the local analyzer.

   ```bash
   npm run ai:analyze-failures -- test-results/e2e-failure.log
   ```

3. Review the local report.

   ```text
   qa-artifacts/failure-analysis-report.md
   ```

4. Open the generated AI prompt.

   ```text
   qa-artifacts/ai-failure-analysis-prompt.txt
   ```

5. For test generation and coverage expansion, open:

   ```text
   qa-artifacts/ai-test-generation-prompt.txt
   ```

6. Paste the full prompt into ChatGPT or your internal AI tool.

7. Ask AI to identify:

   - flaky patterns
   - likely root cause
   - whether it is a product bug, test bug, environment issue, or unknown
   - evidence from the logs
   - recommended fix

## Sample Log

A sample flaky log is available at:

```text
tests/fixtures/failureLogs/sample-flaky-log.txt
```

Try the analyzer with:

```bash
npm run ai:analyze-failures -- tests/fixtures/failureLogs/sample-flaky-log.txt
```

## What The Analyzer Looks For

The analyzer scans logs for common flaky-test signals:

- timeout or slow startup
- selector or locator instability
- network or port failures
- payment gateway redirect issues
- retry-only pass patterns
- Pact verifier or contract mismatch issues
- Docker/Testcontainers/PostgreSQL startup and persistence issues
- k6 threshold, VU, endpoint-hit, or load-environment issues

The local analyzer does not replace AI review. It prepares a structured summary and prompt so AI can reason over the log with FoodHub-specific context.
