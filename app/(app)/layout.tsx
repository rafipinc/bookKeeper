import { DesktopNav, MobileNav } from "@/app/(app)/nav-links";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // Temporary auth bypass mode for MVP UI iteration.
  const hasBusiness = true;
  const userEmail = "guest@local";

  return (
    <div className="flex h-svh flex-col md:flex-row">
      <aside className="hidden h-svh w-60 shrink-0 border-r border-[var(--border)] bg-[var(--surface)] md:sticky md:top-0 md:flex md:flex-col">
        <div className="flex h-14 items-center px-4 text-lg font-semibold text-[var(--ink)]">bookkeeping</div>
        <DesktopNav disabled={!hasBusiness} />
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4">
          <p className="text-base font-semibold text-[var(--text-primary)] md:text-sm md:font-medium">bookkeeping</p>
          <div className="flex items-center gap-3">
            <p className="text-sm text-[var(--text-secondary)]">{userEmail}</p>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 pb-20 md:p-6 md:pb-6">{children}</main>
      </div>

      {hasBusiness ? <MobileNav /> : null}
    </div>
  );
}
