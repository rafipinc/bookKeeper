import { redirect } from "next/navigation";

import { signOut } from "@/app/actions/auth";
import BusinessProfileForm from "@/app/(app)/business-profile-form";
import { DesktopNav, MobileNav } from "@/app/(app)/nav-links";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    redirect("/login");
  }

  const { data: business } = await supabase
    .from("businesses")
    .select("id")
    .eq("owner_id", user.id)
    .limit(1)
    .maybeSingle();

  const hasBusiness = Boolean(business?.id);

  return (
    <div className="flex h-svh flex-col bg-zinc-100 text-zinc-900 dark:bg-slate-950 dark:text-zinc-100 md:flex-row">
      <aside className="hidden h-svh w-60 shrink-0 border-r border-zinc-200 bg-white/90 backdrop-blur md:sticky md:top-0 md:flex md:flex-col dark:border-slate-800 dark:bg-slate-900/80">
        <div className="flex h-14 items-center px-4 text-lg font-semibold tracking-tight text-blue-700 dark:text-blue-400">
          bookkeeping
        </div>
        <DesktopNav disabled={!hasBusiness} />
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-zinc-200 bg-white/85 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
          <p className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 md:text-sm md:font-medium">
            bookkeeping
          </p>
          <div className="flex items-center gap-3">
            <p className="text-sm text-zinc-600 dark:text-zinc-300">{user.email}</p>
            <form action={signOut}>
              <button
                className="rounded-md border border-zinc-300 bg-white/70 px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-zinc-200 dark:hover:bg-slate-800"
                type="submit"
              >
                Sign out
              </button>
            </form>
          </div>
        </header>

        <main className="flex-1 overflow-auto bg-gradient-to-b from-transparent via-zinc-100/20 to-zinc-200/30 p-4 pb-20 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900/60 md:p-6 md:pb-6">
          {hasBusiness ? children : <BusinessProfileForm />}
        </main>
      </div>

      {hasBusiness ? <MobileNav /> : null}
    </div>
  );
}
