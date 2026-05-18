"use client";

import { useActionState } from "react";

import { seedDemoData, type SeedDemoState } from "@/app/actions/demo";

const initialState: SeedDemoState = {
  error: null,
  message: null,
};

export default function SeedDemoDataForm() {
  const [state, formAction, isPending] = useActionState(seedDemoData, initialState);

  return (
    <form action={formAction} className="bkp-card p-4">
      <h2 className="text-base font-semibold">Demo helper</h2>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        Add a realistic sample dataset for this account.
      </p>
      <button className="bkp-button mt-3 px-4 py-2 text-sm" disabled={isPending} type="submit">
        {isPending ? "Seeding..." : "Seed demo data"}
      </button>
      {state.message ? <p className="mt-2 text-sm text-[var(--income)]">{state.message}</p> : null}
      {state.error ? <p className="mt-2 text-sm text-[var(--expense)]">{state.error}</p> : null}
    </form>
  );
}
