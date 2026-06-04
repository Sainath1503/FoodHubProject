# FoodHub AI-Assisted Test Suggestions

## 1. Edge Test Cases for Food Ordering API & Checkout Flow

### Quantity Boundary Tests
**Status:** Candidate | **Priority:** High | **Effort:** Low

Currently, OrderService validates quantity between 1–20, but boundary tests are missing:
- **Test:** POST /order with quantity=0 → expect 400 "Quantity must be between 1 and 20"
- **Test:** POST /order with quantity=21 → expect 400 "Quantity exceeds maximum"
- **Test:** POST /order with quantity=-5 → expect 400
- **Test:** POST /order with quantity=0.5 (float) → expect 400 "Quantity must be an integer"
- **Test:** POST /order with quantity=null → expect 400

**Builder suggestion:**
```typescript
export function createBoundaryQuantityOrder(boundary: number, menuItemId = "burger-classic"): OrderRequest {
  return createOrder([{ menuItemId, quantity: boundary }]);
}
```

### Pricing & Rounding Edge Cases
**Status:** Candidate | **Priority:** Medium | **Effort:** Low

Current test covers 2 items with clean totals (19 + 2.5), but edge cases exist:
- **Test:** Order 3x Veggie Halloumi Wrap (3 × 8.25) → total 24.75 (verify money rounding)
- **Test:** Order 7x Loaded Fries (7 × 4.75) → total 33.25
- **Test:** Order complex mix: 2x burger (19) + 3x cola (7.50) + 1x salad (4.25) → total 30.75
- **Test:** Verify no floating-point errors in calculations (e.g., 0.1 + 0.2 ≠ 0.3 bug)

**Builder suggestion:**
```typescript
export function createHighVolumeQuantityOrder(itemId: string, quantity: number): OrderRequest {
  return createOrder([{ menuItemId: itemId, quantity }]);
}

export function createComplexMultiItemOrder(): OrderRequest {
  return createOrder([
    { menuItemId: "burger-classic", quantity: 2 },
    { menuItemId: "cola-zero", quantity: 3 },
    { menuItemId: "salad-crunch", quantity: 1 }
  ]);
}
```

### Payment Gateway Failure Modes
**Status:** Candidate | **Priority:** High | **Effort:** Medium

Only happy path (approved) and declined card tested. Missing:
- **Test:** Payment timeout (gateway takes >10s to respond) → expect client-side timeout error
- **Test:** Payment gateway network failure (socket hang up) → expect "Payment gateway unavailable"
- **Test:** Gateway responds with HTTP 500 → expect "Payment service error"
- **Test:** Gateway responds with HTTP 400 (invalid request format) → expect proper wrapping
- **Test:** Partial payment (charged but no receipt persisted) → expect idempotency/retry logic

**Integration test suggestion:**
```typescript
it("handles payment gateway timeout gracefully", async () => {
  const slowGateway = {
    charge: async () => {
      await new Promise(r => setTimeout(r, 15000)); // Exceeds typical timeout
      return { status: "paid", paymentId: "pay_slow" };
    }
  };
  const service = new OrderService(menu, slowGateway);
  await expect(service.createOrder(createOrder())).rejects.toThrow("timeout|unavailable");
});
```

### Menu Consistency & Contract Tests
**Status:** Implemented | **Priority:** Low | **Effort:** Low

**Current:** GET /menu contract is stable. **Candidate additions:**
- **Test:** Menu items are in consistent order (alphabetic or by ID)
- **Test:** Menu item IDs are URL-safe (no spaces, special chars)
- **Test:** All prices are positive and have max 2 decimal places
- **Test:** All categories are one of: main, side, drink (enum validation)
- **Test:** No duplicate menu IDs
- **Test:** Menu response size is reasonable (< 10KB)

### Empty & Validation Scenarios
**Status:** Implemented | **Priority:** Low | **Effort:** Low

Currently tested: empty order, invalid menu items. **Candidate additions:**
- **Test:** POST /order with missing `items` field → expect 400 with clear message
- **Test:** POST /order with missing `paymentToken` field → expect 400
- **Test:** POST /order with null items array → expect 400 "must be array"
- **Test:** POST /order with string instead of array for items → expect 400

---

## 2. Missing Coverage Gaps

### Recommendation/AI Suggestion Variations
**Status:** Candidate | **Priority:** Medium | **Effort:** Medium

Currently, aiSuggestion is tested only for exact matches in happy path. Missing:
- **What triggers different suggestions?** Currently only one test verifies "Add a side..." suggestion
- **Test:** Order with only drink → expect suggestion about food
- **Test:** Order with only food → expect suggestion about drink
- **Test:** Order with only one category → verify suggestion mentions complementary category
- **Test:** Very large order → expect different phrasing ("That's a lot!")
- **Test:** Empty order (edge case) → what suggestion is returned?

**Recommendation:** Expand `recommendationService.test.ts` to cover all code paths in recommendation logic.

### Cart/Session State Management
**Status:** Candidate | **Priority:** Medium | **Effort:** High

No tests for:
- **E2E:** Add item → reload page → cart persists (localStorage)?
- **E2E:** Add item → add same item again → quantity increases or creates duplicate?
- **E2E:** Clear cart → add new item → verify no ghost data
- **E2E:** Switch payment cards → verify correct card is used
- **E2E:** Concurrent checkouts (multiple tabs) → no race conditions?

### Concurrent Order Creation
**Status:** Candidate | **Priority:** High | **Effort:** Medium

No tests for concurrent requests:
- **Integration:** Send 5x simultaneous POST /order requests → all should succeed with unique orderIds
- **Integration:** Same orderIds should not be generated
- **Load test:** Increase VUs to 20+ to stress concurrent order creation
- **Integration:** Verify payment gateway is called exactly once per order (no double-charging)

**Test approach:**
```typescript
it("handles 5 concurrent orders without ID collisions", async () => {
  const promises = Array.from({ length: 5 }, () =>
    request(app).post("/order").send(createRandomOrder())
  );
  const responses = await Promise.all(promises);
  const ids = responses.map(r => r.body.orderId);
  expect(new Set(ids).size).toBe(5); // All unique
});
```

### Database Persistence (Testcontainers)
**Status:** Candidate | **Priority:** High | **Effort:** Medium

File exists (`tests/integration/orderPersistence.test.ts`) but content not reviewed. Verify:
- **Test:** Order is persisted in PostgreSQL with all fields
- **Test:** Multiple orders → database count increases
- **Test:** Order retrieval by ID works
- **Test:** Failed payment → order NOT persisted
- **Test:** Duplicate paymentId prevention

### Error Code Standardization
**Status:** Candidate | **Priority:** Low | **Effort:** Low

Tests verify error messages but not error codes:
- **Test:** POST /order with empty → expect `{ error: "Invalid order", details: "..." }`
- **Test:** POST /order with invalid item → expect same error format
- **Test:** Add error code field: `{ errorCode: "INVALID_ORDER", error: "...", details: "..." }`

### Payment Card Input Validation (XSS Prevention)
**Status:** Candidate | **Priority:** Medium | **Effort:** Medium

E2E test for fake card creation lacks security validation:
- **E2E Test:** Card holder name: `<script>alert('xss')</script>` → verify rendered safely, no script execution
- **E2E Test:** Card number: `4111 1111 1111 2222<img src=x onerror=alert('xss')>` → sanitized
- **E2E Test:** Verify localStorage/DOM does not expose full card number

### Rate Limiting & Brute Force Protection
**Status:** Candidate | **Priority:** Medium | **Effort:** High

No tests for:
- **Load test:** 100 requests/sec to /order → expect throttling (429 Too Many Requests)
- **Integration:** 10 failed payment attempts from same IP → expect temporary block
- **Integration:** POST /order 1000 times with same orderRequest → detect duplicate orders

### API Versioning & Backward Compatibility
**Status:** Candidate | **Priority:** Low | **Effort:** High

Currently no versioning. If planned:
- **Test:** Accept `Content-Type: application/vnd.foodhub.v1+json`
- **Test:** Old client (no version header) → defaults to v1
- **Test:** New client (v2 header) → new response format (if applicable)

---

## 3. Test Data Generation Ideas Using Builders

### Expand `orderFactory.ts`
Current builders: `createOrder`, `createInvalidOrder`, `createEmptyOrder`, `createDuplicateItemOrder`, `createBoundaryQuantityOrder`, `createRandomOrder`

**Candidate additions:**

```typescript
// Pricing edge cases
export function createHighTotalOrder(targetTotal = 100): OrderRequest {
  const lines = [];
  let running = 0;
  for (const item of menu) {
    const qty = Math.floor((targetTotal - running) / item.price);
    if (qty > 0) {
      lines.push({ menuItemId: item.id, quantity: Math.min(qty, 20) });
      running += item.price * qty;
      if (running >= targetTotal) break;
    }
  }
  return createOrder(lines);
}

// Quantity extremes
export function createMaxQuantityOrder(): OrderRequest {
  return createOrder([
    { menuItemId: "burger-classic", quantity: 20 },
    { menuItemId: "cola-zero", quantity: 20 }
  ]);
}

export function createMinQuantityOrder(): OrderRequest {
  return createOrder([{ menuItemId: "burger-classic", quantity: 1 }]);
}

// Single item per category
export function createOrderByCategory(category: "main" | "side" | "drink"): OrderRequest {
  const item = menu.find(m => m.category === category);
  return item ? createOrder([{ menuItemId: item.id, quantity: 1 }]) : createOrder();
}

// Cross-category bundle
export function createBalancedMealOrder(): OrderRequest {
  return createOrder([
    { menuItemId: menu.find(m => m.category === "main")!.id, quantity: 1 },
    { menuItemId: menu.find(m => m.category === "side")!.id, quantity: 1 },
    { menuItemId: menu.find(m => m.category === "drink")!.id, quantity: 1 }
  ]);
}

// Randomized with seed for reproducibility
export function createFuzzyOrder(seed = Math.random()): OrderRequest {
  const lineCount = Math.floor(seed * 5) + 1; // 1-5 items
  return createRandomOrder(Math.floor(seed * 10000), lineCount);
}

// Invalid payment tokens (for negative testing)
export function createOrderWithInvalidToken(token: string = ""): OrderRequest {
  return {
    ...createOrder(),
    paymentToken: token
  };
}

// Custom card + order
export function createOrderWithCard(cardId: string): OrderRequest {
  return {
    ...createOrder(),
    cardId
  };
}
```

### Expand `e2eData.ts`
Current: `createApprovedCheckout`, `createDeclinedPaymentCard`, `createFakePaymentCard`

**Candidate additions:**
```typescript
// Additional test card scenarios
export function createExpiredCard(): E2ePaymentCard {
  return {
    id: "expired-card",
    holderName: "Expired Tester",
    number: "3782 822463 10005",
    maskedNumber: "xxxx-xxxx-xxxx-0005",
    label: "Expired Card",
    cvv: "123"
  };
}

export function createInvalidCVVCard(): E2ePaymentCard {
  return {
    id: "invalid-cvv",
    holderName: "Bad CVV User",
    number: "4012 8888 8888 8888",
    maskedNumber: "xxxx-xxxx-xxxx-8888",
    label: "Invalid CVV Card",
    cvv: "000" // Invalid CVV
  };
}

// High-value checkout
export function createLargeOrderCheckout(): E2eCheckoutScenario {
  return {
    itemName: "Loaded Fries",
    cartLine: "5 x Loaded Fries, 3 x Classic Burger, 2 x Cola Zero",
    cartTotal: "$47.00",
    cvv: "123"
  };
}

// Multiple card switches
export function createMultiCardCheckoutScenarios(): E2eCheckoutScenario[] {
  return [
    createApprovedCheckout(),
    { ...createApprovedCheckout(), cartTotal: "$15.50" },
    { ...createApprovedCheckout(), cvv: "999" } // Wrong CVV
  ];
}
```

---

## 4. Failure Analysis Prompts by Test Level

### Vitest Unit/Integration Failures
**Prompt template for AI analysis:**
```
Analyze this Vitest failure log for {orderService|paymentService|recommendationService}.test.ts:
- Which assertions failed?
- Is it a logic bug (service code) or test bug (mock/fixture)?
- Did a payment timeout cause it?
- Are floating-point rounding issues present?
Classify as: product bug, test bug, environment issue, or unknown.
Provide: likely root cause, code snippet to fix, confidence level 1-5.
```

**Common failure patterns to watch for:**
- `TypeError: Cannot read property 'length' of undefined` → Order items missing
- `Expected 30.75 to equal 30.750000000001` → Floating-point rounding
- `Payment gateway did not respond` → Timeout or slow test env
- `Menu item not found: burger-premium` → Test data out of sync with menu

### Pact Contract Failures
**Prompt template:**
```
The FoodHub Web-FoodHub API Pact contract verification failed on {GET /menu | POST /order}.
- What interaction expectation was violated?
- Did the API response change (schema, field type, missing field)?
- Did the consumer request format change?
- Is this a breaking change that requires version bump?
Classify as: product breaking change, test flakiness, or intended API evolution.
Provide: impact on downstream consumers, migration steps if needed.
```

**Common patterns:**
- Payment response missing `paymentId` field
- Menu price format changed from number to string
- Order total precision mismatch (9.5 vs "9.50")

### Testcontainers/PostgreSQL Persistence Failures
**Prompt template:**
```
The orderPersistence.test.ts failed during Testcontainers PostgreSQL run:
- Did the container fail to start (docker not available)?
- Is the database schema missing a migration?
- Did an order persist but with null/missing fields?
- Did concurrent orders cause a constraint violation (unique key)?
Classify as: environment setup issue, schema issue, concurrency issue, or data issue.
Provide: required database schema, migration script, retry strategy.
```

**Common patterns:**
- `ECONNREFUSED 127.0.0.1:5432` → Docker/postgres not running
- `column "created_at" does not exist` → Migration not applied
- `duplicate key value violates unique constraint` → Order ID collision

### Playwright E2E Failures
**Prompt template:**
```
The Playwright E2E test {test name} failed with:
- Connection refused at http://127.0.0.1:4173/ → Server not ready
- Timeout waiting for #gateway-message → UI stuck or payment gateway slow
- Selector "button:text('Pay')" not found → DOM text changed
- net::ERR_BLOCKED_BY_CLIENT → Ad blocker or CSP issue
Classify as: server startup timing, payment gateway latency, brittle locator, or environment issue.
Provide: recommended wait strategy, locator fix, server healthcheck requirement.
```

**Common patterns:**
- `net::ERR_CONNECTION_REFUSED` → Server didn't start before test ran
- `Timeout 5000ms exceeded` → Payment gateway taking > 5s
- `locator not found` → CSS selector changed in DOM
- `Payment declined for` text appears after 8s → Increase timeout to 15s

### k6 Load Test Failures
**Prompt template:**
```
The k6 load test {foodhub-api.k6.js} exceeded thresholds:
- http_req_duration: p(95)<500ms → {p95 actual value} → API too slow
- http_req_failed: rate<0.05 → {failure rate}% → Too many errors
- foodhub_order_failures: rate<0.02 → {custom metric} → Order creation unstable
Classify as: API performance degradation, payment gateway bottleneck, or environment saturation.
Provide: bottleneck location (which endpoint), recommended VU cap, scaling advice.
```

**Common patterns:**
- `p(95)=1200ms` → Database queries slow, add indexing
- `failures=15%` → Payment gateway rejecting under load
- `health check ok, menu ok, order failing` → Issue specific to POST /order logic

---

## 5. Risks in Reports/Dashboard Evidence

### From `failure-analysis-report.md`

| Risk | Severity | Impact | Mitigation |
|------|----------|--------|-----------|
| **Timeout (2 hits)** | High | Tests may pass/fail randomly | Add explicit health checks before main test; increase wait from 5s to 15s |
| **Selector/Locator (3 hits)** | Medium | UI text refactors break tests | Switch from `.toHaveText()` to role-based selectors; add data-testid attributes |
| **Network startup (1 hit)** | High | Port conflicts in CI; concurrent test runs fail | Add test isolation per instance; health check /health before goto |
| **Payment gateway flow (10 hits)** | High | Payment processing delayed or unreliable | Add gateway healthcheck; mock slow response in tests; increase timeout; check gateway logs |
| **Retry signal (1 hit)** | Medium | Test is flaky; passes on retry but fails on first run | Compare first-fail trace vs retry-pass; likely server startup race |

### From `load-test-summary.json`
- ✅ Health checks: 218/218 passed (100%)
- ✅ Menu endpoint: 218/218 passed (100%)
- ⚠️ Order endpoint: Performance data missing (check if metrics are logged)
  - **Risk:** Is order endpoint hanging? Is payment gateway timeout causing stalled requests?
  - **Recommendation:** Add explicit p50, p95, p99 latency tracking for /order
  - **Dashboard gap:** No visibility into payment gateway response times

### Testing Pyramid Imbalance
| Level | Current | Ideal | Gap |
|-------|---------|-------|-----|
| Unit | ~10 tests | 15-20 | `-5` (Good) |
| Integration | ~8 tests | 20-30 | `-20` (Needs expansion) |
| E2E | ~3 tests | 10-15 | `-7` (Needs expansion) |
| Contract | ~1 test | 5-10 | `-5` (Needs scenarios) |
| Load | 1 k6 scenario | 3-5 scenarios | `-3` (Missing stress/spike) |

**Recommendation:** Increase integration test coverage to catch bugs before E2E; add API error scenarios to contract.

### Evidence Gaps
1. **No database assertion logging:** Orders persisted but is the data correct?
2. **No payment gateway logs in artifact folder:** Why are 10 signals flagging gateway flow?
3. **No response time breakdown:** Which endpoint is slow—health, menu, order, or payment gateway?
4. **No error code tracking:** Are all failures 500 or specific codes (400, 502)?
5. **No concurrent load test:** Only ramping VUs tested; no spike or sustained load

**Dashboard recommendations:**
- Add panel: "Order creation success rate by payment card type"
- Add panel: "Payment gateway response time (p50, p95, p99)"
- Add panel: "E2E test flakiness—first-run vs retry success rate"
- Add panel: "Database persistence lag (order created → persisted in DB)"

---

## Summary: Implementation Roadmap

### Phase 1: Quick Wins (Low Effort, High Impact) — Week 1
- [ ] Add quantity boundary tests (0, 21, float, negative)
- [ ] Add pricing edge case tests (complex multi-item orders)
- [ ] Expand E2E timeout from 5s to 15s for payment gateway
- [ ] Add explicit /health check before E2E tests
- [ ] Add concurrent order creation test (5 simultaneous)

### Phase 2: Medium Effort — Week 2-3
- [ ] Expand recommendation service tests (all code paths)
- [ ] Add payment gateway failure modes (timeout, 500, network error)
- [ ] Add cart/session state persistence E2E tests
- [ ] Verify orderPersistence.test.ts coverage
- [ ] Add XSS sanitization test for card holder name input
- [ ] Expand k6 load test: spike test, sustained load, error injection

### Phase 3: Strategic Improvements — Month 2
- [ ] Add database assertion logging for order persistence
- [ ] Implement error code standardization in API responses
- [ ] Add rate limiting test + protection
- [ ] Add payment gateway performance monitoring
- [ ] Expand Pact contract to error scenarios (invalid menu item, failed payment)
- [ ] Create Playwright fixture for multi-card scenarios

### Phase 4: Observability & Dashboards — Ongoing
- [ ] Publish load test metrics to dashboard (payment gateway p95)
- [ ] Track E2E test flakiness (first-run fail rate)
- [ ] Monitor database persistence lag
- [ ] Add failure signal correlation (timeout + network = startup issue?)
