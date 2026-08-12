"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { NAV_ITEMS, Sidebar, isNavItemActive } from "@/components/sidebar";
import { cn } from "@/lib/utils";

function currentTitle(pathname: string) {
  const match = [...NAV_ITEMS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => isNavItemActive(item.href, pathname));
  return match?.label ?? "Workspace";
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Tracking the route the drawer was opened on closes it on navigation
  // without an effect that would re-render the whole shell.
  const [drawer, setDrawer] = useState({ open: false, path: pathname });
  const navOpen = drawer.open && drawer.path === pathname;

  const setNavOpen = useCallback(
    (open: boolean) => setDrawer({ open, path: pathname }),
    [pathname],
  );

  useEffect(() => {
    if (!navOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navOpen, setNavOpen]);

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar className="hidden lg:flex" />

      {/* Mobile drawer */}
      <div
        className={cn(
          "lg:hidden fixed inset-0 z-50",
          navOpen ? "" : "pointer-events-none"
        )}
        inert={!navOpen}
      >
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setNavOpen(false)}
          className={cn(
            "absolute inset-0 bg-black/60 transition-opacity duration-200",
            navOpen ? "opacity-100" : "opacity-0"
          )}
        />
        <Sidebar
          onNavigate={() => setNavOpen(false)}
          className={cn(
            "absolute inset-y-0 left-0 w-[min(17rem,85vw)] max-w-none shadow-2xl shadow-black/50 transition-transform duration-200 ease-out pt-[env(safe-area-inset-top)]",
            navOpen ? "translate-x-0" : "-translate-x-full"
          )}
        />
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setNavOpen(false)}
          className={cn(
            "absolute left-[calc(min(17rem,85vw)+0.5rem)] top-[calc(env(safe-area-inset-top)+0.75rem)] flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-900/80 text-neutral-300 transition-opacity duration-200",
            navOpen ? "opacity-100" : "opacity-0"
          )}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-1 min-w-0 flex-col">
        <header className="lg:hidden z-30 flex shrink-0 items-center gap-2 border-b border-neutral-800 bg-neutral-950 px-2 pt-[env(safe-area-inset-top)]">
          <button
            type="button"
            onClick={() => setNavOpen(!navOpen)}
            aria-label={navOpen ? "Close menu" : "Open menu"}
            aria-expanded={navOpen}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-neutral-400 active:bg-neutral-900"
          >
            {navOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-2 py-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" width={22} height={22} className="rounded" />
            <span className="truncate text-sm font-medium text-neutral-200">
              {currentTitle(pathname)}
            </span>
          </div>
        </header>

        <main className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain contain-layout">
          {children}
        </main>
      </div>
    </div>
  );
}
