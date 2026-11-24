"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Bell, LogOut, PanelLeft, Search, User as UserIcon } from "lucide-react";
import type { Role } from "@prisma/client";
import { getPageMeta } from "@/modules/shared/nav";
import { ROLE_LABELS } from "@/modules/auth/roles";
import { cn } from "@/lib/utils";
import PatientAutocomplete, { type PatientSearchResult } from "@/modules/patients/components/PatientAutocomplete";

export default function Header({
  user,
  collapsed = false,
  onToggleSidebar,
}: {
  user: { name: string; email: string; role: Role };
  collapsed?: boolean;
  onToggleSidebar?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const meta = getPageMeta(pathname);
  const [query, setQuery] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const displayName = user.name;

  const roleLabel = ROLE_LABELS[user.role] ?? user.role;
  const initial = displayName ? displayName.charAt(0).toUpperCase() : "U";

  function handleSearch(event: React.FormEvent) {
    event.preventDefault();
    const q = query.trim();
    router.push(
      q ? `/billing/invoices?q=${encodeURIComponent(q)}` : "/billing/invoices",
    );
  }

  return (
    <header
      className={cn(
        "no-print fixed right-0 top-0 z-30 flex h-16 items-center justify-between border-b border-line bg-white px-4 sm:px-6 shadow-2xs transition-[left] duration-200 ease-in-out left-0",
        collapsed ? "lg:left-[72px]" : "lg:left-64",
      )}
    >
      {/* Page Title & Breadcrumbs */}
      <div className="flex items-center gap-3 min-w-0 pr-4">
        {onToggleSidebar ? (
          <button
            type="button"
            onClick={onToggleSidebar}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-navy transition-colors shrink-0"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
        ) : null}
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold leading-tight tracking-tight text-navy">
            {meta.title}
          </h1>
          <nav aria-label="Breadcrumb" className="truncate mt-0.5">
            <ol className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {meta.breadcrumbs.map((crumb, i) => (
                <li key={i} className="flex items-center gap-1.5">
                  {i > 0 ? (
                    <span className="text-slate-300" aria-hidden>
                      /
                    </span>
                  ) : null}
                  {crumb.href ? (
                    <Link
                      href={crumb.href}
                      className="hover:text-medical transition-colors"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="font-medium text-slate-700">
                      {crumb.label}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        </div>
      </div>

      {/* Right Controls: Search, Notification, User Profile */}
      <div className="flex items-center gap-4 shrink-0">
        {/* Global Patient Live Search Bar */}
        <div className="relative hidden sm:block w-64 md:w-80">
          <PatientAutocomplete
            placeholder="Search patient by name, UHID, phone…"
            showDetailsCard={false}
            onSelect={(patient) => {
              if (patient) {
                router.push(`/patients/${patient.id}`);
              }
            }}
            onNavigateOnSelect={(patient) => {
              router.push(`/patients/${patient.id}`);
            }}
            inputClassName="py-1.5 bg-slate-50/80 focus:bg-white"
          />
        </div>

        {/* Notifications Icon Button */}
        <div className="relative">
          <button
            type="button"
            aria-label="Notifications"
            aria-expanded={notificationsOpen}
            onClick={() => setNotificationsOpen((v) => !v)}
            className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-navy transition-colors"
          >
            <Bell className="h-4 w-4" aria-hidden />
            <span
              className="absolute right-2 top-2 h-2 w-2 rounded-full bg-teal ring-2 ring-white"
              aria-hidden
            />
          </button>
          {notificationsOpen ? (
            <div className="card absolute top-11 right-0 w-72 p-4 shadow-lg border border-slate-200 animate-in fade-in zoom-in-95 duration-100">
              <div className="flex items-center justify-between border-b pb-2 mb-2">
                <p className="text-xs font-bold text-navy uppercase tracking-wider">
                  Notifications
                </p>
                <span className="text-[10px] text-muted-foreground">0 New</span>
              </div>
              <p className="text-xs text-muted-foreground text-center py-4">
                No unread hospital notifications.
              </p>
            </div>
          ) : null}
        </div>

        {/* User Info & Avatar */}
        <div className="flex items-center gap-3 border-l border-slate-200 pl-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy text-white text-xs font-bold shadow-xs">
            {initial}
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-xs font-bold leading-tight text-navy">
              {displayName}
            </p>
            <span className="inline-block mt-0.5 rounded bg-teal/10 px-1.5 py-0.2 text-[10px] font-semibold text-teal-800">
              {roleLabel}
            </span>
          </div>

          {/* Logout Action */}
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            title="Sign out"
            aria-label="Sign out"
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-danger transition-colors ml-1"
          >
            <LogOut className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </header>
  );
}
