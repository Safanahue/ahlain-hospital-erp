/**
 * Brand asset resolution.
 *
 * Uploads live in `public/uploads` and are written at runtime — on a host with
 * an ephemeral or read-only filesystem (Render) those files are not shipped
 * with the build, so a stored `/uploads/...` path renders as a broken image.
 * Bundled assets in `public/brand` are always available.
 *
 * Every customer-facing surface (login, sidebar, invoices, receipts, lab
 * reports, payment QR) goes through these helpers so a stored upload path can
 * never produce a broken image.
 */

export const BRAND_LOGO_PATH = "/brand/ahlain-logo.png";
export const BRAND_UPI_QR_PATH = "/brand/upi-qr.png";

/**
 * Returns the stored URL when it is servable, otherwise the bundled fallback.
 * `fallback` of "" means "hide the element" instead of showing a broken image.
 */
export function resolveBrandAsset(
  url: string | null | undefined,
  fallback: string,
): string {
  const value = (url ?? "").trim();
  if (!value) return fallback;
  if (value.startsWith("/uploads/")) return fallback;
  return value;
}

/** Hospital logo: stored upload → bundled brand logo. */
export function resolveLogoUrl(url: string | null | undefined): string {
  return resolveBrandAsset(url, BRAND_LOGO_PATH);
}

/** UPI QR: stored upload → bundled brand QR. */
export function resolveUpiQrUrl(url: string | null | undefined): string {
  return resolveBrandAsset(url, BRAND_UPI_QR_PATH);
}

/** Signature: no bundled default, so an unservable upload is simply hidden. */
export function resolveSignatureUrl(url: string | null | undefined): string {
  return resolveBrandAsset(url, "");
}
