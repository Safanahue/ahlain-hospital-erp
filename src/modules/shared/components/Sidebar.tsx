"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@prisma/client";
import type { PermissionKey } from "@/modules/auth/permissions";
import {
  NAV_GROUP_ORDER,
  NAV_ITEMS,
  type NavItem,
} from "@/modules/shared/nav";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronRight,
  Activity,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from "lucide-react";

/**
 * Checks if a child submenu link is active, preventing prefix collision
 * between sibling routes (e.g. /settings vs /settings/services).
 */
function isChildActive(
  pathname: string,
  childHref: string,
  allSiblings: { href: string }[]
): boolean {
  if (pathname === childHref) return true;
  if (!pathname.startsWith(childHref + "/")) return false;
  // If another sibling has a longer/more specific href that also matches, this broader one is not active
  const moreSpecificSibling = allSiblings.some(
    (s) =>
      s.href !== childHref &&
      s.href.startsWith(childHref) &&
      (pathname === s.href || pathname.startsWith(s.href + "/"))
  );
  return !moreSpecificSibling;
}

/**
 * Checks if a nav item (or any of its children) is active.
 */
function isItemActive(
  pathname: string,
  item: NavItem,
  allItems: NavItem[]
): boolean {
  if (item.children?.length) {
    return item.children.some((c) =>
      isChildActive(pathname, c.href, item.children!)
    );
  }
  if (item.href === "/") return pathname === "/";
  if (pathname === item.href) return true;
  if (!pathname.startsWith(item.href + "/")) return false;

  // Sibling prefix disambiguation for top-level items
  const moreSpecificItem = allItems.some(
    (other) =>
      other.href !== item.href &&
      other.href.startsWith(item.href) &&
      (pathname === other.href || pathname.startsWith(other.href + "/"))
  );
  return !moreSpecificItem;
}

export default function Sidebar({
  role,
  permissions,
  collapsed = false,
  mobileOpen = false,
  onCloseMobile,
  onToggleCollapse,
}: {
  role: Role;
  permissions: PermissionKey[];
  collapsed?: boolean;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  onToggleCollapse?: () => void;
}) {
  const pathname = usePathname();
  const allowed = new Set(permissions);
  const [logoFailed, setLogoFailed] = useState(false);

  // Filter items by role permissions
  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.permission || allowed.has(item.permission)
  );

  // Group items
  const grouped = NAV_GROUP_ORDER.map((group) => ({
    group,
    items: visibleItems.filter((item) => item.group === group),
  })).filter((section) => section.items.length > 0);

  // Expanded sections state (default all open)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    NAV_GROUP_ORDER.forEach((g) => {
      initial[g] = true;
    });
    return initial;
  });

  // Expanded submenus state
  const [openChildren, setOpenChildren] = useState<Record<string, boolean>>({
    "/billing/invoices": true,
    "/ip": true,
    "/laboratory": true,
    "/communication": true,
    "/settings": true,
  });

  // Automatically expand parent group & submenu when navigating to a matching page
  useEffect(() => {
    grouped.forEach(({ group, items }) => {
      const hasActiveChild = items.some((item) =>
        isItemActive(pathname, item, visibleItems)
      );
      if (hasActiveChild) {
        setOpenSections((prev) => ({ ...prev, [group]: true }));
        items.forEach((item) => {
          if (
            item.children?.length &&
            isItemActive(pathname, item, visibleItems)
          ) {
            setOpenChildren((prev) => ({ ...prev, [item.href]: true }));
          }
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const toggleSection = (group: string) => {
    setOpenSections((prev) => ({ ...prev, [group]: !prev[group] }));
  };

  const toggleChildMenu = (href: string) => {
    setOpenChildren((prev) => ({ ...prev, [href]: !prev[href] }));
  };

  const isExpanded = !collapsed || mobileOpen;

  return (
    <aside
      className={cn(
        "no-print fixed left-0 top-0 z-50 flex h-screen flex-col bg-navy text-white shadow-xl select-none transition-all duration-200 ease-in-out",
        // Desktop widths
        collapsed ? "lg:w-[72px]" : "lg:w-64",
        // Mobile drawer behavior (width 256px, slides in/out)
        mobileOpen
          ? "translate-x-0 w-64 shadow-2xl"
          : "-translate-x-full lg:translate-x-0 w-64"
      )}
    >
      {/* Brand & Hospital Header */}
      <div
        className={cn(
          "flex h-16 shrink-0 items-center border-b border-white/10 bg-navy/95 transition-all duration-200",
          collapsed && !mobileOpen ? "lg:justify-center lg:px-2 px-4 justify-between" : "justify-between px-4"
        )}
      >
        <Link
          href="/"
          onClick={onCloseMobile}
          className="flex items-center gap-3 overflow-hidden group min-w-0"
          title="AHLAIN HOSPITAL ERP"
        >
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white p-1 shadow-xs transition-transform group-hover:scale-105">
            {!logoFailed ? (
              <img
                src="/uploads/ahlain-logo.png"
                alt="Ahlain Hospital Logo"
                className="h-full w-full object-contain"
                onError={() => setLogoFailed(true)}
              />
            ) : (
              <Activity className="h-6 w-6 text-teal" />
            )}
          </div>
          {isExpanded && (
            <div className="min-w-0 transition-opacity duration-200">
              <p className="truncate text-sm font-bold tracking-wide text-white uppercase leading-tight">
                Ahlain Hospital
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <p className="text-[10px] font-semibold tracking-wider text-teal-300 uppercase">
                  Management ERP
                </p>
              </div>
            </div>
          )}
        </Link>

        {/* Mobile Close Button */}
        {mobileOpen && (
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close sidebar"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white transition-colors lg:hidden shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Navigation Items (Scrollable with compact spacing) */}
      <nav
        aria-label="Main navigation"
        className={cn(
          "flex-1 overflow-y-auto overflow-x-hidden py-2 space-y-2 custom-sidebar-scroll",
          isExpanded ? "px-2.5" : "px-2"
        )}
      >
        {grouped.map(({ group, items }, groupIndex) => {
          const isOpen = openSections[group] !== false;

          return (
            <div key={group} className="space-y-0.5">
              {/* Group Title or Minimal Divider when Collapsed */}
              {isExpanded ? (
                <button
                  type="button"
                  onClick={() => toggleSection(group)}
                  className="flex w-full items-center justify-between px-3 pt-2.5 pb-1 text-[10px] font-bold tracking-[0.14em] text-white/45 uppercase hover:text-white/80 transition-colors"
                >
                  <span className="truncate">{group}</span>
                  {isOpen ? (
                    <ChevronDown className="h-3 w-3 text-white/40 shrink-0 ml-1" />
                  ) : (
                    <ChevronRight className="h-3 w-3 text-white/40 shrink-0 ml-1" />
                  )}
                </button>
              ) : groupIndex > 0 ? (
                <div className="my-1.5 border-t border-white/10" title={group} />
              ) : null}

              {/* Group Items List */}
              {(isOpen || !isExpanded) && (
                <ul className="space-y-0.5">
                  {items.map((item) => {
                    const Icon = item.icon;
                    const active = isItemActive(pathname, item, visibleItems);

                    // Disabled "Coming soon" item
                    if (item.status === "soon") {
                      return (
                        <li key={item.href}>
                          <span
                            title={`${item.label} (Coming soon)`}
                            aria-disabled="true"
                            className={cn(
                              "flex cursor-not-allowed items-center rounded-lg py-1.5 text-[13px] text-white/35 transition-colors",
                              isExpanded
                                ? "gap-3 px-3"
                                : "justify-center p-2"
                            )}
                          >
                            <Icon className="h-4 w-4 shrink-0 text-white/30" aria-hidden />
                            {isExpanded && (
                              <>
                                <span className="truncate font-medium">{item.label}</span>
                                <span className="ml-auto rounded bg-white/5 px-1.5 py-0.5 text-[9px] font-semibold tracking-wider text-white/40 uppercase">
                                  Soon
                                </span>
                              </>
                            )}
                          </span>
                        </li>
                      );
                    }

                    // Item with children submenus
                    if (item.children?.length) {
                      const visibleChildren = item.children.filter(
                        (c) => !c.permission || allowed.has(c.permission)
                      );
                      const isChildExpanded = openChildren[item.href] !== false;

                      // Collapsed Desktop View
                      if (!isExpanded) {
                        return (
                          <li key={item.href}>
                            <Link
                              href={item.href}
                              title={item.label}
                              className={cn(
                                "flex items-center justify-center rounded-lg p-2.5 transition-colors",
                                active
                                  ? "bg-medical text-white shadow-xs font-semibold"
                                  : "text-white/70 hover:bg-white/10 hover:text-white"
                              )}
                            >
                              <Icon className="h-4 w-4 shrink-0" aria-hidden />
                            </Link>
                          </li>
                        );
                      }

                      // Expanded View with Submenu
                      return (
                        <li key={item.href} className="pt-0.5">
                          <button
                            type="button"
                            onClick={() => toggleChildMenu(item.href)}
                            className={cn(
                              "flex w-full items-center justify-between rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                              active
                                ? "text-white bg-white/10 font-semibold"
                                : "text-white/75 hover:bg-white/5 hover:text-white"
                            )}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <Icon
                                className={cn(
                                  "h-4 w-4 shrink-0 transition-colors",
                                  active ? "text-teal-300" : "text-white/60"
                                )}
                                aria-hidden
                              />
                              <span className="truncate">{item.label}</span>
                            </div>
                            {isChildExpanded ? (
                              <ChevronDown className="h-3.5 w-3.5 text-white/50 shrink-0 ml-1" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 text-white/50 shrink-0 ml-1" />
                            )}
                          </button>

                          {isChildExpanded && (
                            <ul className="mt-0.5 ml-4 pl-3 space-y-0.5 border-l border-white/15">
                              {visibleChildren.map((child) => {
                                const childActive = isChildActive(
                                  pathname,
                                  child.href,
                                  visibleChildren
                                );
                                return (
                                  <li key={child.href}>
                                    <Link
                                      href={child.href}
                                      onClick={onCloseMobile}
                                      aria-current={childActive ? "page" : undefined}
                                      className={cn(
                                        "relative block rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                                        childActive
                                          ? "bg-teal text-white font-semibold shadow-xs"
                                          : "text-white/70 hover:bg-white/10 hover:text-white"
                                      )}
                                    >
                                      {child.label}
                                    </Link>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </li>
                      );
                    }

                    // Standard Nav Link (no children)
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={onCloseMobile}
                          title={!isExpanded ? item.label : undefined}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "group relative flex items-center rounded-lg text-[13px] font-medium transition-colors",
                            isExpanded
                              ? "gap-3 px-3 py-2"
                              : "justify-center p-2.5",
                            active
                              ? "bg-medical text-white font-semibold shadow-xs"
                              : "text-white/70 hover:bg-white/10 hover:text-white"
                          )}
                        >
                          {/* Active Indicator Bar */}
                          {active && isExpanded && (
                            <span
                              className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-md bg-teal"
                              aria-hidden
                            />
                          )}
                          <Icon
                            className={cn(
                              "h-4 w-4 shrink-0 transition-colors",
                              active ? "text-white" : "text-white/60 group-hover:text-white"
                            )}
                            aria-hidden
                          />
                          {isExpanded && (
                            <span className="truncate">{item.label}</span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer Collapse Toggle & System Status */}
      <div className="shrink-0 border-t border-white/10 px-3 py-2.5 bg-navy/95">
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            title={collapsed ? "Expand sidebar (256px)" : "Collapse sidebar (72px)"}
            className={cn(
              "hidden lg:flex w-full items-center rounded-lg py-1.5 text-xs text-white/65 hover:bg-white/10 hover:text-white transition-colors mb-1.5",
              collapsed ? "justify-center px-0" : "gap-2.5 px-3"
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4 text-teal-300 shrink-0" />
            ) : (
              <>
                <PanelLeftClose className="h-4 w-4 text-teal-300 shrink-0" />
                <span className="truncate font-medium">Collapse Sidebar</span>
              </>
            )}
          </button>
        )}
        {isExpanded ? (
          <div className="flex items-center justify-between text-[11px] text-white/50 px-2 pt-0.5">
            <span>Ahlain ERP v1.0</span>
            <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-mono font-semibold text-emerald-300">
              ACTIVE
            </span>
          </div>
        ) : (
          <div className="hidden lg:flex justify-center py-0.5">
            <span
              className="h-2 w-2 rounded-full bg-emerald-400"
              title="System Active"
            />
          </div>
        )}
      </div>
    </aside>
  );
}
