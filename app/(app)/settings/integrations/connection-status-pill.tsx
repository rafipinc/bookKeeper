import type { Database } from "@/lib/supabase/types";

type ConnectionStatus = Database["public"]["Tables"]["xero_connections"]["Row"]["status"];

const statusCopy: Record<ConnectionStatus, string> = {
  active: "Active",
  reauth_required: "Re-auth required",
  disconnected: "Disconnected",
};

const statusClassName: Record<ConnectionStatus, string> = {
  active: "bg-[var(--income-bg)] text-[var(--sage)]",
  reauth_required: "bg-[#fbf1d7] text-[#8a5d00]",
  disconnected: "bg-[var(--border-sub)] text-[var(--text-secondary)]",
};

export function ConnectionStatusPill({ status }: { status: ConnectionStatus }) {
  return (
    <span className={`inline-flex h-7 items-center rounded-[var(--radius-pill)] px-2.5 text-xs font-medium ${statusClassName[status]}`}>
      {statusCopy[status]}
    </span>
  );
}
