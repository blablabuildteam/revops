"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Columns3,
  ListFilter,
  Building2,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/pipeline", label: "Pipeline", icon: Columns3 },
  { href: "/opportunities", label: "Kansen", icon: ListFilter },
  { href: "/companies", label: "Bedrijven", icon: Building2 },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 shrink-0 border-r border-neutral-800 flex flex-col bg-neutral-950">
      <div className="px-5 py-5 border-b border-neutral-800">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded bg-amber-500 flex items-center justify-center">
            <TrendingUp className="w-3.5 h-3.5 text-neutral-950" />
          </div>
          <span className="font-semibold text-sm tracking-tight">RevOps</span>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {nav.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-2.5 py-2 rounded-md text-sm transition-colors",
                active
                  ? "bg-neutral-800 text-neutral-100 font-medium"
                  : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="px-5 py-4 border-t border-neutral-800">
        <p className="text-xs text-neutral-600 font-mono">v0.1.0</p>
      </div>
    </aside>
  );
}
