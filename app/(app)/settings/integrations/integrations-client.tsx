"use client";

import { CheckCircle2, MoreVertical, RefreshCw, Trash2, XCircle } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";

import { disconnectXeroConnection, syncXeroConnection } from "@/app/actions/xero";
import { ConnectionStatusPill } from "@/app/(app)/settings/integrations/connection-status-pill";
import type { Database } from "@/lib/supabase/types";

type XeroConnection = Pick<
  Database["public"]["Tables"]["xero_connections"]["Row"],
  "id" | "xero_tenant_name" | "xero_tenant_id" | "status" | "created_at" | "scopes" | "last_synced_at"
>;

type ToastKind = "success" | "error";

function formatDate(value: string | null) {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function getScopeSummary(scopes: string[]) {
  if (scopes.length === 0) {
    return "No scopes recorded";
  }

  if (scopes.length <= 3) {
    return scopes.join(", ");
  }

  return `${scopes.slice(0, 3).join(", ")} +${scopes.length - 3} more`;
}

function useConnectionToast() {
  const [toast, setToast] = useState<{ kind: ToastKind; message: string } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const error = params.get("error");

    if (connected === "1") {
      setToast({ kind: "success", message: "Xero connected. Your organisation is ready to sync." });
      params.delete("connected");
    } else if (error) {
      setToast({ kind: "error", message: `Xero connection failed: ${error.replaceAll("_", " ")}` });
      params.delete("error");
    }

    if (connected || error) {
      const nextSearch = params.toString();
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}`;
      window.history.replaceState({}, "", nextUrl);
    }
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  return { toast, setToast };
}

function Toast({ toast }: { toast: { kind: ToastKind; message: string } }) {
  const Icon = toast.kind === "success" ? CheckCircle2 : XCircle;
  const colorClass = toast.kind === "success" ? "border-[var(--income)] bg-[var(--income-bg)]" : "border-[var(--expense)] bg-[var(--expense-bg)]";

  return (
    <div className={`fixed right-4 top-4 z-50 flex max-w-sm items-start gap-3 rounded-[var(--radius-card)] border p-3 shadow-sm ${colorClass}`} role="status">
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="text-sm text-[var(--text-primary)]">{toast.message}</p>
    </div>
  );
}

function ConnectionActions({ connection, onToast }: { connection: XeroConnection; onToast: (toast: { kind: ToastKind; message: string }) => void }) {
  const [syncPending, startSyncTransition] = useTransition();
  const [disconnectPending, startDisconnectTransition] = useTransition();
  const [syncDisabledUntil, setSyncDisabledUntil] = useState<number>(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const syncDisabled = syncPending || connection.status !== "active" || Date.now() < syncDisabledUntil;
  const orgName = connection.xero_tenant_name ?? connection.xero_tenant_id;

  function handleSync() {
    setSyncDisabledUntil(Date.now() + 5000);
    window.setTimeout(() => setSyncDisabledUntil(0), 5000);
    startSyncTransition(async () => {
      try {
        await syncXeroConnection(connection.id);
        onToast({ kind: "success", message: `Sync queued for ${orgName}.` });
      } catch (error) {
        setSyncDisabledUntil(0);
        onToast({ kind: "error", message: error instanceof Error ? error.message : "Could not queue the sync." });
      }
    });
  }

  function handleDisconnect() {
    startDisconnectTransition(async () => {
      try {
        await disconnectXeroConnection(connection.id);
        setConfirmOpen(false);
        onToast({ kind: "success", message: `${orgName} disconnected.` });
      } catch (error) {
        onToast({ kind: "error", message: error instanceof Error ? error.message : "Could not disconnect the organisation." });
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--paper)] disabled:cursor-not-allowed disabled:opacity-50"
        disabled={syncDisabled}
        onClick={handleSync}
        title={connection.status === "reauth_required" ? "Re-authorise this connection before syncing." : undefined}
        type="button"
      >
        <RefreshCw className={`h-4 w-4 ${syncPending ? "animate-spin" : ""}`} />
        Sync now
      </button>
      <button
        aria-haspopup="dialog"
        className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-medium text-[var(--expense)] hover:bg-[var(--expense-bg)]"
        onClick={() => setConfirmOpen(true)}
        type="button"
      >
        <Trash2 className="h-4 w-4" />
        Disconnect
      </button>

      {confirmOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
          <div aria-modal="true" className="w-full max-w-md rounded-[var(--radius-modal)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-lg" role="alertdialog">
            <h2 className="text-lg font-semibold">Disconnect Xero?</h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              This stops future syncs for {orgName}. Existing bookkeeping records stay in place.
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                className="h-10 rounded-[var(--radius-button)] border border-[var(--border)] px-4 text-sm font-medium"
                disabled={disconnectPending}
                onClick={() => setConfirmOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="h-10 rounded-[var(--radius-button)] bg-[var(--expense)] px-4 text-sm font-medium text-white disabled:opacity-60"
                disabled={disconnectPending}
                onClick={handleDisconnect}
                type="button"
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MobileConnectionCard({ connection, onToast }: { connection: XeroConnection; onToast: (toast: { kind: ToastKind; message: string }) => void }) {
  const orgName = connection.xero_tenant_name ?? connection.xero_tenant_id;

  return (
    <article className="bkp-card p-4 md:hidden">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{orgName}</h2>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">Connected {formatDate(connection.created_at)}</p>
        </div>
        <ConnectionStatusPill status={connection.status} />
      </div>
      <dl className="mt-4 space-y-3 text-sm">
        <div>
          <dt className="text-xs uppercase text-[var(--text-muted)]">Scopes</dt>
          <dd className="mt-1 break-words text-[var(--text-primary)]" title={connection.scopes.join(", ")}>
            {getScopeSummary(connection.scopes)}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-[var(--text-muted)]">Last synced</dt>
          <dd className="mt-1 text-[var(--text-primary)]">{formatDate(connection.last_synced_at)}</dd>
        </div>
      </dl>
      <div className="mt-4 flex flex-col gap-2">
        <ConnectionActions connection={connection} onToast={onToast} />
      </div>
    </article>
  );
}

export function IntegrationsClient({ connections }: { connections: XeroConnection[] }) {
  const { toast, setToast } = useConnectionToast();
  const sortedConnections = useMemo(
    () => [...connections].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [connections],
  );

  return (
    <>
      {toast ? <Toast toast={toast} /> : null}

      {sortedConnections.length === 0 ? (
        <div className="grid min-h-[420px] place-items-center">
          <div className="bkp-card w-full max-w-[480px] p-6 text-center">
            <h2 className="text-2xl font-semibold">Connect your Xero</h2>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[var(--text-secondary)]">
              Read bank transactions, publish invoices and bills, and suggest categorisations from your own bookkeeping patterns.
            </p>
            <a className="bkp-button mt-6 inline-flex h-11 items-center justify-center px-5 text-sm" href="/api/xero/connect">
              Connect Xero
            </a>
            <a className="mt-4 block text-xs font-medium text-[var(--text-secondary)] underline-offset-4 hover:underline" href="https://developer.xero.com/documentation/guides/oauth2/scopes/" rel="noreferrer" target="_blank">
              Read about the permissions we request
            </a>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedConnections.map((connection) => (
            <MobileConnectionCard connection={connection} key={connection.id} onToast={setToast} />
          ))}

          <div className="bkp-card hidden overflow-hidden md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[var(--border)] bg-[var(--paper)] text-xs uppercase text-[var(--text-secondary)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Organisation</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Connected on</th>
                  <th className="px-4 py-3 font-medium">Scopes</th>
                  <th className="px-4 py-3 font-medium">Last synced</th>
                  <th className="px-4 py-3 text-right font-medium">
                    <span className="sr-only">Actions</span>
                    <MoreVertical className="ml-auto h-4 w-4" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {sortedConnections.map((connection) => {
                  const orgName = connection.xero_tenant_name ?? connection.xero_tenant_id;

                  return (
                    <tr key={connection.id}>
                      <td className="px-4 py-4 font-medium text-[var(--text-primary)]">{orgName}</td>
                      <td className="px-4 py-4">
                        <ConnectionStatusPill status={connection.status} />
                      </td>
                      <td className="px-4 py-4 text-[var(--text-secondary)]">{formatDate(connection.created_at)}</td>
                      <td className="max-w-xs px-4 py-4 text-[var(--text-secondary)]" title={connection.scopes.join(", ")}>
                        <span className="block max-w-xs truncate">{getScopeSummary(connection.scopes)}</span>
                      </td>
                      <td className="px-4 py-4 text-[var(--text-secondary)]">{formatDate(connection.last_synced_at)}</td>
                      <td className="px-4 py-4">
                        <div className="flex justify-end">
                          <ConnectionActions connection={connection} onToast={setToast} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
