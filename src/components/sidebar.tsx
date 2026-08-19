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
  Users,
  Shield,
  LogOut,
  Sun,
  Moon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";
import { UserAvatar } from "@/components/user-avatar";
import { useSession } from "@/components/session-provider";

export const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/opportunities", label: "Opportunities", icon: ListFilter },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/capacity", label: "Capacity", icon: Users },
  { href: "/todos", label: "Tasks", icon: CheckSquare },
  { href: "/finance", label: "Finance", icon: Euro },
  { href: "/sla", label: "SLA", icon: Shield },
  { href: "/companies", label: "Companies", icon: Building2 },
];

export function isNavItemActive(href: string, pathname: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Sidebar({
  className,
  onNavigate,
}: {
  className?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const { user, setUser } = useSession();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside
      className={cn(
        "w-56 shrink-0 border-r border-neutral-800 flex flex-col bg-neutral-950",
        className
      )}
    >
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
            <p className="text-xs font-bold tracking-[0.2em] uppercase text-[#d4e052]">
              blablabuild
            </p>
            <p className="text-[10px] text-neutral-600 tracking-widest uppercase">
              Workspace
            </p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isNavItemActive(href, pathname);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 px-2.5 py-2.5 lg:py-2 rounded text-sm transition-colors",
                active
                  ? "bg-[#d4e052]/10 text-[#d4e052] font-medium"
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
      <div className="px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-neutral-800 space-y-3">
        {user && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <UserAvatar
                id={user.id}
                name={user.name}
                avatarUrl={user.avatar_url}
                size="sm"
                uploadable
                onAvatarChange={(avatarUrl) =>
                  setUser((prev) => (prev ? { ...prev, avatar_url: avatarUrl } : prev))
                }
              />
              <div className="min-w-0">
                <p className="text-xs font-medium text-neutral-300 truncate">{user.name}</p>
                <p className="text-[10px] text-neutral-600 truncate">{user.email}</p>
              </div>
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
