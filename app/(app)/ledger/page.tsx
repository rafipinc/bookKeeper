import { ListChecks } from "lucide-react";

export default function LedgerPage() {
  return (
    <section className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <ListChecks className="h-10 w-10 text-zinc-400 dark:text-zinc-500" />
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">No transactions yet</h1>
      <p className="max-w-md text-sm text-zinc-600 dark:text-zinc-300">
        Add an expense or revenue and it will appear here.
      </p>
      <button
        className="mt-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white opacity-70"
        disabled
        type="button"
      >
        Add transaction
      </button>
    </section>
  );
}
