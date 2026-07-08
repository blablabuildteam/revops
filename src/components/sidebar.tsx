"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Columns3,
  ListFilter,
  Building2,
  FolderKanban,
  Euro,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/pipeline", label: "Pipeline", icon: Columns3 },
  { href: "/opportunities", label: "Kansen", icon: ListFilter },
  { href: "/projects", label: "Projecten", icon: FolderKanban },
  { href: "/finance", label: "Financieel", icon: Euro },
  { href: "/companies", label: "Bedrijven", icon: Building2 },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 shrink-0 border-r border-neutral-800 flex flex-col bg-neutral-950">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-neutral-800">
        <div className="space-y-0.5">
          <p className="text-xs font-bold tracking-[0.2em] uppercase text-[#e8ff47]">
            blablabuild
          </p>
          <p className="text-[10px] text-neutral-600 tracking-widest uppercase">
            Revenue ops
          </p>
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
                "flex items-center gap-3 px-2.5 py-2 rounded text-sm transition-colors",
                active
                  ? "bg-[#e8ff47]/10 text-[#e8ff47] font-medium"
                  : "text-neutral-500 hover:text-neutral-200 hover:bg-neutral-900"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="px-5 py-4 border-t border-neutral-800">
        <p className="text-[10px] text-neutral-700 tracking-widest uppercase font-mono">
          Talk less. Build more.
        </p>
      </div>
    </aside>
  );
}
