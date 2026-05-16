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
    <div className="flex h-svh flex-col md:flex-row">
      <aside className="hidden h-svh w-60 shrink-0 border-r bg-white md:sticky md:top-0 md:flex md:flex-col">
        <div className="flex h-14 items-center px-4 text-lg font-semibold text-blue-700">bookkeeping</div>
        <DesktopNav disabled={!hasBusiness} />
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b bg-white px-4">
          <p className="text-base font-semibold text-zinc-900 md:text-sm md:font-medium">bookkeeping</p>
          <div className="flex items-center gap-3">
            <p className="text-sm text-zinc-500">{user.email}</p>
            <form action={signOut}>
              <button
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                type="submit"
              >
                Sign out
              </button>
            </form>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 pb-20 md:p-6 md:pb-6">
          {hasBusiness ? children : <BusinessProfileForm />}
        </main>
      </div>

      {hasBusiness ? <MobileNav /> : null}
    </div>
  );
}
