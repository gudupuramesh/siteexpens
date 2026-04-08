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
