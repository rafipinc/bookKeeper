"use client";

import { LayoutDashboard, ListChecks } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/ledger", label: "Ledger", icon: ListChecks },
];

export function DesktopNav({ disabled = false }: { disabled?: boolean }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="mt-4 px-3">
      <ul className="space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = !disabled && pathname === href;

          if (disabled) {
            return (
              <li key={href}>
                <span
                  aria-disabled="true"
                  className="flex h-10 w-full cursor-not-allowed items-center gap-3 rounded-md px-3 text-sm text-zinc-400 dark:text-zinc-500"
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
                className={`flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  isActive
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-slate-800 dark:hover:text-zinc-100"
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
    </nav>
  );
}

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary mobile"
      className="fixed bottom-0 left-0 right-0 flex h-14 border-t border-zinc-200 bg-white/95 backdrop-blur md:hidden dark:border-slate-800 dark:bg-slate-900/90"
    >
      {navItems.map(({ href, label, icon: Icon }) => {
        const isActive = pathname === href;

        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={`flex flex-1 flex-col items-center justify-center gap-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              isActive ? "text-blue-700 dark:text-blue-300" : "text-zinc-600 dark:text-zinc-400"
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
