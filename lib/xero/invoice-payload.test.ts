import { describe, expect, it } from "vitest";

import { centsToXeroUnitAmount, computeDraftTotals, normalizeLineItems } from "./invoice-payload";

describe("invoice payload helpers", () => {
  it("normalizes line items and computes cents totals", () => {
    const lineItems = normalizeLineItems([
      {
        description: "Monthly bookkeeping",
        quantity: 2,
        unitAmount: "100.00",
        accountCode: "200",
        taxType: "OUTPUT2",
        taxRatePercent: 10,
      },
    ]);

    expect(lineItems).toEqual([
      {
        description: "Monthly bookkeeping",
        quantity: 2,
        unit_amount_cents: 10000,
        account_code: "200",
        account_id: null,
        tax_type: "OUTPUT2",
        tax_rate_id: null,
        tax_rate_percent: 10,
      },
    ]);

    expect(computeDraftTotals(lineItems)).toEqual({
      subtotalCents: 20000,
      taxCents: 2000,
      totalCents: 22000,
    });
  });

  it("converts cents to Xero decimal unit amount", () => {
    expect(centsToXeroUnitAmount(12345)).toBe(123.45);
  });
});
