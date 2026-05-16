import { Receipt } from "lucide-react";

export default function DashboardPage() {
  return (
    <section className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <Receipt className="h-10 w-10 text-zinc-400" />
      <h1 className="text-xl font-semibold">Your dashboard is empty</h1>
      <p className="max-w-md text-sm text-zinc-500">
        Log a transaction to see your monthly summary here.
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
