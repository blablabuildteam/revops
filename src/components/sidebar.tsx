"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  ListFilter,
  Building2,
  FolderKanban,
  Euro,
  CheckSquare,
  LogOut,
  Sun,
  Moon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";
import { useEffect, useState } from "react";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/opportunities", label: "Opportunities", icon: ListFilter },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/todos", label: "Tasks", icon: CheckSquare },
  { href: "/finance", label: "Finance", icon: Euro },
  { href: "/companies", label: "Companies", icon: Building2 },
];

interface SessionUser { id: string; email: string; name: string }

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user))
      .catch(() => {});
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="w-56 shrink-0 border-r border-neutral-800 flex flex-col bg-neutral-950">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-neutral-800">
        <div className="flex items-center gap-3">
          <span className="logo-radiation-wrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="Logo"
              width={32}
              height={32}
              className="rounded-md"
            />
          </span>
          <div className="space-y-0.5">
            <p className="text-xs font-bold tracking-[0.2em] uppercase text-[#e8ff47]">
              blablabuild
            </p>
            <p className="text-[10px] text-neutral-600 tracking-widest uppercase">
              Workspace
            </p>
          </div>
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

      {/* User + logout */}
      <div className="px-4 py-4 border-t border-neutral-800 space-y-3">
        {user && (
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium text-neutral-300 truncate">{user.name}</p>
              <p className="text-[10px] text-neutral-600 truncate">{user.email}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={toggle}
                title={theme === "dark" ? "Light theme" : "Dark theme"}
                className="p-1.5 text-neutral-600 hover:text-neutral-300 hover:bg-neutral-800 rounded transition-colors"
              >
                {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={handleLogout}
                title="Log out"
                className="p-1.5 text-neutral-600 hover:text-neutral-300 hover:bg-neutral-800 rounded transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
        <p className="text-[10px] text-neutral-700 tracking-widest uppercase font-mono">
          Talk less. Build more.
        </p>
      </div>
    </aside>
  );
}
