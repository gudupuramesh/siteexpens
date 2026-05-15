/**
 * Shared formatters. Kept framework-agnostic so both screens and tests
 * can import without pulling in React Native.
 */

/** Format an amount in whole rupees as "₹12,34,500" (Indian digit grouping). */
export function formatInr(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return '—';
  return `₹${amount.toLocaleString('en-IN')}`;
}

/** Format a Date as "12 Apr 2026". */
export function formatDate(d: Date | null | undefined): string {
  if (!d) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Format a byte count for display in storage / quota UI.
 *
 * Tiered output, picked so a single string slots cleanly into "X / Y"
 * usage labels without overflowing on small screens:
 *   - >= 10 GB → "12 GB"  (no decimal — already coarse)
 *   - >= 1 GB  → "1.2 GB" (one decimal)
 *   - >= 1 MB  → "640 MB" (rounded)
 *   - <  1 MB  → "512 KB" or "0 B"
 *
 * Guards against `undefined` / `NaN` / negatives — anything non-finite
 * renders as `"0 B"`. This is what fixes the "STORAGE NaN B" bug on
 * orgs whose counter triggers haven't populated `storageBytes` yet.
 */
export function formatBytes(b: number | null | undefined): string {
  if (b == null || !Number.isFinite(b) || b <= 0) return '0 B';
  if (b >= 1024 ** 3) {
    return `${(b / 1024 ** 3).toFixed(b >= 10 * 1024 ** 3 ? 0 : 1)} GB`;
  }
  if (b >= 1024 ** 2) return `${Math.round(b / 1024 ** 2)} MB`;
  if (b >= 1024) return `${Math.round(b / 1024)} KB`;
  return `${Math.round(b)} B`;
}

/** Format a date range as "12 Apr — 30 Jun 2026" or "12 Apr 2026 — TBD". */
export function formatDateRange(start: Date | null, end: Date | null): string {
  if (!start) return '—';
  if (!end) return `${formatDate(start)} — ongoing`;
  const sameYear = start.getFullYear() === end.getFullYear();
  if (sameYear) {
    const startShort = start.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    return `${startShort} — ${formatDate(end)}`;
  }
  return `${formatDate(start)} — ${formatDate(end)}`;
}
