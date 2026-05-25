import { beforeEach, describe, expect, it, vi } from "vitest";

import { extractBillFromDocument } from "./extraction";

describe("extractBillFromDocument", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns fallback when API key is missing", async () => {
    const existing = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const result = await extractBillFromDocument({
      fileName: "receipt.pdf",
      contentType: "application/pdf",
      bytes: new Uint8Array([1, 2, 3]),
    });

    expect(result.status).toBe("fallback");
    expect(result.reason).toBe("missing_openai_api_key");

    if (existing) {
      process.env.OPENAI_API_KEY = existing;
    }
  });

  it("parses structured output and returns normalized values", async () => {
    process.env.OPENAI_API_KEY = "test-key";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              supplier_name: { value: "Acme", confidence: 0.94 },
              invoice_date: { value: "2026-05-01", confidence: 0.93 },
              due_date: { value: "2026-05-15", confidence: 0.9 },
              total_amount_cents: { value: 12345, confidence: 0.95 },
              suggested_category: { value: "Software", confidence: 0.83 },
              line_items: [
                {
                  description: "Subscription",
                  quantity: 1,
                  unit_amount_cents: 12345,
                  account_code: "400",
                  confidence: 0.92,
                },
              ],
            }),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const result = await extractBillFromDocument({
      fileName: "receipt.png",
      contentType: "image/png",
      bytes: new Uint8Array([1, 2, 3]),
    });

    expect(result.status).toBe("ok");
    expect(result.supplier_name.value).toBe("Acme");
    expect(result.total_amount_cents.value).toBe(12345);
    expect(result.line_items).toHaveLength(1);
  });
});

