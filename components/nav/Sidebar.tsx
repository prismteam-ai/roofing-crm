"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FUTURE_SECTIONS, PRIMARY_NAV } from "@/lib/config/sections";
import { OSCEOLA } from "@/lib/config/county";

/** Application sidebar: live sections plus visibly disabled future sections. */
export function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-[var(--line)] bg-[var(--panel)] md:h-screen md:w-60 md:border-b-0 md:border-r">
      <div className="flex items-center gap-2 px-4 py-4">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[var(--brand)] text-sm font-bold text-white">
          R
        </span>
        <div>
          <div className="text-sm font-semibold leading-tight">Roofing CRM</div>
          <div className="text-xs text-[var(--muted)]">{OSCEOLA.label}</div>
        </div>
      </div>
      <nav
        className="flex flex-row gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:pb-0"
        aria-label="Primary"
      >
        {PRIMARY_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(item.href) ? "page" : undefined}
            className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              isActive(item.href)
                ? "bg-amber-50 text-[var(--brand)]"
                : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="mt-2 px-4 pt-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)] md:mt-4">
        Coming soon
      </div>
      <nav
        className="flex flex-row gap-1 overflow-x-auto px-2 pb-3 md:flex-col"
        aria-label="Future sections"
      >
        {FUTURE_SECTIONS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-disabled="true"
            title={`${item.label} - coming soon: ${item.description}`}
            className={`group flex items-center justify-between rounded-md px-3 py-2 text-sm text-gray-400 hover:bg-gray-50 ${
              isActive(item.href) ? "bg-gray-50" : ""
            }`}
          >
            <span className="line-through decoration-gray-300">{item.label}</span>
            <span className="rounded border border-gray-200 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-gray-400">
              soon
            </span>
          </Link>
        ))}
      </nav>
      <div className="mt-auto hidden px-4 py-3 text-[11px] text-[var(--muted)] md:block">
        Data: Elephant MCP (Osceola query tables). Leads: Postgres.
      </div>
    </aside>
  );
}
