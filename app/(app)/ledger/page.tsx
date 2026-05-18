import AddTransactionForm from "@/app/(app)/add-transaction-form";
import { createClient } from "@/lib/supabase/server";

function formatMoney(amountCents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amountCents / 100);
}

export default async function LedgerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: business } = await supabase
    .from("businesses")
    .select("id")
    .eq("owner_id", user.id)
    .limit(1)
    .single();

  if (!business) {
    return null;
  }

  const { data: categories } = await supabase
    .from("categories")
    .select("id,name,kind")
    .eq("business_id", business.id)
    .order("kind", { ascending: true })
    .order("name", { ascending: true });

  const { data: transactions } = await supabase
    .from("transactions")
    .select("id,type,amount_cents,date,note,categories(name)")
    .eq("business_id", business.id)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);

  const safeCategories = categories ?? [];
  const safeTransactions = transactions ?? [];

  return (
    <section className="space-y-6">
      <h1 className="text-xl font-semibold">Ledger</h1>

      <AddTransactionForm categories={safeCategories} />

      <div className="bkp-card overflow-hidden">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-base font-semibold">Recent transactions</h2>
        </div>

        {safeTransactions.length === 0 ? (
          <p className="px-4 py-6 text-sm text-[var(--text-secondary)]">No transactions yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {safeTransactions.map((tx) => (
              <li className="flex items-start justify-between gap-3 px-4 py-3" key={tx.id}>
                <div>
                  <p className="text-sm font-medium">{tx.categories?.[0]?.name ?? "Uncategorized"}</p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {tx.date}
                    {tx.note ? ` • ${tx.note}` : ""}
                  </p>
                </div>
                <p className={`bkp-money text-sm font-semibold ${tx.type === "income" ? "text-[var(--income)]" : ""}`}>
                  {tx.type === "expense" ? "-" : "+"}
                  {formatMoney(tx.amount_cents)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
