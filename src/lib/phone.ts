/**
 * Phone-number helpers — strict Indian (+91, 10-digit) input + display.
 *
 * Why strict-Indian on the client:
 * - The product onboards Indian SMBs only. Allowing international
 *   numbers makes cross-org member matching unreliable (the same
 *   person can be stored as `9876543210` in one org and
 *   `+15551234567` in another) and clutters the picker.
 * - The Cloud Function `normalizePhoneE164`
 *   (`functions/src/invites.ts:42`) is intentionally MORE permissive
 *   so it can accept legacy + edge-case writes; the rule path is
 *   the same E.164 format. Defence in depth: client rejects early
 *   for instant feedback, server is the source of truth.
 *
 * Both helpers are pure / synchronous / dep-free so they can be
 * called from inside event handlers without async ceremony.
 */

/**
 * Normalize a raw phone string to the strict Indian E.164 form
 * `+91XXXXXXXXXX`. Returns `null` if the input does not look like a
 * valid Indian 10-digit mobile.
 *
 * Accepted shapes (after stripping spaces, parens, dashes):
 *   - 10 digits         → `+91XXXXXXXXXX`
 *   - 11 digits, leading `0` (legacy STD)  → strip `0`, prepend `+91`
 *   - 12 digits, leading `91`              → prepend `+`
 *   - 13 chars, leading `+91` + 10 digits  → return as-is
 *
 * Anything else (US numbers, short codes, alphanumerics, malformed)
 * returns `null` so the caller can surface an inline error.
 */
export function normalizeIndianPhoneE164(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Strip everything that isn't a digit or a leading `+`.
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D+/g, '');
  if (!digits) return null;

  // Already +91-prefixed E.164.
  if (hasPlus && digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`;
  }
  // Bare 10-digit Indian mobile.
  if (!hasPlus && digits.length === 10) {
    return `+91${digits}`;
  }
  // 11-digit with leading 0 (legacy STD-style entry).
  if (!hasPlus && digits.length === 11 && digits.startsWith('0')) {
    return `+91${digits.slice(1)}`;
  }
  // 12-digit starting with 91 but no `+` typed.
  if (!hasPlus && digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`;
  }
  // Anything else — including foreign country codes — is rejected
  // at the client. The server normalizer is more permissive for
  // legacy compat; new writes go through this stricter path.
  return null;
}

/**
 * Format a stored Indian E.164 number for display. Falls back to
 * the input verbatim if it doesn't match the expected shape (so
 * legacy malformed records still render *something* readable).
 *
 * Example: `+919876543210` → `+91 98765 43210`.
 */
export function formatIndianPhone(raw: string | null | undefined): string {
  if (!raw) return '';
  const normalized = normalizeIndianPhoneE164(raw) ?? raw;
  // Match `+91 NNNNN NNNNN` for the strict Indian form.
  const m = /^\+91(\d{5})(\d{5})$/.exec(normalized);
  if (m) return `+91 ${m[1]} ${m[2]}`;
  return normalized;
}
