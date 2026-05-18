"use client";

import { Loader2 } from "lucide-react";
import { useActionState } from "react";

import {
  createTransaction,
  createTransactionInitialState,
} from "@/app/actions/transactions";

type CategoryOption = {
  id: string;
  name: string;
  kind: "income" | "expense";
};

function todayIso() {
  return new Date().toISOString().split("T")[0];
}

export default function AddTransactionForm({
  categories,
}: {
  categories: CategoryOption[];
}) {
  const [state, formAction, isPending] = useActionState(
    createTransaction,
    createTransactionInitialState,
  );

  return (
    <form action={formAction} className="bkp-card space-y-3 p-4">
      <h2 className="text-lg font-semibold">Add transaction</h2>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-[var(--text-secondary)]">Type</span>
          <select className="bkp-input w-full px-3 py-2" defaultValue="expense" name="type">
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-[var(--text-secondary)]">Amount (USD)</span>
          <input
            className="bkp-input w-full px-3 py-2"
            inputMode="decimal"
            name="amount"
            placeholder="0.00"
            required
            type="text"
          />
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-[var(--text-secondary)]">Date</span>
          <input className="bkp-input w-full px-3 py-2" defaultValue={todayIso()} name="date" required type="date" />
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-[var(--text-secondary)]">Category</span>
          <select className="bkp-input w-full px-3 py-2" name="categoryId" required>
            <option value="">Select category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name} ({category.kind})
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block text-[var(--text-secondary)]">Note (optional)</span>
        <input className="bkp-input w-full px-3 py-2" maxLength={140} name="note" placeholder="Vendor, context, etc." type="text" />
      </label>

      {state.error ? <p className="text-sm text-[var(--expense)]">{state.error}</p> : null}

      <button className="bkp-button inline-flex items-center gap-2 px-4 py-2 text-sm" disabled={isPending} type="submit">
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {isPending ? "Saving..." : "Save transaction"}
      </button>
    </form>
  );
}
