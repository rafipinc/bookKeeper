"use client";

import { FileText, Plus, Trash2, Upload, X } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

type XeroConnectionOption = {
  id: string;
  xeroTenantId: string;
  xeroTenantName: string | null;
  status: "active" | "reauth_required" | "disconnected";
};

type XeroContactOption = {
  id: string;
  xeroTenantId: string;
  name: string;
  email: string | null;
};

type XeroAccountOption = {
  id: string;
  xeroTenantId: string;
  code: string | null;
  name: string;
};

type XeroTaxRateOption = {
  xeroTenantId: string;
  xeroTaxType: string;
  name: string;
  rate: number | null;
};

type DraftBill = {
  id: string;
  xeroTenantId: string;
  contactId: string | null;
  date: string | null;
  dueDate: string | null;
  reference: string | null;
  invoiceNumber: string | null;
  publishError: string | null;
  lineItemsJson: unknown;
};

type LineItem = {
  id: string;
  description: string;
  quantity: string;
  unitAmount: string;
  accountId: string;
  taxType: string;
  review: Partial<Record<"description" | "quantity" | "unitAmount" | "accountId" | "taxType", boolean>>;
};

type SaveDraftResponse = {
  invoice?: {
    id?: string;
    xero_invoice_number?: string | null;
  };
};

type PublishResponse = {
  invoiceId?: string;
  xeroUrl?: string;
};

type ExtractResponse = {
  extraction?: Record<string, unknown>;
  warning?: string;
};

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);
const LOW_CONFIDENCE_THRESHOLD = 0.7;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function plusDaysIso(days: number) {
  const next = new Date();
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
}

function formatMoneyFromCents(amountCents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amountCents / 100);
}

function parseMoneyToCents(value: string) {
  const normalized = value.trim().replaceAll(",", "");
  if (!normalized) {
    return 0;
  }
  const asNumber = Number.parseFloat(normalized);
  if (!Number.isFinite(asNumber)) {
    return 0;
  }
  return Math.round(asNumber * 100);
}

function readString(source: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim().length) {
      return value.trim();
    }
  }
  return "";
}

function readNumber(source: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function readConfidence(source: Record<string, unknown>, key: string) {
  const direct = source[`${key}Confidence`];
  if (typeof direct === "number") {
    return direct;
  }
  const nested = source[key];
  if (nested && typeof nested === "object" && "confidence" in nested && typeof nested.confidence === "number") {
    return nested.confidence;
  }
  const map = source.confidence;
  if (map && typeof map === "object") {
    const value = (map as Record<string, unknown>)[key];
    if (typeof value === "number") {
      return value;
    }
  }
  return null;
}

function parseLineItems(value: unknown, fallbackTaxType: string) {
  if (!Array.isArray(value)) {
    return [
      {
        id: crypto.randomUUID(),
        description: "",
        quantity: "1",
        unitAmount: "",
        accountId: "",
        taxType: fallbackTaxType,
        review: {},
      },
    ] satisfies LineItem[];
  }

  const rows: LineItem[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") {
      continue;
    }
    const candidate = row as Record<string, unknown>;
    rows.push({
      id: crypto.randomUUID(),
      description: typeof candidate.description === "string" ? candidate.description : "",
      quantity: String(typeof candidate.quantity === "number" || typeof candidate.quantity === "string" ? candidate.quantity : "1"),
      unitAmount:
        typeof candidate.unit_amount_cents === "number"
          ? (candidate.unit_amount_cents / 100).toFixed(2)
          : typeof candidate.unitAmountCents === "number"
            ? (candidate.unitAmountCents / 100).toFixed(2)
            : "",
      accountId:
        typeof candidate.account_id === "string"
          ? candidate.account_id
          : typeof candidate.accountId === "string"
            ? candidate.accountId
            : "",
      taxType:
        typeof candidate.tax_type === "string"
          ? candidate.tax_type
          : typeof candidate.taxType === "string"
            ? candidate.taxType
            : fallbackTaxType,
      review: {},
    });
  }

  return rows.length > 0
    ? rows
    : [
        {
          id: crypto.randomUUID(),
          description: "",
          quantity: "1",
          unitAmount: "",
          accountId: "",
          taxType: fallbackTaxType,
          review: {},
        },
      ];
}

function lowConfidenceLabel() {
  return (
    <span className="rounded bg-[#fef8ea] px-1.5 py-0.5 text-[11px] font-medium text-[#7a5b00]">
      Review this
    </span>
  );
}

export function BillComposer({
  connections,
  contacts,
  accounts,
  taxRates,
  initialDraft,
}: {
  connections: XeroConnectionOption[];
  contacts: XeroContactOption[];
  accounts: XeroAccountOption[];
  taxRates: XeroTaxRateOption[];
  initialDraft: DraftBill | null;
}) {
  const router = useRouter();
  const [isSaving, startSaving] = useTransition();
  const [isPublishing, startPublishing] = useTransition();
  const [isExtracting, startExtracting] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(initialDraft?.publishError ?? null);
  const [extractWarning, setExtractWarning] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [xeroUrl, setXeroUrl] = useState<string | null>(null);
  const defaultConnection = connections.find((connection) => connection.xeroTenantId === initialDraft?.xeroTenantId) ?? connections[0] ?? null;
  const [selectedConnectionId, setSelectedConnectionId] = useState(defaultConnection?.id ?? "");
  const [selectedContactId, setSelectedContactId] = useState(initialDraft?.contactId ?? "");
  const [billDate, setBillDate] = useState(initialDraft?.date ?? todayIso());
  const [dueDate, setDueDate] = useState(initialDraft?.dueDate ?? plusDaysIso(14));
  const [reference, setReference] = useState(initialDraft?.reference ?? "");
  const [billNumber, setBillNumber] = useState(initialDraft?.invoiceNumber ?? "");
  const [reviewFields, setReviewFields] = useState<Partial<Record<"contact" | "date" | "dueDate" | "total", boolean>>>({});
  const initialDefaultTaxType =
    taxRates.find((rate) => rate.xeroTenantId === defaultConnection?.xeroTenantId)?.xeroTaxType ??
    taxRates[0]?.xeroTaxType ??
    "";
  const [lineItems, setLineItems] = useState<LineItem[]>(parseLineItems(initialDraft?.lineItemsJson, initialDefaultTaxType));
  const [draftId, setDraftId] = useState(initialDraft?.id ?? "");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedPreviewUrl, setUploadedPreviewUrl] = useState<string | null>(null);
  const [dismissedWarning, setDismissedWarning] = useState(false);

  const selectedConnection = connections.find((connection) => connection.id === selectedConnectionId) ?? null;
  const selectedXeroTenantId = selectedConnection?.xeroTenantId ?? "";
  const visibleContacts = contacts.filter((contact) => contact.xeroTenantId === selectedXeroTenantId);
  const visibleAccounts = accounts.filter((account) => account.xeroTenantId === selectedXeroTenantId);
  const visibleTaxRates = taxRates.filter((rate) => rate.xeroTenantId === selectedXeroTenantId);
  const defaultTaxType = visibleTaxRates[0]?.xeroTaxType ?? "";

  const lineTotals = useMemo(() => {
    let subtotalCents = 0;
    let taxCents = 0;
    for (const row of lineItems) {
      const quantity = Number.parseFloat(row.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        continue;
      }
      const unitCents = parseMoneyToCents(row.unitAmount);
      const lineSubtotal = Math.round(quantity * unitCents);
      subtotalCents += lineSubtotal;
      const taxRate = visibleTaxRates.find((item) => item.xeroTaxType === row.taxType)?.rate ?? 0;
      taxCents += Math.round(lineSubtotal * ((taxRate ?? 0) / 100));
    }
    return { subtotalCents, taxCents, totalCents: subtotalCents + taxCents };
  }, [lineItems, visibleTaxRates]);

  const canSave = Boolean(selectedConnectionId && billDate && dueDate && lineItems.length > 0);
  const canPublish =
    canSave &&
    Boolean(selectedContactId) &&
    lineItems.every(
      (row) =>
        row.description.trim() &&
        row.accountId &&
        row.taxType &&
        Number.parseFloat(row.quantity) > 0 &&
        parseMoneyToCents(row.unitAmount) > 0,
    );

  async function saveDraft() {
    if (!canSave) {
      throw new Error("Add bill basics before saving.");
    }
    const payload = {
      id: draftId || undefined,
      xeroConnectionId: selectedConnectionId,
      contactId: selectedContactId || null,
      date: billDate,
      dueDate,
      reference: reference.trim() || null,
      invoiceNumber: billNumber.trim() || null,
      lineItems: lineItems.map((row) => ({
        description: row.description.trim(),
        quantity: Number.parseFloat(row.quantity) || 0,
        unitAmount: row.unitAmount,
        accountId: row.accountId || null,
        taxType: row.taxType || null,
      })),
    };
    const response = await fetch("/api/bills/save-draft", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error((await response.text()) || "Could not save draft.");
    }
    const data = (await response.json()) as SaveDraftResponse;
    if (data.invoice?.id) {
      setDraftId(data.invoice.id);
      if (data.invoice.id !== draftId) {
        router.replace(`/compose/bill/${data.invoice.id}`);
      }
    }
    if (data.invoice?.xero_invoice_number) {
      setBillNumber(data.invoice.xero_invoice_number);
    }
    return data.invoice?.id ?? draftId;
  }

  function updateLineItem(id: string, field: keyof LineItem, value: string) {
    setLineItems((current) => current.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  }

  function removeFile() {
    if (uploadedPreviewUrl) {
      URL.revokeObjectURL(uploadedPreviewUrl);
    }
    setUploadedFile(null);
    setUploadedPreviewUrl(null);
  }

  function applyExtraction(extraction: Record<string, unknown>) {
    const supplierName = readString(extraction, "supplier", "vendor", "supplierName", "vendorName");
    const extractedDate = readString(extraction, "date", "billDate", "invoiceDate");
    const extractedDueDate = readString(extraction, "dueDate", "paymentDueDate");
    const extractedTotal = readNumber(extraction, "total", "totalAmount", "amountTotal");
    const extractedItems = Array.isArray(extraction.lineItems) ? extraction.lineItems : Array.isArray(extraction.items) ? extraction.items : [];

    if (supplierName) {
      const normalized = supplierName.toLowerCase();
      const byName = visibleContacts.find((contact) => contact.name.toLowerCase() === normalized)
        ?? visibleContacts.find((contact) => contact.name.toLowerCase().includes(normalized) || normalized.includes(contact.name.toLowerCase()));
      if (byName) {
        setSelectedContactId(byName.id);
      }
    }
    if (extractedDate) {
      setBillDate(extractedDate);
    }
    if (extractedDueDate) {
      setDueDate(extractedDueDate);
    }

    if (extractedItems.length) {
      const nextItems: LineItem[] = [];
      for (const raw of extractedItems) {
        if (!raw || typeof raw !== "object") {
          continue;
        }
        const item = raw as Record<string, unknown>;
        const description = readString(item, "description", "name");
        const quantityValue = readNumber(item, "quantity", "qty");
        const unitAmountValue = readNumber(item, "unitAmount", "unitPrice", "amount");
        const accountHint = readString(item, "suggestedAccount", "accountCode", "accountName", "category");
        const taxHint = readString(item, "taxType", "taxRate", "suggestedTaxType");
        const matchedAccount = accountHint
          ? visibleAccounts.find((account) => account.code?.toLowerCase() === accountHint.toLowerCase())
            ?? visibleAccounts.find((account) => account.name.toLowerCase() === accountHint.toLowerCase())
          : null;
        const matchedTax = taxHint
          ? visibleTaxRates.find((rate) => rate.xeroTaxType.toLowerCase() === taxHint.toLowerCase())
            ?? visibleTaxRates.find((rate) => rate.name.toLowerCase() === taxHint.toLowerCase())
          : null;
        nextItems.push({
          id: crypto.randomUUID(),
          description,
          quantity: quantityValue ? String(quantityValue) : "1",
          unitAmount: unitAmountValue ? unitAmountValue.toFixed(2) : "",
          accountId: matchedAccount?.id ?? "",
          taxType: matchedTax?.xeroTaxType ?? defaultTaxType,
          review: {
            description: (readConfidence(item, "description") ?? 1) < LOW_CONFIDENCE_THRESHOLD,
            quantity: (readConfidence(item, "quantity") ?? 1) < LOW_CONFIDENCE_THRESHOLD,
            unitAmount: (readConfidence(item, "unitAmount") ?? 1) < LOW_CONFIDENCE_THRESHOLD,
            accountId: (readConfidence(item, "suggestedAccount") ?? 1) < LOW_CONFIDENCE_THRESHOLD,
          },
        });
      }
      if (nextItems.length > 0) {
        setLineItems(nextItems);
      }
    } else if (extractedTotal && extractedTotal > 0) {
      setLineItems((current) =>
        current.length
          ? current.map((row, index) => (index === 0 ? { ...row, quantity: "1", unitAmount: extractedTotal.toFixed(2) } : row))
          : [
              {
                id: crypto.randomUUID(),
                description: "",
                quantity: "1",
                unitAmount: extractedTotal.toFixed(2),
                accountId: "",
                taxType: defaultTaxType,
                review: {},
              },
            ],
      );
    }

    setReviewFields({
      contact: (readConfidence(extraction, "supplier") ?? readConfidence(extraction, "vendor") ?? 1) < LOW_CONFIDENCE_THRESHOLD,
      date: (readConfidence(extraction, "date") ?? 1) < LOW_CONFIDENCE_THRESHOLD,
      dueDate: (readConfidence(extraction, "dueDate") ?? 1) < LOW_CONFIDENCE_THRESHOLD,
      total: (readConfidence(extraction, "total") ?? 1) < LOW_CONFIDENCE_THRESHOLD,
    });
  }

  function handleFileSelect(file: File) {
    if (!ACCEPTED_TYPES.has(file.type)) {
      setError("Only PDF, JPEG, and PNG files are supported.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("File exceeds 10MB limit.");
      return;
    }
    setError(null);
    setDismissedWarning(false);
    removeFile();
    setUploadedFile(file);
    if (file.type.startsWith("image/")) {
      setUploadedPreviewUrl(URL.createObjectURL(file));
    }
    startExtracting(async () => {
      try {
        const body = new FormData();
        body.append("file", file);
        const response = await fetch("/api/bills/extract", {
          method: "POST",
          body,
        });
        if (!response.ok) {
          throw new Error((await response.text()) || "Extraction failed.");
        }
        const data = (await response.json()) as ExtractResponse;
        setExtractWarning(data.warning ?? null);
        if (data.extraction && typeof data.extraction === "object") {
          applyExtraction(data.extraction);
        }
      } catch (extractError) {
        setExtractWarning(extractError instanceof Error ? extractError.message : "Extraction failed. Review and fill manually.");
        setLineItems([
          {
            id: crypto.randomUUID(),
            description: "",
            quantity: "1",
            unitAmount: "",
            accountId: "",
            taxType: defaultTaxType,
            review: {},
          },
        ]);
      }
    });
  }

  return (
    <section className="space-y-4">
      <div>
        <p className="text-sm font-medium text-[var(--text-secondary)]">Compose</p>
        <h1 className="mt-1 text-xl font-semibold md:text-2xl">Bill</h1>
      </div>

      {successMessage ? (
        <div className="rounded-[var(--radius-card)] border border-[#a8c8b9] bg-[#f2faf5] px-4 py-3 text-sm">
          <p className="font-medium">{successMessage}</p>
          {xeroUrl ? (
            <a className="mt-1 inline-block text-[var(--ink)] underline" href={xeroUrl} rel="noreferrer" target="_blank">
              Open in Xero
            </a>
          ) : null}
        </div>
      ) : null}

      {publishError ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--warning)] bg-[#fef8ea] px-4 py-3 text-sm">
          <p className="font-medium">Publish failed</p>
          <p className="mt-1">{publishError}</p>
        </div>
      ) : null}

      {error ? <div className="rounded-[var(--radius-card)] border border-[var(--warning)] bg-[#fef8ea] px-4 py-3 text-sm">{error}</div> : null}

      {extractWarning && !dismissedWarning ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--warning)] bg-[#fef8ea] px-4 py-3 text-sm">
          <div className="flex items-start justify-between gap-2">
            <p>{extractWarning}</p>
            <button className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]" onClick={() => setDismissedWarning(true)} type="button">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,640px)_minmax(0,400px)]">
        <div className="space-y-4">
          <div className="bkp-card p-4">
            <p className="text-sm font-medium">Receipt attachment</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">PDF, JPEG, or PNG up to 10MB.</p>
            {uploadedFile ? (
              <div className="mt-3 rounded-[var(--radius-input)] border border-[var(--border)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    {uploadedPreviewUrl ? (
                      <Image alt={uploadedFile.name} className="h-16 w-16 rounded object-cover" height={64} src={uploadedPreviewUrl} unoptimized width={64} />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded border border-[var(--border)] bg-[var(--paper)]">
                        <FileText className="h-6 w-6 text-[var(--text-secondary)]" />
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium">{uploadedFile.name}</p>
                      <p className="text-xs text-[var(--text-secondary)]">{Math.round(uploadedFile.size / 1024)} KB</p>
                    </div>
                  </div>
                  <button className="text-sm font-medium text-[var(--ink)] underline" onClick={removeFile} type="button">
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <label className="mt-3 flex h-28 cursor-pointer items-center justify-center rounded-[var(--radius-input)] border border-dashed border-[var(--border)] text-sm text-[var(--text-secondary)] hover:bg-[var(--paper)]">
                <input className="sr-only" onChange={(event) => event.target.files?.[0] && handleFileSelect(event.target.files[0])} type="file" />
                <span className="inline-flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Upload bill receipt
                </span>
              </label>
            )}
            {isExtracting ? <p className="mt-2 text-xs text-[var(--text-secondary)]">Extracting fields…</p> : null}
          </div>

          <div className="bkp-card p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-[var(--text-secondary)]">Xero connection</span>
                <select className="bkp-input h-10 w-full px-3 text-sm" onChange={(event) => setSelectedConnectionId(event.target.value)} value={selectedConnectionId}>
                  {connections.map((connection) => (
                    <option key={connection.id} value={connection.id}>
                      {connection.xeroTenantName ?? connection.xeroTenantId}
                    </option>
                  ))}
                </select>
              </label>
              <label className={`space-y-1 text-sm ${reviewFields.contact ? "rounded border border-[#e8c547] p-2" : ""}`}>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-secondary)]">Supplier</span>
                  {reviewFields.contact ? lowConfidenceLabel() : null}
                </div>
                <select className="bkp-input h-10 w-full px-3 text-sm" onChange={(event) => setSelectedContactId(event.target.value)} value={selectedContactId}>
                  <option value="">Select supplier</option>
                  {visibleContacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={`space-y-1 text-sm ${reviewFields.date ? "rounded border border-[#e8c547] p-2" : ""}`}>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-secondary)]">Date</span>
                  {reviewFields.date ? lowConfidenceLabel() : null}
                </div>
                <input className="bkp-input h-10 w-full px-3 text-sm" onChange={(event) => setBillDate(event.target.value)} type="date" value={billDate} />
              </label>
              <label className={`space-y-1 text-sm ${reviewFields.dueDate ? "rounded border border-[#e8c547] p-2" : ""}`}>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-secondary)]">Due date</span>
                  {reviewFields.dueDate ? lowConfidenceLabel() : null}
                </div>
                <input className="bkp-input h-10 w-full px-3 text-sm" onChange={(event) => setDueDate(event.target.value)} type="date" value={dueDate} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[var(--text-secondary)]">Reference</span>
                <input className="bkp-input h-10 w-full px-3 text-sm" onChange={(event) => setReference(event.target.value)} placeholder="Optional reference" value={reference} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[var(--text-secondary)]">Bill number</span>
                <input className="bkp-input h-10 w-full px-3 text-sm" onChange={(event) => setBillNumber(event.target.value)} placeholder="Optional supplier bill number" value={billNumber} />
              </label>
            </div>
          </div>

          <div className="bkp-card overflow-hidden">
            <div className="border-b border-[var(--border)] px-4 py-3">
              <h2 className="text-base font-semibold">Line items</h2>
            </div>
            <div className="space-y-3 p-4">
              {lineItems.map((row) => (
                <div className="grid gap-2 rounded-[var(--radius-input)] border border-[var(--border)] p-3 sm:grid-cols-2 lg:grid-cols-[2fr_0.7fr_1fr_1.1fr_1.1fr_auto] lg:items-end" key={row.id}>
                  <label className={`space-y-1 text-sm ${row.review.description ? "rounded border border-[#e8c547] p-2" : ""}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--text-secondary)]">Description</span>
                      {row.review.description ? lowConfidenceLabel() : null}
                    </div>
                    <input className="bkp-input h-10 w-full px-3 text-sm" onChange={(event) => updateLineItem(row.id, "description", event.target.value)} value={row.description} />
                  </label>
                  <label className={`space-y-1 text-sm ${row.review.quantity ? "rounded border border-[#e8c547] p-2" : ""}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--text-secondary)]">Qty</span>
                      {row.review.quantity ? lowConfidenceLabel() : null}
                    </div>
                    <input className="bkp-input h-10 w-full px-3 text-sm" onChange={(event) => updateLineItem(row.id, "quantity", event.target.value)} step="0.01" type="number" value={row.quantity} />
                  </label>
                  <label className={`space-y-1 text-sm ${row.review.unitAmount ? "rounded border border-[#e8c547] p-2" : ""}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--text-secondary)]">Unit amount</span>
                      {row.review.unitAmount ? lowConfidenceLabel() : null}
                    </div>
                    <input className="bkp-input bkp-money h-10 w-full px-3 text-sm" onChange={(event) => updateLineItem(row.id, "unitAmount", event.target.value)} placeholder="0.00" type="text" value={row.unitAmount} />
                  </label>
                  <label className={`space-y-1 text-sm ${row.review.accountId ? "rounded border border-[#e8c547] p-2" : ""}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--text-secondary)]">Expense account</span>
                      {row.review.accountId ? lowConfidenceLabel() : null}
                    </div>
                    <select className="bkp-input h-10 w-full px-3 text-sm" onChange={(event) => updateLineItem(row.id, "accountId", event.target.value)} value={row.accountId}>
                      <option value="">Select account</option>
                      {visibleAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.code ? `${account.code} · ${account.name}` : account.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-[var(--text-secondary)]">Tax rate</span>
                    <select className="bkp-input h-10 w-full px-3 text-sm" onChange={(event) => updateLineItem(row.id, "taxType", event.target.value)} value={row.taxType}>
                      {visibleTaxRates.map((rate) => (
                        <option key={`${rate.xeroTenantId}:${rate.xeroTaxType}`} value={rate.xeroTaxType}>
                          {rate.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-button)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--paper)]" onClick={() => setLineItems((current) => (current.length > 1 ? current.filter((item) => item.id !== row.id) : current))} type="button">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-button)] border border-[var(--border)] px-3 text-sm font-medium hover:bg-[var(--paper)]" onClick={() => setLineItems((current) => [...current, { id: crypto.randomUUID(), description: "", quantity: "1", unitAmount: "", accountId: "", taxType: defaultTaxType, review: {} }])} type="button">
                <Plus className="h-4 w-4" />
                Add line item
              </button>
            </div>
            <div className={`border-t border-[var(--border)] bg-[var(--paper)] px-4 py-3 ${reviewFields.total ? "outline outline-1 outline-[#e8c547]" : ""}`}>
              <div className="ml-auto max-w-xs space-y-1 text-sm">
                {reviewFields.total ? <div className="mb-1 text-right">{lowConfidenceLabel()}</div> : null}
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-secondary)]">Subtotal</span>
                  <span className="bkp-money">{formatMoneyFromCents(lineTotals.subtotalCents)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-secondary)]">Tax</span>
                  <span className="bkp-money">{formatMoneyFromCents(lineTotals.taxCents)}</span>
                </div>
                <div className="flex items-center justify-between font-semibold">
                  <span>Total</span>
                  <span className="bkp-money">{formatMoneyFromCents(lineTotals.totalCents)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button className="h-10 rounded-[var(--radius-button)] border border-[var(--border)] px-4 text-sm font-medium hover:bg-[var(--paper)] disabled:opacity-60" disabled={isSaving || isPublishing || !canSave} onClick={() => startSaving(async () => {
              try {
                setError(null);
                setSuccessMessage(null);
                await saveDraft();
              } catch (saveError) {
                setError(saveError instanceof Error ? saveError.message : "Could not save draft.");
              }
            })} type="button">
              {isSaving ? "Saving..." : "Save draft"}
            </button>
            <button className="bkp-button h-10 px-4 text-sm disabled:opacity-60" disabled={isSaving || isPublishing || !canPublish} onClick={() => startPublishing(async () => {
              try {
                setError(null);
                setPublishError(null);
                setSuccessMessage(null);
                const savedDraftId = await saveDraft();
                if (!savedDraftId) {
                  throw new Error("Draft was not created.");
                }
                const response = await fetch(`/api/bills/${savedDraftId}/publish`, { method: "POST" });
                if (!response.ok) {
                  throw new Error((await response.text()) || "Could not publish bill.");
                }
                const data = (await response.json().catch(() => ({}))) as PublishResponse;
                setSuccessMessage("Bill sent to Xero");
                setXeroUrl(typeof data.xeroUrl === "string" ? data.xeroUrl : null);
                router.refresh();
              } catch (publishErr) {
                setError(publishErr instanceof Error ? publishErr.message : "Could not publish bill.");
              }
            })} type="button">
              {isPublishing ? "Publishing..." : "Publish to Xero as DRAFT"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
