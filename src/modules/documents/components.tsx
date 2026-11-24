import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { resolveLogoUrl, resolveSignatureUrl } from "@/modules/settings/brand";

/** Settings shape every printed document needs. */
export type DocumentBrandSettings = {
  hospitalName: string;
  tagline?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  gstin?: string | null;
  logoImageUrl?: string | null;
  signatureImageUrl?: string | null;
};

/**
 * Shared A4 hospital header: logo, wordmark + tagline on the left, postal
 * address and contact details on the right, thin teal rule underneath.
 * Nothing here is invented — every value comes from Hospital Settings.
 */
export function HospitalHeader({
  settings,
  title,
  subtitle,
}: {
  settings: DocumentBrandSettings;
  title?: string;
  subtitle?: string;
}) {
  const logoUrl = resolveLogoUrl(settings.logoImageUrl);
  const contact = [settings.phone, settings.email, settings.website]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join("  ·  ");

  return (
    <header className="relative z-10">
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
        <div className="flex min-w-0 items-center gap-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={`${settings.hospitalName} logo`}
              className="h-20 w-auto max-w-[190px] shrink-0 object-contain"
            />
          ) : null}
          <div className="min-w-0">
            <h1 className="text-[21px] font-bold leading-tight tracking-[0.05em] text-[#0b2436]">
              {settings.hospitalName}
            </h1>
            {settings.tagline ? (
              <p className="mt-0.5 text-[11px] italic text-medical">
                {settings.tagline}
              </p>
            ) : null}
            {settings.gstin ? (
              <p className="mt-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
                GSTIN: {settings.gstin}
              </p>
            ) : null}
          </div>
        </div>

        <div className="max-w-[280px] text-right text-[10px] leading-[1.5] text-[#334155]">
          {settings.address ? (
            <p className="whitespace-pre-line">{settings.address}</p>
          ) : null}
          {contact ? <p className="mt-1">☎ {contact}</p> : null}
        </div>
      </div>

      <div className="mt-3 border-b-2 border-medical/70" />

      {title ? (
        <div className="mt-2.5 flex items-center justify-center gap-3">
          <span className="h-px flex-1 bg-line" />
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.24em] text-[#0b2436]">
            {title}
          </p>
          <span className="h-px flex-1 bg-line" />
        </div>
      ) : null}
      {subtitle ? (
        <p className="mt-1 text-center text-[10px] text-muted-foreground">
          {subtitle}
        </p>
      ) : null}
    </header>
  );
}

/** Small label/value rows used for patient and document metadata. */
export function DocumentMeta({
  items,
  columns = 3,
}: {
  items: { label: string; value: ReactNode }[];
  columns?: 2 | 3 | 4;
}) {
  const grid =
    columns === 4
      ? "grid-cols-2 sm:grid-cols-4"
      : columns === 2
        ? "grid-cols-2"
        : "grid-cols-2 sm:grid-cols-3";

  return (
    <dl
      className={cn(
        "relative z-10 grid gap-x-6 gap-y-2.5 border-b border-line py-3 text-[10.5px]",
        grid,
      )}
    >
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-[8.5px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
            {item.label}
          </dt>
          <dd className="mt-0.5 break-words text-[11px] font-semibold text-[#111827]">
            {item.value || "—"}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Very low-opacity logo (or wordmark) watermark behind document content. */
export function DocumentWatermark({
  settings,
}: {
  settings: DocumentBrandSettings;
}) {
  const logoUrl = resolveLogoUrl(settings.logoImageUrl);
  return (
    <div
      aria-hidden
      className="doc-watermark pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden"
    >
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt=""
          className="max-h-[55%] w-[52%] object-contain opacity-[0.04] grayscale"
        />
      ) : (
        <p className="select-none text-center text-[64px] font-bold uppercase tracking-[0.28em] text-[#0b2436] opacity-[0.035]">
          {settings.hospitalName}
        </p>
      )}
    </div>
  );
}

/** A4 sheet wrapper used by every printable document. */
export function DocumentSurface({
  children,
  id = "report-area",
  className,
}: {
  children: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <div
      id={id}
      className={cn(
        "relative mx-auto w-full max-w-[820px] overflow-hidden rounded-xl border border-line bg-white px-9 py-8 print:max-w-none print:rounded-none print:border-0 print:px-0 print:py-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Authorised signature block; uses the uploaded signature image when present. */
export function AuthorisedSignature({
  settings,
  name,
  role = "Authorised signatory",
}: {
  settings: DocumentBrandSettings;
  name?: string | null;
  role?: string;
}) {
  const signatureUrl = resolveSignatureUrl(settings.signatureImageUrl);
  return (
    <div className="relative z-10 w-56 text-center text-[10.5px] text-[#111827]">
      {signatureUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={signatureUrl}
          alt=""
          className="mx-auto mb-1 h-10 w-auto max-w-[150px] object-contain"
        />
      ) : (
        <div className="h-10" />
      )}
      <div className="border-t border-[#94a3b8] pt-1.5">
        <p className="font-semibold">{name ?? ""}</p>
        <p className="text-[9px] text-muted-foreground">{role}</p>
      </div>
    </div>
  );
}
