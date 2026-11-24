"use client";

import { useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import type { Role } from "@prisma/client";
import type { PermissionKey } from "@/modules/auth/permissions";
import { cn } from "@/lib/utils";
import Sidebar from "./Sidebar";
import Header from "./Header";

// Clean storage key defaulting to expanded (false)
const SIDEBAR_KEY = "ahlain_sidebar_collapsed_v3";
const sidebarListeners = new Set<() => void>();

function getSidebarSnapshot(): boolean {
  try {
    // Desktop default is ALWAYS expanded (false) unless user explicitly clicked Collapse
    return localStorage.getItem(SIDEBAR_KEY) === "true";
  } catch {
    return false;
  }
}

function getSidebarServerSnapshot(): boolean {
  return false;
}

function subscribeSidebar(onChange: () => void): () => void {
  sidebarListeners.add(onChange);
  return () => {
    sidebarListeners.delete(onChange);
  };
}

function setSidebarCollapsed(next: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_KEY, String(next));
  } catch {}
  for (const listener of sidebarListeners) listener();
}

function toggleSidebarCollapsed(): void {
  setSidebarCollapsed(!getSidebarSnapshot());
}

export default function Shell({
  user,
  permissions,
  children,
}: {
  user: { name: string; email: string; role: Role };
  permissions: PermissionKey[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [prevPathname, setPrevPathname] = useState(pathname);

  // Automatically reset mobile drawer when pathname changes
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setMobileOpen(false);
  }

  const collapsed = useSyncExternalStore(
    subscribeSidebar,
    getSidebarSnapshot,
    getSidebarServerSnapshot,
  );

  const handleToggle = () => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setMobileOpen((prev) => !prev);
    } else {
      toggleSidebarCollapsed();
    }
  };

  return (
    <div className="min-h-screen bg-page">
      {/* Mobile Backdrop Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-navy/60 backdrop-blur-xs transition-opacity lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Main Navigation Sidebar */}
      <Sidebar
        role={user.role}
        permissions={permissions}
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        onToggleCollapse={toggleSidebarCollapsed}
      />

      {/* Main Content Area */}
      <div
        className={cn(
          "transition-[padding] duration-200 ease-in-out pl-0",
          collapsed ? "lg:pl-[72px]" : "lg:pl-64",
        )}
      >
        <Header
          user={user}
          collapsed={collapsed}
          onToggleSidebar={handleToggle}
        />
        <main className="min-h-screen px-4 sm:px-6 pb-12 pt-[84px]">{children}</main>
      </div>
    </div>
  );
}
