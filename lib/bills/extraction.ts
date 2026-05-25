export type BillExtractionLineItem = {
  description: string | null;
  quantity: number | null;
  unit_amount_cents: number | null;
  account_code: string | null;
  confidence: number;
};

export type BillExtractionField<T> = {
  value: T;
  confidence: number;
};

export type BillExtractionResult = {
  supplier_name: BillExtractionField<string | null>;
  invoice_date: BillExtractionField<string | null>;
  due_date: BillExtractionField<string | null>;
  total_amount_cents: BillExtractionField<number | null>;
  suggested_category: BillExtractionField<string | null>;
  line_items: BillExtractionLineItem[];
  status: "ok" | "fallback";
  reason: string | null;
};

const DEFAULT_MODEL = process.env.OPENAI_BILL_EXTRACTION_MODEL ?? "gpt-5";
const OPENAI_API_URL = "https://api.openai.com/v1/responses";

export async function extractBillFromDocument(input: {
  fileName: string;
  contentType: string;
  bytes: Uint8Array;
}): Promise<BillExtractionResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return fallbackResult("missing_openai_api_key");
  }

  const fileBase64 = Buffer.from(input.bytes).toString("base64");
  const fileType = resolveInputType(input.contentType);

  if (!fileType) {
    return fallbackResult("unsupported_content_type");
  }

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        input: [
          {
            role: "user",
            content: [
              {
                type: fileType,
                ...(fileType === "input_file"
                  ? {
                      filename: input.fileName,
                      file_data: fileBase64,
                    }
                  : {
                      image_url: `data:${input.contentType};base64,${fileBase64}`,
                    }),
              },
              {
                type: "input_text",
                text: "Extract bill details. Return null for unknown values and lower confidence for uncertain fields.",
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "bill_extraction",
            schema: extractionSchema,
            strict: true,
          },
        },
      }),
    });

    if (!response.ok) {
      return fallbackResult(`openai_http_${response.status}`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const outputText = findOutputText(payload);
    if (!outputText) {
      return fallbackResult("missing_output_text");
    }

    const parsed = JSON.parse(outputText) as Record<string, unknown>;
    return normalizeParsedExtraction(parsed);
  } catch {
    return fallbackResult("openai_request_failed");
  }
}

function normalizeParsedExtraction(value: Record<string, unknown>): BillExtractionResult {
  const supplierName = parseField(value.supplier_name, asNullableString);
  const invoiceDate = parseField(value.invoice_date, asNullableDateString);
  const dueDate = parseField(value.due_date, asNullableDateString);
  const totalAmount = parseField(value.total_amount_cents, asNullableInteger);
  const suggestedCategory = parseField(value.suggested_category, asNullableString);
  const lineItemsRaw = Array.isArray(value.line_items) ? value.line_items : [];
  const lineItems = lineItemsRaw.map((item) => normalizeLineItem(item));
  const confidenceFloor = Math.min(
    supplierName.confidence,
    invoiceDate.confidence,
    dueDate.confidence,
    totalAmount.confidence,
    suggestedCategory.confidence,
    ...lineItems.map((item) => item.confidence),
  );

  if (confidenceFloor < 0.25) {
    return { ...fallbackResult("low_confidence"), ...{ line_items: lineItems } };
  }

  return {
    supplier_name: supplierName,
    invoice_date: invoiceDate,
    due_date: dueDate,
    total_amount_cents: totalAmount,
    suggested_category: suggestedCategory,
    line_items: lineItems,
    status: "ok",
    reason: null,
  };
}

function normalizeLineItem(value: unknown): BillExtractionLineItem {
  const record = asRecord(value);
  return {
    description: asNullableString(record.description),
    quantity: asNullableNumber(record.quantity),
    unit_amount_cents: asNullableInteger(record.unit_amount_cents),
    account_code: asNullableString(record.account_code),
    confidence: normalizeConfidence(record.confidence),
  };
}

function parseField<T>(
  value: unknown,
  parser: (input: unknown) => T,
): BillExtractionField<T> {
  const record = asRecord(value);
  return {
    value: parser(record.value),
    confidence: normalizeConfidence(record.confidence),
  };
}

function fallbackResult(reason: string): BillExtractionResult {
  return {
    supplier_name: { value: null, confidence: 0 },
    invoice_date: { value: null, confidence: 0 },
    due_date: { value: null, confidence: 0 },
    total_amount_cents: { value: null, confidence: 0 },
    suggested_category: { value: null, confidence: 0 },
    line_items: [],
    status: "fallback",
    reason,
  };
}

function findOutputText(payload: Record<string, unknown>): string | null {
  if (typeof payload.output_text === "string" && payload.output_text.trim().length > 0) {
    return payload.output_text;
  }

  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    const content = Array.isArray(asRecord(item).content) ? (asRecord(item).content as unknown[]) : [];
    for (const part of content) {
      const parsed = asRecord(part);
      if (parsed.type === "output_text" && typeof parsed.text === "string") {
        return parsed.text;
      }
    }
  }
  return null;
}

function resolveInputType(contentType: string): "input_file" | "input_image" | null {
  if (contentType === "application/pdf") {
    return "input_file";
  }
  if (contentType === "image/png" || contentType === "image/jpeg") {
    return "input_image";
  }
  return null;
}

function normalizeConfidence(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asNullableString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNullableNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function asNullableInteger(value: unknown): number | null {
  const numberValue = asNullableNumber(value);
  if (numberValue === null) {
    return null;
  }
  return Math.round(numberValue);
}

function asNullableDateString(value: unknown): string | null {
  const stringValue = asNullableString(value);
  if (!stringValue) {
    return null;
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(stringValue) ? stringValue : null;
}

const extractionSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "supplier_name",
    "invoice_date",
    "due_date",
    "total_amount_cents",
    "suggested_category",
    "line_items",
  ],
  properties: {
    supplier_name: fieldSchema("string"),
    invoice_date: fieldSchema("string"),
    due_date: fieldSchema("string"),
    total_amount_cents: fieldSchema("number"),
    suggested_category: fieldSchema("string"),
    line_items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["description", "quantity", "unit_amount_cents", "account_code", "confidence"],
        properties: {
          description: { type: ["string", "null"] },
          quantity: { type: ["number", "null"] },
          unit_amount_cents: { type: ["number", "null"] },
          account_code: { type: ["string", "null"] },
          confidence: { type: "number" },
        },
      },
    },
  },
} as const;

function fieldSchema(valueType: "string" | "number") {
  return {
    type: "object",
    additionalProperties: false,
    required: ["value", "confidence"],
    properties: {
      value: { type: [valueType, "null"] },
      confidence: { type: "number" },
    },
  };
}

