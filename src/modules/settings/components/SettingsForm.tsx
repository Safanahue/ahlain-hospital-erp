"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";

type Settings = {
  hospitalName: string;
  address: string;
  upiId: string;
  upiQrImageUrl: string;
  receiptFooter: string;
  termsText: string;
  logoImageUrl: string;
  tagline: string;
  phone: string;
  email: string;
  website: string;
  gstin: string;
  signatureImageUrl: string;
};

export default function SettingsForm({ settings }: { settings: Settings }) {
  const router = useRouter();
  const [form, setForm] = useState(settings);
  const [qrUrl, setQrUrl] = useState(settings.upiQrImageUrl);
  const [logoUrl, setLogoUrl] = useState(settings.logoImageUrl);
  const [signatureUrl, setSignatureUrl] = useState(settings.signatureImageUrl);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(
    null,
  );
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function handleUpload(file: File | null) {
    if (!file) return;
    setUploading(true);
    setMessage(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/settings/upload-qr", {
        method: "POST",
        body,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage({ kind: "error", text: data.error ?? "Upload failed" });
        return;
      }
      setQrUrl(data.url);
      setMessage({ kind: "ok", text: "QR image uploaded — save settings to apply." });
    } catch {
      setMessage({ kind: "error", text: "Upload failed" });
    } finally {
      setUploading(false);
    }
  }

  async function handleLogoUpload(file: File | null) {
    if (!file) return;
    setUploading(true);
    setMessage(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/settings/upload-logo", {
        method: "POST",
        body,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage({ kind: "error", text: data.error ?? "Logo upload failed" });
        return;
      }
      setLogoUrl(data.url);
      setMessage({ kind: "ok", text: "Logo uploaded — save settings to apply." });
    } catch {
      setMessage({ kind: "error", text: "Logo upload failed" });
    } finally {
      setUploading(false);
    }
  }

  async function handleSignatureUpload(file: File | null) {
    if (!file) return;
    setUploading(true);
    setMessage(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/settings/upload-signature", {
        method: "POST",
        body,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage({ kind: "error", text: data.error ?? "Signature upload failed" });
        return;
      }
      setSignatureUrl(data.url);
      setMessage({ kind: "ok", text: "Signature uploaded — save settings to apply." });
    } catch {
      setMessage({ kind: "error", text: "Signature upload failed" });
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/settings/hospital", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          upiQrImageUrl: qrUrl,
          logoImageUrl: logoUrl,
          signatureImageUrl: signatureUrl,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const firstIssue = data.details
          ? Object.values(data.details).flat()[0]
          : null;
        setMessage({
          kind: "error",
          text: (firstIssue as string) ?? data.error ?? "Save failed",
        });
        return;
      }
      setMessage({ kind: "ok", text: "Settings saved." });
      router.refresh();
    } catch {
      setMessage({ kind: "error", text: "Network error" });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4" noValidate>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="hospitalName" className="field-label">
            Hospital name
          </label>
          <input
            id="hospitalName"
            value={form.hospitalName}
            onChange={(e) => setForm({ ...form, hospitalName: e.target.value })}
            required
            className="input w-full"
          />
        </div>
        <div>
          <label htmlFor="tagline" className="field-label">
            Tagline
          </label>
          <input
            id="tagline"
            value={form.tagline}
            onChange={(e) => setForm({ ...form, tagline: e.target.value })}
            placeholder="New Horizons, Better Health."
            className="input w-full"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="address" className="field-label">
            Address
          </label>
          <textarea
            id="address"
            rows={4}
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            className="textarea"
          />
          <p className="field-help">Printed top-right; line breaks are preserved.</p>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="phone" className="field-label">
                Phone
              </label>
              <input
                id="phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="input w-full"
              />
            </div>
            <div>
              <label htmlFor="email" className="field-label">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="input w-full"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="website" className="field-label">
                Website
              </label>
              <input
                id="website"
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
                className="input w-full"
              />
            </div>
            <div>
              <label htmlFor="gstin" className="field-label">
                GSTIN (optional)
              </label>
              <input
                id="gstin"
                value={form.gstin}
                onChange={(e) => setForm({ ...form, gstin: e.target.value })}
                className="input w-full font-mono"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="upiId" className="field-label">
            UPI ID
          </label>
          <input
            id="upiId"
            value={form.upiId}
            onChange={(e) => setForm({ ...form, upiId: e.target.value })}
            required
            placeholder="ahlainhospital@upi"
            className="input w-full font-mono"
          />
        </div>
        <div>
          <p className="field-label">Contact details</p>
          <p className="text-xs text-muted-foreground">
            Phone, email and website appear in the document header exactly as
            entered. Leave a field blank to hide it — nothing is filled in
            automatically.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-line bg-page p-4">
        <p className="mb-2 text-sm font-medium text-navy">Hospital logo</p>
        <div className="flex items-start gap-4">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt="Hospital logo"
              className="h-[72px] w-auto max-w-[200px] rounded-md border border-line bg-white object-contain p-1"
            />
          ) : (
            <div className="flex h-[72px] w-[120px] items-center justify-center rounded-md border border-dashed border-line bg-white text-xs text-muted-foreground">
              No logo
            </div>
          )}
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              Printed on payment receipts, invoices, laboratory reports and discharge
              summaries. Leave unset to use the built-in hospital mark.
            </p>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-line bg-white px-3 py-2 text-sm font-medium text-navy hover:bg-page">
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Upload className="h-4 w-4" aria-hidden />
              )}
              {logoUrl ? "Replace logo" : "Upload logo"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={(e) => handleLogoUpload(e.target.files?.[0] ?? null)}
              />
            </label>
            <p className="text-xs text-muted-foreground">PNG, JPEG or WebP · up to 2 MB</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-line bg-page p-4">
        <p className="mb-2 text-sm font-medium text-navy">Authorised signature</p>
        <div className="flex items-start gap-4">
          {signatureUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={signatureUrl}
              alt="Authorised signature"
              className="h-[56px] w-auto max-w-[180px] rounded-md border border-line bg-white object-contain p-1"
            />
          ) : (
            <div className="flex h-[56px] w-[120px] items-center justify-center rounded-md border border-dashed border-line bg-white text-xs text-muted-foreground">
              No signature
            </div>
          )}
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              Printed above “Authorised signatory” on invoices and receipts when
              provided.
            </p>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-line bg-white px-3 py-2 text-sm font-medium text-navy hover:bg-page">
              <Upload className="h-4 w-4" aria-hidden />
              {signatureUrl ? "Replace signature" : "Upload signature"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={(e) => handleSignatureUpload(e.target.files?.[0] ?? null)}
              />
            </label>
            <p className="text-xs text-muted-foreground">PNG, JPEG or WebP · up to 2 MB</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="receiptFooter" className="field-label">
            Receipt footer
          </label>
          <textarea
            id="receiptFooter"
            rows={3}
            maxLength={300}
            value={form.receiptFooter}
            onChange={(e) => setForm({ ...form, receiptFooter: e.target.value })}
            placeholder="Leave blank for the standard computer-generated receipt line."
            className="textarea"
          />
          <p className="field-help">
            Printed at the bottom of every payment receipt. {form.receiptFooter.length}/300
          </p>
        </div>
        <div>
          <label htmlFor="termsText" className="field-label">
            Invoice terms &amp; conditions
          </label>
          <textarea
            id="termsText"
            rows={3}
            maxLength={500}
            value={form.termsText}
            onChange={(e) => setForm({ ...form, termsText: e.target.value })}
            placeholder="Leave blank to print no terms block."
            className="textarea"
          />
          <p className="field-help">
            Printed under the totals on the printable invoice. {form.termsText.length}/500
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-line bg-page p-4">
        <p className="mb-2 text-sm font-medium text-navy">
          Static UPI QR code
        </p>
        <div className="flex items-start gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrUrl}
            alt="Hospital UPI QR code"
            width={120}
            height={120}
            className="h-[120px] w-[120px] rounded-md border border-line bg-white"
          />
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              One QR for the whole hospital — it is never generated per invoice.
            </p>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-line bg-white px-3 py-2 text-sm font-medium text-navy hover:bg-page">
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Upload className="h-4 w-4" aria-hidden />
              )}
              Replace QR image
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={(e) => handleUpload(e.target.files?.[0] ?? null)}
              />
            </label>
            <p className="font-mono text-xs text-muted-foreground">{qrUrl}</p>
          </div>
        </div>
      </div>

      {message ? (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={`rounded-md px-3 py-2 text-sm ${
            message.kind === "error"
              ? "bg-danger-bg text-danger"
              : "bg-success-bg text-success"
          }`}
        >
          {message.text}
        </p>
      ) : null}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="btn btn-primary"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Save settings
        </button>
      </div>
    </form>
  );
}
