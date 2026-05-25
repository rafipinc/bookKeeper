import type { Json } from "@/lib/supabase/types";

export type DraftInvoiceLineItem = {
  description: string;
  quantity: number;
  unit_amount_cents: number;
  account_code: string | null;
  account_id: string | null;
  tax_type: string | null;
  tax_rate_id: string | null;
  tax_rate_percent: number | null;
};

export type InvoiceDraftTotals = {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
};

export function normalizeLineItems(input: unknown): DraftInvoiceLineItem[] {
  if (!Array.isArray(input)) {
    throw new Error("lineItems must be an array.");
  }

  return input.map((value, index) => normalizeLineItem(value, index));
}

export function computeDraftTotals(lineItems: DraftInvoiceLineItem[]): InvoiceDraftTotals {
  let subtotalCents = 0;
  let taxCents = 0;

  for (const lineItem of lineItems) {
    const lineSubtotalCents = roundToCents(lineItem.quantity * lineItem.unit_amount_cents);
    subtotalCents += lineSubtotalCents;

    const lineTaxRate = lineItem.tax_rate_percent ?? 0;
    taxCents += roundToCents((lineSubtotalCents * lineTaxRate) / 100);
  }

  return {
    subtotalCents,
    taxCents,
    totalCents: subtotalCents + taxCents,
  };
}

export function toJsonLineItems(lineItems: DraftInvoiceLineItem[]): Json {
  return lineItems as unknown as Json;
}

export function centsToXeroUnitAmount(unitAmountCents: number): number {
  return roundToTwoDp(unitAmountCents / 100);
}

function normalizeLineItem(value: unknown, index: number): DraftInvoiceLineItem {
  const item = asRecord(value);
  const description = asString(item.description)?.trim();
  if (!description) {
    throw new Error(`lineItems[${index}].description is required.`);
  }

  const quantity = asPositiveNumber(item.quantity);
  if (quantity === null) {
    throw new Error(`lineItems[${index}].quantity must be a positive number.`);
  }

  const unitAmountCents = parseMoneyToCents(item.unitAmount, `lineItems[${index}].unitAmount`);

  return {
    description,
    quantity,
    unit_amount_cents: unitAmountCents,
    account_code: asString(item.accountCode) ?? null,
    account_id: asString(item.accountId) ?? null,
    tax_type: asString(item.taxType) ?? null,
    tax_rate_id: asString(item.taxRateId) ?? null,
    tax_rate_percent: asNullableNumber(item.taxRatePercent),
  };
}

function parseMoneyToCents(value: unknown, fieldName: string): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return roundToCents(value * 100);
  }

  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a number or money string.`);
  }

  const trimmed = value.trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error(`${fieldName} must have at most two decimals.`);
  }

  return roundToCents(Number(trimmed) * 100);
}

function asPositiveNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

function asNullableNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected object value.");
  }
  return value as Record<string, unknown>;
}

function roundToCents(value: number): number {
  return Math.round(value);
}

function roundToTwoDp(value: number): number {
  return Math.round(value * 100) / 100;
}
