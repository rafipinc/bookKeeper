import AddTransactionForm from "@/app/(app)/add-transaction-form";
import SeedDemoDataForm from "@/app/(app)/seed-demo-data-form";
import { createClient } from "@/lib/supabase/server";

function formatMoney(amountCents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amountCents / 100);
}

function monthRange(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const toIso = (d: Date) => d.toISOString().split("T")[0];
  return { start: toIso(start), end: toIso(end) };
}

export default async function DashboardPage() {
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

  const { start, end } = monthRange(new Date());

  const { data: categories } = await supabase
    .from("categories")
    .select("id,name,kind")
    .eq("business_id", business.id)
    .order("kind", { ascending: true })
    .order("name", { ascending: true });

  const { data: transactions } = await supabase
    .from("transactions")
    .select("id,type,amount_cents,categories(name)")
    .eq("business_id", business.id)
    .gte("date", start)
    .lte("date", end);

  const safeTransactions = transactions ?? [];
  let totalIncome = 0;
  let totalExpense = 0;
  const byCategory = new Map<string, number>();

  for (const tx of safeTransactions) {
    if (tx.type === "income") {
      totalIncome += tx.amount_cents;
    } else {
      totalExpense += tx.amount_cents;
    }

    const categoryName = tx.categories?.[0]?.name ?? "Uncategorized";
    byCategory.set(categoryName, (byCategory.get(categoryName) ?? 0) + tx.amount_cents);
  }

  const net = totalIncome - totalExpense;
  const categoryRows = Array.from(byCategory.entries()).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));

  return (
    <section className="space-y-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="bkp-card p-4">
          <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">Income</p>
          <p className="bkp-money mt-1 text-lg font-semibold text-[var(--income)]">{formatMoney(totalIncome)}</p>
        </div>
        <div className="bkp-card p-4">
          <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">Expenses</p>
          <p className="bkp-money mt-1 text-lg font-semibold">{formatMoney(totalExpense)}</p>
        </div>
        <div className="bkp-card p-4">
          <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">Net</p>
          <p className={`bkp-money mt-1 text-lg font-semibold ${net >= 0 ? "text-[var(--income)]" : "text-[var(--expense)]"}`}>
            {net >= 0 ? "+" : "-"}
            {formatMoney(Math.abs(net))}
          </p>
        </div>
      </div>

      <AddTransactionForm categories={categories ?? []} />
      <SeedDemoDataForm />

      <div className="bkp-card overflow-hidden">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-base font-semibold">This month by category</h2>
        </div>
        {categoryRows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-[var(--text-secondary)]">No transactions in the current month yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {categoryRows.map(([name, cents]) => (
              <li className="flex items-center justify-between px-4 py-3" key={name}>
                <span className="text-sm">{name}</span>
                <span className="bkp-money text-sm font-semibold">{formatMoney(cents)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
