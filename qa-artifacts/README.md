# QA Artifacts Guide

This folder contains QA artifacts created for the FoodHub Takeaway SaaS test strategy.

## Files

- `FoodHub-AI-Test-Analysis.xlsx`
  Excel workbook containing AI-assisted QA analysis.

- `failure-analysis-report.md`
  Local summary generated from a test failure log.

- `ai-failure-analysis-prompt.txt`
  Prompt you can paste into ChatGPT or an internal AI tool to analyze flaky test patterns.

- `ai-test-generation-prompt.txt`
  Prompt you can paste into ChatGPT or an internal AI tool to regenerate FoodHub-specific edge-case and coverage suggestions.

- `test-report.html`
  Interactive QA dashboard with Unit, Integration, Contract, E2E, and Load test evidence.

- `FoodHub-Observability-Dashboard.html`
  Cross-platform observability dashboard with browser-rendered charts for PR artifacts and Linux CI runs.

- `FoodHub-Observability-Dashboard.xlsx`
  Observability workbook with metrics sheets. Local Windows runs can enhance this workbook with Excel-native charts.

- `coverage/`
  Vitest HTML and JSON summary for the 90%+ critical logic coverage gate.

## Excel Workbook

Open `FoodHub-AI-Test-Analysis.xlsx` in Excel. It contains these sheets:

- `Failure Analysis`
  DeepSeek `deepseek-v4-pro` failure-analysis rows when live mode is enabled, or process steps for using logs with AI to identify flaky patterns when live mode is disabled.

- `Test Scenario Analysis`
  DeepSeek `deepseek-v4-flash` or fallback rows for edge cases, missing scenarios, and coverage expansion. The `Scenario_Category` column identifies which type each row belongs to.

- `Test Data Suggestions`
  DeepSeek `deepseek-v4-flash` or fallback test data suggestions mapped to scenario rows by `Scenario_ID` and `Scenario_Category`.

- `Run Configuration`
  Shows whether live DeepSeek API usage was enabled and which model/reasoning mapping was used.

Regenerate the workbook with:

```bash
npm run ai:coverage
```

Live DeepSeek mode is controlled by project config:

```bash
FOODHUB_AI_LIVE=true
```

Use the FoodHub Automation Console `Live AI (DeepSeek)` switch or `npm run ai:live -- true|false` to update `.env`, `.env.example`, and the workbook Run Configuration sheet.

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

## Observability Dashboard

Generate the cross-platform observability artifacts with:

```bash
npm run observability:dashboard:base
```

This creates:

```text
qa-artifacts/FoodHub-Observability-Dashboard.xlsx
qa-artifacts/FoodHub-Observability-Dashboard.html
```

In PR artifacts, open the `.html` file for charts. The `.xlsx` file contains the same metrics as data sheets, but GitHub-hosted Linux runners cannot use Microsoft Excel COM automation to embed Excel-native chart objects.

For local Windows runs with Excel installed, use:

```bash
npm run observability:dashboard
```

That keeps the cross-platform HTML dashboard and also enhances the workbook with Excel-native charts through `scripts/enhanceObservabilityDashboard.ps1`.

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
