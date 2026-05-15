/**
 * INR formatters — DESIGN.md §2.8.
 *
 * Indian numbering convention (lakh / crore shorthand) for compact
 * displays, and `en-IN` comma grouping for full hero amounts.
 */

/**
 * Compact INR for row metas and metric tiles.
 *  ≥ 1 cr   → ₹X.XX Cr (trim trailing zeros)
 *  ≥ 1 lakh → ₹X.X L
 *  ≥ 1k     → ₹X.Xk
 *  < 1k     → ₹845 (en-IN comma grouping)
 *
 * Examples: 18_40_000 → "₹18.4 L", 1_55_00_000 → "₹1.55 Cr",
 *           84_500 → "₹84.5k", 845 → "₹845"
 */
export function inrCompact(value: number): string {
  if (!Number.isFinite(value)) return '₹0';
  const n = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (n >= 1_00_00_000) {
    // crores — 2 decimals, trim trailing zeros (e.g. "1.50 Cr" → "1.5 Cr")
    const cr = (n / 1_00_00_000).toFixed(2).replace(/\.?0+$/, '');
    return `${sign}₹${cr} Cr`;
  }
  if (n >= 1_00_000) {
    const lakh = (n / 1_00_000).toFixed(1).replace(/\.0$/, '');
    return `${sign}₹${lakh} L`;
  }
  if (n >= 1_000) {
    const k = (n / 1_000).toFixed(1).replace(/\.0$/, '');
    return `${sign}₹${k}k`;
  }
  return `${sign}₹${Math.round(n).toLocaleString('en-IN')}`;
}

/**
 * Full INR for hero amounts (transaction detail, budget meter).
 * Uses en-IN locale comma grouping: 1840000 → "₹18,40,000".
 */
export function inrFull(value: number): string {
  if (!Number.isFinite(value)) return '₹0';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(Math.round(value));
  return `${sign}₹${abs.toLocaleString('en-IN')}`;
}
