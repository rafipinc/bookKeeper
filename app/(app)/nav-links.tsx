"use client";

import { Clock, FilePlus2, LayoutDashboard, ListChecks, Plug, ReceiptText, ScanLine, Settings2, Sliders } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navSections = [
  {
    label: "Bookkeeping",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/activity", label: "Activity", icon: Clock },
      { href: "/ledger", label: "Transactions", icon: ListChecks },
    ],
  },
  {
    label: "Review",
    items: [
      { href: "/reconcile", label: "Review", icon: ScanLine },
    ],
  },
  {
    label: "Setup",
    items: [
      { href: "/settings/integrations", label: "Connections", icon: Plug },
      { href: "/settings/rules", label: "Rules", icon: Sliders },
    ],
  },
  {
    label: "Create",
    items: [
      { href: "/compose/invoice", label: "New invoice", icon: FilePlus2 },
      { href: "/compose/bill", label: "New bill", icon: ReceiptText },
    ],
  },
];

function isNavActive(pathname: string, href: string): boolean {
  if (href === "/reconcile") return pathname === "/reconcile" || pathname.startsWith("/reconcile/");
  if (href === "/settings/rules") return pathname === "/settings/rules" || pathname.startsWith("/settings/rules/");
  if (href === "/activity") return pathname === "/activity" || pathname.startsWith("/activity/");
  if (href === "/settings/integrations") return pathname.startsWith("/settings");
  return pathname === href;
}

export function DesktopNav({ disabled = false }: { disabled?: boolean }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="mt-4 space-y-5 px-3">
      {navSections.map((section) => (
        <div key={section.label}>
          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{section.label}</p>
          <ul className="space-y-1">
            {section.items.map(({ href, label, icon: Icon }) => {
              const isActive = !disabled && isNavActive(pathname, href);

              if (disabled) {
                return (
                  <li key={href}>
                    <span
                      aria-disabled="true"
                      className="flex h-10 w-full cursor-not-allowed items-center gap-3 rounded-md px-3 text-sm text-[var(--text-muted)]"
                      title="Complete setup to unlock"
                    >
                      <Icon className="h-4 w-4" />
                      <span>{label}</span>
                    </span>
                  </li>
                );
              }

              return (
                <li key={href}>
                  <Link
                    aria-current={isActive ? "page" : undefined}
                    className={`flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)] ${
                      isActive
                        ? "bg-[var(--paper)] text-[var(--ink)]"
                        : "text-[var(--text-secondary)] hover:bg-[var(--paper)] hover:text-[var(--text-primary)]"
                    }`}
                    href={href}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function MobileNav() {
  const pathname = usePathname();

  const mobileItems = [
    { href: "/dashboard", label: "Home", icon: LayoutDashboard },
    { href: "/activity", label: "Activity", icon: Clock },
    { href: "/reconcile", label: "Review", icon: ScanLine },
    { href: "/ledger", label: "Transactions", icon: ListChecks },
    { href: "/settings/integrations", label: "Setup", icon: Settings2 },
  ];

  return (
    <nav aria-label="Primary mobile" className="fixed bottom-0 left-0 right-0 flex h-14 border-t border-[var(--border)] bg-[var(--surface)] md:hidden">
      {mobileItems.map(({ href, label, icon: Icon }) => {
        const isActive = isNavActive(pathname, href);

        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={`flex flex-1 flex-col items-center justify-center gap-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)] ${
              isActive ? "text-[var(--ink)]" : "text-[var(--text-secondary)]"
            }`}
            href={href}
            key={href}
          >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
