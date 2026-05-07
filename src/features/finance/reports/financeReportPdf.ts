/**
 * Studio Finance Report PDF — generated from the Dashboard tab.
 *
 * Inputs are computed by the caller from the same hooks the Dashboard
 * uses (useProjectTotals + useOrgFinances) so the PDF and the on-screen
 * KPIs always agree to the rupee.
 *
 * Mirrors the visual language of `transactionReportPdf.ts` /
 * `ledgerPdf.ts` — bordered header, meta strip, totals tile, hairline
 * tables, mono numerics. No new deps.
 */
import { db } from '@/src/lib/firebase';
import { generateAndShareWebPdf } from '@/src/features/projects/reports/generatePdf';
import {
  ORG_FINANCE_CATEGORIES,
  type OrgFinanceCategory,
} from '@/src/features/finances/types';

export type FinanceReportInput = {
  orgId: string;
  /** Human label for the period — e.g. "May 2026" or "Q2 2026". */
  periodLabel: string;
  dateFrom: Date;
  dateTo: Date;
  /** All numbers in INR. Caller computes these from the same hooks
   *  the Dashboard tab uses, scoped to the period. */
  totals: {
    income: number;
    projectExpense: number;
    officeExpense: number;
    salariesPaid: number;
    officeIncome: number;
    profit: number;
  };
  /** Office-expense breakdown by category, sorted by amount desc. */
  breakdown: Array<{ cat: OrgFinanceCategory; amount: number; pct: number }>;
};

type OrgInfo = { name: string; gstin?: string };

function esc(s: string | undefined | null): string {
  if (s == null || s === '') return '—';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtInr(n: number): string {
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

function fmtDateRaw(d: Date): string {
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function categoryLabel(c: OrgFinanceCategory): string {
  return ORG_FINANCE_CATEGORIES.find((x) => x.key === c)?.label ?? c;
}

async function getOrgInfo(orgId: string): Promise<OrgInfo> {
  try {
    const snap = await db.collection('organizations').doc(orgId).get();
    const d = snap.data();
    return {
      name: (d?.name as string) || 'Studio',
      gstin: typeof d?.gstin === 'string' ? d.gstin : undefined,
    };
  } catch {
    return { name: 'Studio' };
  }
}

function buildHtml(input: FinanceReportInput & { org: OrgInfo }): string {
  const { org, periodLabel, dateFrom, dateTo, totals, breakdown } = input;

  const today = fmtDateRaw(new Date());
  const dateRange = `${fmtDateRaw(dateFrom)} — ${fmtDateRaw(dateTo)}`;

  const totalIncome = totals.income + totals.officeIncome;
  const totalExpense = totals.projectExpense + totals.officeExpense;

  // Breakdown rows + totals
  const breakdownRows = breakdown
    .map(
      (r) => `
      <tr>
        <td>${esc(categoryLabel(r.cat))}</td>
        <td class="num pct">${r.pct.toFixed(1)}%</td>
        <td class="num amt out">${fmtInr(r.amount)}</td>
      </tr>`,
    )
    .join('');

  const breakdownEmpty = `
    <tr><td colspan="3" class="empty">No office expenses in this period</td></tr>`;

  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8" />
<style>
@page{margin:14mm 12mm}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:10px;color:#111827;line-height:1.45}

.hdr{display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:14px;margin-bottom:18px;border-bottom:3px solid #111827}
.hdr-left .co{font-size:18px;font-weight:800;color:#111827;letter-spacing:-0.4px}
.hdr-left .gst{font-size:9px;color:#6b7280;margin-top:3px;letter-spacing:0.2px}
.hdr-right{text-align:right}
.hdr-right .rpt{font-size:15px;font-weight:700;color:#111827;letter-spacing:-0.2px}
.hdr-right .gen{font-size:9px;color:#6b7280;margin-top:3px}

.meta-strip{display:flex;gap:24px;padding:10px 12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;margin-bottom:14px}
.meta-strip .item{flex:1}
.meta-strip .lab{font-size:8px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:2px}
.meta-strip .val{font-size:11px;font-weight:600;color:#111827}

.totals{display:flex;gap:10px;margin-bottom:18px}
.tcell{flex:1;text-align:center;padding:14px 10px;border-radius:8px;border:1px solid transparent}
.tcell.in{background:#ecfdf5;border-color:#a7f3d0}
.tcell.out{background:#fef2f2;border-color:#fecaca}
.tcell.bal{background:#eff6ff;border-color:#bfdbfe}
.tcell .v{font-size:17px;font-weight:800;letter-spacing:-0.3px;font-variant-numeric:tabular-nums}
.tcell.in .v{color:#059669}
.tcell.out .v{color:#dc2626}
.tcell.bal .v{color:#2563eb}
.tcell .l{font-size:8px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.6px;margin-top:5px}

.section{margin-bottom:14px;page-break-inside:auto}
.section-hdr{display:flex;justify-content:space-between;align-items:center;padding:7px 0;margin-bottom:6px;border-bottom:2px solid #111827}
.section-title{font-size:12px;font-weight:700;color:#111827;letter-spacing:-0.1px}
.section-cnt{background:#111827;color:#fff;font-size:9px;font-weight:700;padding:2px 8px;border-radius:10px;font-variant-numeric:tabular-nums}

table{width:100%;border-collapse:collapse}
th{background:#f9fafb;font-size:8px;font-weight:700;text-transform:uppercase;color:#6b7280;letter-spacing:0.5px;padding:7px 8px;text-align:left;border-bottom:1px solid #d1d5db}
td{font-size:10px;padding:8px 8px;border-bottom:1px solid #f3f4f6;color:#374151;vertical-align:middle}
tbody tr:last-child td{border-bottom:1px solid #d1d5db}
.num{text-align:right;font-variant-numeric:tabular-nums}
.pct{color:#6b7280;width:60px}
.empty{text-align:center;color:#9ca3af;padding:14px;font-style:italic;font-size:10px}
.amt{font-weight:600}
.amt.in{color:#059669}
.amt.out{color:#dc2626}

.split-card{display:flex;gap:10px;margin-bottom:14px}
.split-cell{flex:1;padding:12px 14px;background:#fafafa;border:1px solid #e5e7eb;border-radius:8px}
.split-lab{font-size:8px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:4px}
.split-val{font-size:14px;font-weight:700;color:#111827;font-variant-numeric:tabular-nums;letter-spacing:-0.2px}
.split-foot{font-size:8.5px;color:#9ca3af;margin-top:2px}

.footer{margin-top:24px;padding-top:10px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;font-size:8px;color:#9ca3af}
</style>
</head><body>

<div class="hdr">
  <div class="hdr-left">
    <div class="co">${esc(org.name)}</div>
    ${org.gstin ? `<div class="gst">GSTIN: ${esc(org.gstin)}</div>` : ''}
  </div>
  <div class="hdr-right">
    <div class="rpt">Finance Report</div>
    <div class="gen">Generated ${today}</div>
  </div>
</div>

<div class="meta-strip">
  <div class="item">
    <div class="lab">Period</div>
    <div class="val">${esc(periodLabel)}</div>
  </div>
  <div class="item">
    <div class="lab">Date Range</div>
    <div class="val">${esc(dateRange)}</div>
  </div>
</div>

<div class="totals">
  <div class="tcell in"><div class="v">+${fmtInr(totalIncome)}</div><div class="l">Total Income</div></div>
  <div class="tcell out"><div class="v">−${fmtInr(totalExpense)}</div><div class="l">Total Expenses</div></div>
  <div class="tcell bal"><div class="v">${totals.profit < 0 ? '−' : ''}${fmtInr(Math.abs(totals.profit))}</div><div class="l">Net Profit</div></div>
</div>

<div class="split-card">
  <div class="split-cell">
    <div class="split-lab">Project Income</div>
    <div class="split-val" style="color:#059669">+${fmtInr(totals.income)}</div>
    <div class="split-foot">From project transactions</div>
  </div>
  <div class="split-cell">
    <div class="split-lab">Project Expense</div>
    <div class="split-val" style="color:#dc2626">−${fmtInr(totals.projectExpense)}</div>
    <div class="split-foot">From project transactions</div>
  </div>
  <div class="split-cell">
    <div class="split-lab">Office Expense</div>
    <div class="split-val" style="color:#dc2626">−${fmtInr(totals.officeExpense)}</div>
    <div class="split-foot">Studio overhead</div>
  </div>
  <div class="split-cell">
    <div class="split-lab">Salaries Paid</div>
    <div class="split-val">${fmtInr(totals.salariesPaid)}</div>
    <div class="split-foot">Included in office expense</div>
  </div>
</div>

<div class="section">
  <div class="section-hdr">
    <span class="section-title">Office Expense by Category</span>
    <span class="section-cnt">${breakdown.length}</span>
  </div>
  <table>
    <thead>
      <tr>
        <th>Category</th>
        <th class="num pct">% Share</th>
        <th class="num">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${breakdown.length ? breakdownRows : breakdownEmpty}
      ${
        breakdown.length
          ? `<tr><td><b>Total</b></td><td class="num pct">100%</td><td class="num amt out"><b>${fmtInr(totals.officeExpense)}</b></td></tr>`
          : ''
      }
    </tbody>
  </table>
</div>

${
  totals.officeIncome > 0
    ? `
<div class="section">
  <div class="section-hdr">
    <span class="section-title">Office Income</span>
  </div>
  <table>
    <tbody>
      <tr>
        <td>Logged office income</td>
        <td class="num amt in">+${fmtInr(totals.officeIncome)}</td>
      </tr>
    </tbody>
  </table>
</div>`
    : ''
}

<div class="footer">
  <div>${esc(org.name)} · Studio Finance</div>
  <div>Finance Report · ${today}</div>
</div>

</body></html>`;
}

export async function generateFinanceReport(input: FinanceReportInput): Promise<void> {
  const org = await getOrgInfo(input.orgId);
  const html = buildHtml({ ...input, org });
  const filename = `Finance Report - ${org.name} - ${input.periodLabel}`;
  await generateAndShareWebPdf({
    html,
    filename,
    dialogTitle: `Share ${filename}`,
  });
}
