import type { Metadata } from "next";
import { Suspense } from "react";
import { CheckCircle2, HeartPulse, ShieldCheck, Sparkles } from "lucide-react";
import { getHospitalSettings } from "@/modules/billing/queries";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Sign in – AHLAIN HOSPITAL ERP" };

const HIGHLIGHTS = [
  { icon: HeartPulse, label: "Patient care, OP & IP workflows" },
  { icon: CheckCircle2, label: "Billing, receipts and reconciliation" },
  { icon: ShieldCheck, label: "Role-based hospital staff access" },
];

export default async function LoginPage() {
  const settings = await getHospitalSettings().catch(() => null);
  const hospitalName = settings?.hospitalName?.trim() || "AHLAIN HOSPITAL";
  const tagline =
    settings?.tagline?.trim() || "New Horizons, Better Health.";
  const logo = settings?.logoImageUrl || "/uploads/ahlain-logo.png";
  const addressLines = (settings?.address ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const contact = [settings?.phone, settings?.email]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join("  ·  ");

  return (
    <div className="min-h-screen bg-[#f4f8fb] text-navy">
      <div className="mx-auto grid min-h-screen w-full max-w-[1180px] lg:grid-cols-[1.05fr_minmax(420px,1fr)]">
        {/* Brand panel — hidden on small screens, repeated compactly in the form column */}
        <aside className="relative hidden flex-col overflow-hidden border-r border-[#dbe7f0] bg-white px-10 py-12 lg:flex">
          <div
            className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#e8f5f6]"
            aria-hidden
          />
          <div className="relative my-auto">
            <div className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logo}
                alt={`${hospitalName} logo`}
                className="h-[84px] w-auto max-w-[210px] object-contain"
              />
            </div>
            <h1 className="mt-7 text-[30px] font-bold leading-tight tracking-[0.02em] text-[#0f2a4a]">
              {hospitalName}
            </h1>
            <p className="mt-2 text-[15px] font-medium italic text-medical">
              {tagline}
            </p>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-slate-600">
              Hospital management system for patient records, clinical
              departments, billing and hospital administration.
            </p>

            <ul className="mt-8 space-y-3">
              {HIGHLIGHTS.map((item) => (
                <li
                  key={item.label}
                  className="flex items-center gap-3 text-sm text-slate-700"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#eaf4fb] text-medical">
                    <item.icon className="h-4 w-4" aria-hidden />
                  </span>
                  {item.label}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative mt-10 shrink-0 border-t border-[#e2e7ee] pt-5 text-xs leading-relaxed text-slate-500">
            {addressLines.length > 0 ? (
              <p className="whitespace-pre-line">{addressLines.join("\n")}</p>
            ) : null}
            {contact ? <p className="mt-1.5">{contact}</p> : null}
            <p className="mt-3 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-slate-400">
              <Sparkles className="h-3 w-3" aria-hidden />
              AHLAIN ERP · Hospital Management
            </p>
          </div>
        </aside>

        {/* Form column */}
        <main className="flex flex-col items-center justify-center px-4 py-10 sm:px-8">
          <div className="w-full max-w-[420px]">
            <div className="mb-6 text-center lg:hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logo}
                alt={`${hospitalName} logo`}
                className="mx-auto h-16 w-auto max-w-[180px] object-contain"
              />
              <h1 className="mt-3 text-xl font-bold tracking-wide text-[#0f2a4a]">
                {hospitalName}
              </h1>
              <p className="mt-1 text-sm italic text-medical">{tagline}</p>
            </div>

            <div className="rounded-2xl border border-[#e2e7ee] bg-white p-6 shadow-[0_10px_30px_rgba(15,42,74,0.06)] sm:p-8">
              <h2 className="text-xl font-semibold tracking-tight text-[#0f2a4a]">
                Welcome back
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Sign in with your hospital account to continue.
              </p>

              <div className="mt-6">
                <Suspense
                  fallback={
                    <div className="h-[320px] animate-pulse rounded-lg bg-slate-100" />
                  }
                >
                  <LoginForm />
                </Suspense>
              </div>
            </div>

            <p className="mt-5 text-center text-xs leading-relaxed text-slate-500">
              Need help signing in? Contact the hospital administrator.
              <br />
              Authorised hospital staff only. Activity is logged.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
