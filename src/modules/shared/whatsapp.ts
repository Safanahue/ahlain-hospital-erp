/** Builds a wa.me deep link with a prefilled message (no API integration). */
export function waLink(
  phone: string | null | undefined,
  message: string,
): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  const withCountryCode = !digits
    ? ""
    : digits.length === 10
      ? `91${digits}`
      : digits;
  return `https://wa.me/${withCountryCode}?text=${encodeURIComponent(message)}`;
}
