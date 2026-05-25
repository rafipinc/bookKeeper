"use client";

import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

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

type DraftInvoice = {
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
};

type SaveDraftResponse = {
  invoice?: {
    id?: string;
    xero_invoice_number?: string | null;
  };
};

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
          : typeof candidate.unitAmount === "string"
            ? candidate.unitAmount
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
        },
      ];
}

export function InvoiceComposer({
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
  initialDraft: DraftInvoice | null;
}) {
  const router = useRouter();
  const [isSaving, startSaving] = useTransition();
  const [isPublishing, startPublishing] = useTransition();
  const [previewTab, setPreviewTab] = useState<"form" | "preview">("form");
  const [error, setError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(initialDraft?.publishError ?? null);
  const [showCreateContact, setShowCreateContact] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [isCreatingContact, startCreatingContact] = useTransition();
  const defaultConnection = connections.find((connection) => connection.xeroTenantId === initialDraft?.xeroTenantId) ?? connections[0] ?? null;
  const [selectedConnectionId, setSelectedConnectionId] = useState(defaultConnection?.id ?? "");
  const [selectedContactId, setSelectedContactId] = useState(initialDraft?.contactId ?? "");
  const [invoiceDate, setInvoiceDate] = useState(initialDraft?.date ?? todayIso());
  const [dueDate, setDueDate] = useState(initialDraft?.dueDate ?? plusDaysIso(14));
  const [reference, setReference] = useState(initialDraft?.reference ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState(initialDraft?.invoiceNumber ?? "");
  const initialDefaultTaxType =
    taxRates.find((rate) => rate.xeroTenantId === defaultConnection?.xeroTenantId)?.xeroTaxType ??
    taxRates[0]?.xeroTaxType ??
    "";
  const [lineItems, setLineItems] = useState<LineItem[]>(parseLineItems(initialDraft?.lineItemsJson, initialDefaultTaxType));
  const [draftId, setDraftId] = useState(initialDraft?.id ?? "");
  const [localContacts, setLocalContacts] = useState<XeroContactOption[]>(contacts);
  const selectedConnection = connections.find((connection) => connection.id === selectedConnectionId) ?? null;
  const selectedXeroTenantId = selectedConnection?.xeroTenantId ?? "";
  const visibleContacts = localContacts.filter((contact) => contact.xeroTenantId === selectedXeroTenantId);
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

  const canSave = Boolean(selectedConnectionId && invoiceDate && dueDate && lineItems.length > 0);
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
      throw new Error("Add invoice basics before saving.");
    }

    const payload = {
      id: draftId || undefined,
      xeroConnectionId: selectedConnectionId,
      contactId: selectedContactId || null,
      date: invoiceDate,
      dueDate,
      reference: reference.trim() || null,
      invoiceNumber: invoiceNumber.trim() || null,
      lineItems: lineItems.map((row) => ({
        description: row.description.trim(),
        quantity: Number.parseFloat(row.quantity) || 0,
        unitAmount: row.unitAmount,
        accountId: row.accountId || null,
        taxType: row.taxType || null,
      })),
    };

    const response = await fetch("/api/invoices/save-draft", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(body || "Could not save draft.");
    }

    const data = (await response.json()) as SaveDraftResponse;
    if (data.invoice?.id) {
      setDraftId(data.invoice.id);
      if (data.invoice.id !== draftId) {
        router.replace(`/compose/invoice/${data.invoice.id}`);
      }
    }
    if (data.invoice?.xero_invoice_number) {
      setInvoiceNumber(data.invoice.xero_invoice_number);
    }
    return data.invoice?.id ?? draftId;
  }

  function addLineItem() {
    setLineItems((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        description: "",
        quantity: "1",
        unitAmount: "",
        accountId: "",
        taxType: defaultTaxType,
      },
    ]);
  }

  function selectConnection(connectionId: string) {
    const nextConnection = connections.find((connection) => connection.id === connectionId) ?? null;
    const nextDefaultTaxType = taxRates.find((rate) => rate.xeroTenantId === nextConnection?.xeroTenantId)?.xeroTaxType ?? "";

    setSelectedConnectionId(connectionId);
    setSelectedContactId("");
    setLineItems((current) =>
      current.map((row) => ({
        ...row,
        accountId: "",
        taxType: nextDefaultTaxType,
      })),
    );
  }

  function removeLineItem(id: string) {
    setLineItems((current) => (current.length > 1 ? current.filter((row) => row.id !== id) : current));
  }

  async function handleCreateContact() {
    if (!selectedConnectionId || !newContactName.trim()) {
      return;
    }

    startCreatingContact(async () => {
      try {
        setError(null);
        const response = await fetch("/api/xero/contacts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            xeroConnectionId: selectedConnectionId,
            name: newContactName.trim(),
            email: newContactEmail.trim() || undefined,
            is_customer: true,
          }),
        });
        if (!response.ok) {
          const body = await response.text();
          throw new Error(body || "Could not create contact.");
        }
        const data = (await response.json()) as { contact?: { id?: string; name?: string; email?: string | null } };
        const createdId = data.contact?.id;
        if (createdId) {
          setLocalContacts((current) =>
            [
              {
                id: createdId,
                xeroTenantId: selectedXeroTenantId,
                name: data.contact?.name ?? newContactName.trim(),
                email: data.contact?.email ?? null,
              },
              ...current,
            ].sort((a, b) => a.name.localeCompare(b.name)),
          );
          setSelectedContactId(createdId);
        }
        setNewContactName("");
        setNewContactEmail("");
        setShowCreateContact(false);
      } catch (createError) {
        setError(createError instanceof Error ? createError.message : "Could not create contact.");
      }
    });
  }

  function updateLineItem(id: string, field: keyof LineItem, value: string) {
    setLineItems((current) => current.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  }

  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[var(--text-secondary)]">Compose</p>
          <h1 className="mt-1 text-xl font-semibold md:text-2xl">Invoice</h1>
        </div>
      </div>

      {publishError ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--warning)] bg-[#fef8ea] px-4 py-3 text-sm text-[var(--text-primary)]">
          <p className="font-medium">Publish failed</p>
          <p className="mt-1">{publishError}</p>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--warning)] bg-[#fef8ea] px-4 py-3 text-sm text-[var(--text-primary)]">{error}</div>
      ) : null}

      <div className="flex border-b border-[var(--border)] md:hidden">
        <button
          className={`h-10 flex-1 text-sm font-medium ${previewTab === "form" ? "border-b-2 border-[var(--ink)] text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}
          onClick={() => setPreviewTab("form")}
          type="button"
        >
          Form
        </button>
        <button
          className={`h-10 flex-1 text-sm font-medium ${previewTab === "preview" ? "border-b-2 border-[var(--ink)] text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}
          onClick={() => setPreviewTab("preview")}
          type="button"
        >
          Preview
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,640px)_minmax(0,400px)]">
        <div className={`space-y-4 ${previewTab === "preview" ? "hidden md:block" : ""}`}>
          <div className="bkp-card p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-[var(--text-secondary)]">Xero connection</span>
                <select className="bkp-input h-10 w-full px-3 text-sm" onChange={(event) => selectConnection(event.target.value)} value={selectedConnectionId}>
                  {connections.map((connection) => (
                    <option key={connection.id} value={connection.id}>
                      {connection.xeroTenantName ?? connection.xeroTenantId}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[var(--text-secondary)]">Contact</span>
                <select className="bkp-input h-10 w-full px-3 text-sm" onChange={(event) => setSelectedContactId(event.target.value)} value={selectedContactId}>
                  <option value="">Select contact</option>
                  {visibleContacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <button className="mt-3 text-sm font-medium text-[var(--ink)] underline-offset-4 hover:underline" onClick={() => setShowCreateContact((current) => !current)} type="button">
              + Create new contact
            </button>

            {showCreateContact ? (
              <div className="mt-3 grid gap-2 rounded-[var(--radius-input)] border border-[var(--border)] p-3 sm:grid-cols-[1fr_1fr_auto]">
                <input className="bkp-input h-10 px-3 text-sm" onChange={(event) => setNewContactName(event.target.value)} placeholder="Contact name" value={newContactName} />
                <input className="bkp-input h-10 px-3 text-sm" onChange={(event) => setNewContactEmail(event.target.value)} placeholder="Email (optional)" value={newContactEmail} />
                <button className="bkp-button h-10 px-4 text-sm" disabled={isCreatingContact || !newContactName.trim()} onClick={handleCreateContact} type="button">
                  {isCreatingContact ? "Creating..." : "Create"}
                </button>
              </div>
            ) : null}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-[var(--text-secondary)]">Date</span>
                <input className="bkp-input h-10 w-full px-3 text-sm" onChange={(event) => setInvoiceDate(event.target.value)} type="date" value={invoiceDate} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[var(--text-secondary)]">Due date</span>
                <input className="bkp-input h-10 w-full px-3 text-sm" onChange={(event) => setDueDate(event.target.value)} type="date" value={dueDate} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[var(--text-secondary)]">Reference</span>
                <input className="bkp-input h-10 w-full px-3 text-sm" onChange={(event) => setReference(event.target.value)} placeholder="Optional reference" value={reference} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[var(--text-secondary)]">Invoice number</span>
                <input className="bkp-input h-10 w-full px-3 text-sm" onChange={(event) => setInvoiceNumber(event.target.value)} placeholder="Auto-suggested by Xero" value={invoiceNumber} />
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
                  <label className="space-y-1 text-sm">
                    <span className="text-[var(--text-secondary)]">Description</span>
                    <input className="bkp-input h-10 w-full px-3 text-sm" onChange={(event) => updateLineItem(row.id, "description", event.target.value)} value={row.description} />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-[var(--text-secondary)]">Qty</span>
                    <input className="bkp-input h-10 w-full px-3 text-sm" onChange={(event) => updateLineItem(row.id, "quantity", event.target.value)} step="0.01" type="number" value={row.quantity} />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-[var(--text-secondary)]">Unit amount</span>
                    <input className="bkp-input bkp-money h-10 w-full px-3 text-sm" onChange={(event) => updateLineItem(row.id, "unitAmount", event.target.value)} placeholder="0.00" type="text" value={row.unitAmount} />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-[var(--text-secondary)]">Account</span>
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
                  <button className="inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-button)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--paper)]" onClick={() => removeLineItem(row.id)} type="button">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}

              <button className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-button)] border border-[var(--border)] px-3 text-sm font-medium hover:bg-[var(--paper)]" onClick={addLineItem} type="button">
                <Plus className="h-4 w-4" />
                Add line item
              </button>
            </div>

            <div className="border-t border-[var(--border)] bg-[var(--paper)] px-4 py-3">
              <div className="ml-auto max-w-xs space-y-1 text-sm">
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
            <button
              className="h-10 rounded-[var(--radius-button)] border border-[var(--border)] px-4 text-sm font-medium hover:bg-[var(--paper)] disabled:opacity-60"
              disabled={isSaving || isPublishing || !canSave}
              onClick={() =>
                startSaving(async () => {
                  try {
                    setError(null);
                    await saveDraft();
                  } catch (saveError) {
                    setError(saveError instanceof Error ? saveError.message : "Could not save draft.");
                  }
                })
              }
              type="button"
            >
              {isSaving ? "Saving..." : "Save draft"}
            </button>
            <button
              className="bkp-button h-10 px-4 text-sm disabled:opacity-60"
              disabled={isSaving || isPublishing || !canPublish}
              onClick={() =>
                startPublishing(async () => {
                  try {
                    setError(null);
                    setPublishError(null);
                    const savedDraftId = await saveDraft();
                    if (!savedDraftId) {
                      throw new Error("Draft was not created.");
                    }
                    const response = await fetch(`/api/invoices/${savedDraftId}/publish`, {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                    });
                    if (!response.ok) {
                      const body = await response.text();
                      throw new Error(body || "Could not publish invoice.");
                    }
                    router.refresh();
                  } catch (publishErr) {
                    setError(publishErr instanceof Error ? publishErr.message : "Could not publish invoice.");
                  }
                })
              }
              type="button"
            >
              {isPublishing ? "Publishing..." : "Publish to Xero as DRAFT"}
            </button>
          </div>
        </div>

        <aside className={`${previewTab === "form" ? "hidden md:block" : ""}`}>
          <div className="bkp-card p-4">
            <h2 className="text-base font-semibold">Preview</h2>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">{selectedConnection ? (selectedConnection.xeroTenantName ?? selectedConnection.xeroTenantId) : "No connection selected"}</p>

            <div className="mt-4 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs uppercase text-[var(--text-muted)]">Date</p>
                  <p>{invoiceDate || "—"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-[var(--text-muted)]">Due</p>
                  <p>{dueDate || "—"}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs uppercase text-[var(--text-muted)]">Reference</p>
                  <p>{reference || "—"}</p>
                </div>
              </div>

              <div>
                <p className="text-xs uppercase text-[var(--text-muted)]">Contact</p>
                <p>{visibleContacts.find((contact) => contact.id === selectedContactId)?.name ?? "Select a contact"}</p>
              </div>

              <div className="rounded-[var(--radius-input)] border border-[var(--border)]">
                <div className="grid grid-cols-[1fr_auto_auto] gap-2 border-b border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)]">
                  <span>Description</span>
                  <span>Qty</span>
                  <span>Amount</span>
                </div>
                {lineItems.map((row) => {
                  const quantity = Number.parseFloat(row.quantity) || 0;
                  const amountCents = Math.round(quantity * parseMoneyToCents(row.unitAmount));
                  return (
                    <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-3 py-2 text-sm" key={row.id}>
                      <span className="truncate">{row.description || "—"}</span>
                      <span className="bkp-money">{quantity || "0"}</span>
                      <span className="bkp-money">{formatMoneyFromCents(amountCents)}</span>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-1 border-t border-[var(--border)] pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-secondary)]">Subtotal</span>
                  <span className="bkp-money">{formatMoneyFromCents(lineTotals.subtotalCents)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-secondary)]">Tax</span>
                  <span className="bkp-money">{formatMoneyFromCents(lineTotals.taxCents)}</span>
                </div>
                <div className="flex items-center justify-between text-base font-semibold">
                  <span>Total</span>
                  <span className="bkp-money">{formatMoneyFromCents(lineTotals.totalCents)}</span>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
