import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, KeyRound, ShieldCheck, UserCog } from "lucide-react";
import { getHospitalSettings } from "@/modules/billing/queries";
import { resolveLogoUrl } from "@/modules/settings/brand";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Password help – AHLAIN HOSPITAL ERP",
};

const STEPS = [
  {
    icon: UserCog,
    title: "Contact the hospital administrator",
    body: "Ask the administrator (or your department in-charge) to reset your password from Users & Settings → Reset password.",
  },
  {
    icon: KeyRound,
    title: "Sign in with the temporary password",
    body: "The administrator gives you a one-time temporary password. Enter it on the sign-in page.",
  },
  {
    icon: ShieldCheck,
    title: "Choose your own password",
    body: "You will be asked to set a new password immediately. Nobody at the hospital can see it after that.",
  },
];

export default async function ForgotPasswordPage() {
  const settings = await getHospitalSettings().catch(() => null);
  const hospitalName = settings?.hospitalName?.trim() || "AHLAIN HOSPITAL";
  const logo = resolveLogoUrl(settings?.logoImageUrl);
  const contact = [settings?.phone, settings?.email]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join("  ·  ");

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f8fb] px-4 py-10">
      <div className="w-full max-w-[520px]">
        <div className="mb-6 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logo}
            alt={`${hospitalName} logo`}
            className="mx-auto h-16 w-auto max-w-[180px] object-contain"
          />
          <h1 className="mt-3 text-xl font-bold tracking-wide text-[#0f2a4a]">
            {hospitalName}
          </h1>
          <p className="mt-1 text-sm italic text-medical">
            New Horizons, Better Health.
          </p>
        </div>

        <div className="rounded-2xl border border-[#e2e7ee] bg-white p-6 shadow-[0_10px_30px_rgba(15,42,74,0.06)] sm:p-8">
          <h2 className="text-lg font-semibold tracking-tight text-[#0f2a4a]">
            Forgot your password?
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-500">
            For patient-data security, passwords are reset by the hospital
            administrator — not by email. Follow these steps:
          </p>

          <ol className="mt-5 space-y-4">
            {STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#eaf4fb] text-medical">
                  <step.icon className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-semibold text-[#0f2a4a]">
                    {index + 1}. {step.title}
                  </p>
                  <p className="mt-0.5 text-sm leading-relaxed text-slate-500">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          {contact ? (
            <p className="mt-5 rounded-lg border border-[#e2e7ee] bg-[#f8fafc] px-3 py-2 text-xs text-slate-600">
              Hospital contact: {contact}
            </p>
          ) : null}

          <Link
            href="/login"
            className="btn btn-secondary btn-block mt-6 gap-2"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to sign in
          </Link>
        </div>

        <p className="mt-5 text-center text-xs text-slate-500">
          Authorised hospital staff only. Password resets are recorded in the
          audit log.
        </p>
      </div>
    </div>
  );
}
