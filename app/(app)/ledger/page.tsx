import { ListChecks } from "lucide-react";

export default function LedgerPage() {
  return (
    <section className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <ListChecks className="h-10 w-10 text-[var(--text-muted)]" />
      <h1 className="text-xl font-semibold">No transactions yet</h1>
      <p className="max-w-md text-sm text-[var(--text-secondary)]">
        Add an expense or revenue and it will appear here.
      </p>
      <button
        className="bkp-button mt-2 px-4 py-2 text-sm opacity-70"
        disabled
        type="button"
      >
        Add transaction
      </button>
    </section>
  );
}
