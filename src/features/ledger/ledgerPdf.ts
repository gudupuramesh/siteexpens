import { db } from '@/src/lib/firebase';
import { generateAndShareWebPdf } from '@/src/features/projects/reports/generatePdf';
import type { Project } from '@/src/features/projects/types';
import {
  getCategoryLabel,
  getPaymentMethodLabel,
  isTransactionCountedInTotals,
  normalizeTransactionType,
  type Transaction,
  type TransactionCategory,
  type PaymentMethod,
} from '@/src/features/transactions/types';

export type LedgerReportInput = {
  orgId: string;
  transactions: Transaction[];
  projectsById: Record<string, Pick<Project, 'id' | 'name'>>;
  /** uid → display name lookup for the Creator column. */
  memberNames?: Record<string, string>;
  dateFrom?: Date | null;
  dateTo?: Date | null;
  /** Human label shown in the Projects meta cell ("All Projects" or "3 selected" etc.). */
  projectsLabel?: string;
  /** Active filter labels rendered in the meta strip. Empty entries hidden. */
  appliedFilters?: {
    type?: string;
    category?: string;
    paymentMethod?: string;
    party?: string;
  };
};

type OrgInfo = { name: string; gstin?: string };

function esc(s: string | undefined | null): string {
  if (s == null || s === '') return '—';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtInr(n: number): string {
  return `₹${n.toLocaleString('en-IN')}`;
}

function fmtDate(ts: { toDate: () => Date } | null | undefined): string {
  if (!ts) return '—';
  return ts
    .toDate()
    .toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDateRaw(d: Date): string {
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
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

type SummaryBucket = {
  key: string;
  label: string;
  entries: number;
  inTotal: number;
  outTotal: number;
};

function buildBuckets(
  txns: Transaction[],
  keyFn: (t: Transaction) => { key: string; label: string },
): SummaryBucket[] {
  const map = new Map<string, SummaryBucket>();
  for (const t of txns) {
    const k = keyFn(t);
    const dir = normalizeTransactionType(t.type);
    const ex = map.get(k.key);
    if (ex) {
      ex.entries += 1;
      if (dir === 'payment_in') ex.inTotal += t.amount;
      else ex.outTotal += t.amount;
    } else {
      map.set(k.key, {
        key: k.key,
        label: k.label,
        entries: 1,
        inTotal: dir === 'payment_in' ? t.amount : 0,
        outTotal: dir === 'payment_out' ? t.amount : 0,
      });
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => b.inTotal + b.outTotal - (a.inTotal + a.outTotal),
  );
}

function senderReceiver(
  t: Transaction,
  companyName: string,
): { sender: string; receiver: string } {
  const dir = normalizeTransactionType(t.type);
  if (dir === 'payment_in') {
    return { sender: t.partyName || '—', receiver: companyName };
  }
  return { sender: companyName, receiver: t.partyName || '—' };
}

function buildHtml(input: LedgerReportInput & { org: OrgInfo }): string {
  const {
    transactions,
    org,
    projectsById,
    memberNames = {},
    dateFrom,
    dateTo,
    projectsLabel = 'All Projects',
    appliedFilters = {},
  } = input;

  const posted = transactions.filter(isTransactionCountedInTotals);

  // Newest-first for ledger reading; running balance computed oldest-first below.
  const sortedDesc = [...posted].sort((a, b) => {
    const at = a.date ? a.date.toMillis() : 0;
    const bt = b.date ? b.date.toMillis() : 0;
    return bt - at;
  });

  let income = 0;
  let expense = 0;
  for (const t of posted) {
    if (normalizeTransactionType(t.type) === 'payment_in') income += t.amount;
    else expense += t.amount;
  }
  const balance = income - expense;

  const today = fmtDateRaw(new Date());
  const periodStr =
    dateFrom && dateTo
      ? `${fmtDateRaw(dateFrom)} — ${fmtDateRaw(dateTo)}`
      : dateFrom
        ? `From ${fmtDateRaw(dateFrom)}`
        : dateTo
          ? `Up to ${fmtDateRaw(dateTo)}`
          : 'All Time';

  const txnRows = sortedDesc
    .map((t) => {
      const dir = normalizeTransactionType(t.type);
      const { sender, receiver } = senderReceiver(t, org.name);
      const amtStr =
        dir === 'payment_in'
          ? `<span class="amt in">+${fmtInr(t.amount)}</span>`
          : `<span class="amt out">−${fmtInr(t.amount)}</span>`;
      const creator = memberNames[t.createdBy] || 'Team';
      const projName = projectsById[t.projectId]?.name ?? '—';
      const cat = t.category ? getCategoryLabel(t.category as TransactionCategory) : '—';
      const meth = t.paymentMethod
        ? getPaymentMethodLabel(t.paymentMethod as PaymentMethod)
        : '—';
      return `
      <tr>
        <td>${fmtDate(t.date)}</td>
        <td>${esc(projName)}</td>
        <td>${esc(sender)}</td>
        <td>${esc(receiver)}</td>
        <td>${esc(cat)}</td>
        <td>${esc(meth)}</td>
        <td class="desc">${esc(t.description)}</td>
        <td>${esc(creator)}</td>
        <td class="num">${amtStr}</td>
      </tr>`;
    })
    .join('');

  const byProject = buildBuckets(posted, (t) => ({
    key: t.projectId,
    label: projectsById[t.projectId]?.name ?? 'Unknown Project',
  }));
  const byCategory = buildBuckets(posted, (t) => ({
    key: t.category ?? '__none__',
    label: t.category ? getCategoryLabel(t.category as TransactionCategory) : 'Uncategorised',
  }));
  const byMethod = buildBuckets(posted, (t) => ({
    key: t.paymentMethod ?? '__none__',
    label: t.paymentMethod
      ? getPaymentMethodLabel(t.paymentMethod as PaymentMethod)
      : 'Unspecified',
  }));

  const sumRows = (rows: SummaryBucket[]): string =>
    rows
      .map(
        (r) => `
      <tr>
        <td>${esc(r.label)}</td>
        <td class="num">${r.entries}</td>
        <td class="num amt in">${r.inTotal ? fmtInr(r.inTotal) : '—'}</td>
        <td class="num amt out">${r.outTotal ? fmtInr(r.outTotal) : '—'}</td>
      </tr>`,
      )
      .join('');

  const projTotalIn = byProject.reduce((s, r) => s + r.inTotal, 0);
  const projTotalOut = byProject.reduce((s, r) => s + r.outTotal, 0);
  const catTotalIn = byCategory.reduce((s, r) => s + r.inTotal, 0);
  const catTotalOut = byCategory.reduce((s, r) => s + r.outTotal, 0);
  const methTotalIn = byMethod.reduce((s, r) => s + r.inTotal, 0);
  const methTotalOut = byMethod.reduce((s, r) => s + r.outTotal, 0);

  const emptyRow = (cols: number, msg: string) => `
    <tr><td colspan="${cols}" class="empty">${msg}</td></tr>`;

  const filterChips = [
    appliedFilters.type ? { lab: 'Type', val: appliedFilters.type } : null,
    appliedFilters.category ? { lab: 'Category', val: appliedFilters.category } : null,
    appliedFilters.paymentMethod ? { lab: 'Method', val: appliedFilters.paymentMethod } : null,
    appliedFilters.party ? { lab: 'Party', val: appliedFilters.party } : null,
  ].filter((x): x is { lab: string; val: string } => x !== null);

  const filterChipsHtml = filterChips.length
    ? `<div class="chips">${filterChips
        .map(
          (c) =>
            `<span class="chip"><span class="chip-lab">${esc(c.lab)}</span> ${esc(c.val)}</span>`,
        )
        .join('')}</div>`
    : '';

  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8" />
<style>
@page{size:A4 landscape;margin:12mm 10mm}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:10px;color:#111827;line-height:1.45}

.hdr{display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:14px;margin-bottom:14px;border-bottom:3px solid #111827}
.hdr-left .co{font-size:18px;font-weight:800;color:#111827;letter-spacing:-0.4px}
.hdr-left .gst{font-size:9px;color:#6b7280;margin-top:3px;letter-spacing:0.2px}
.hdr-right{text-align:right}
.hdr-right .rpt{font-size:15px;font-weight:700;color:#111827;letter-spacing:-0.2px}
.hdr-right .gen{font-size:9px;color:#6b7280;margin-top:3px}

.meta-strip{display:flex;gap:18px;padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;margin-bottom:10px}
.meta-strip .item{flex:1}
.meta-strip .lab{font-size:8px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:2px}
.meta-strip .val{font-size:11px;font-weight:600;color:#111827}

.chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px}
.chip{display:inline-block;padding:3px 8px;border-radius:10px;background:#eef2ff;border:1px solid #c7d2fe;font-size:9px;color:#3730a3}
.chip-lab{font-weight:700;text-transform:uppercase;letter-spacing:0.4px;margin-right:4px;color:#4338ca}

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
td{font-size:9.5px;padding:7px 8px;border-bottom:1px solid #f3f4f6;color:#374151;vertical-align:middle}
tbody tr:last-child td{border-bottom:1px solid #d1d5db}
td.desc{max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#6b7280}
.num{text-align:right;font-variant-numeric:tabular-nums}
.empty{text-align:center;color:#9ca3af;padding:14px;font-style:italic;font-size:10px}
.amt{font-weight:600}
.amt.in{color:#059669}
.amt.out{color:#dc2626}

.total-row td{font-weight:800;background:#f9fafb;color:#111827;border-top:2px solid #d1d5db;border-bottom:none}
.txn-table thead{display:table-header-group}
.txn-table tr{page-break-inside:avoid}

.footer{margin-top:24px;padding-top:10px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;font-size:8px;color:#9ca3af}
</style>
</head><body>

<div class="hdr">
  <div class="hdr-left">
    <div class="co">${esc(org.name)}</div>
    ${org.gstin ? `<div class="gst">GSTIN: ${esc(org.gstin)}</div>` : ''}
  </div>
  <div class="hdr-right">
    <div class="rpt">Ledger Report</div>
    <div class="gen">Generated ${today}</div>
  </div>
</div>

<div class="meta-strip">
  <div class="item">
    <div class="lab">Period</div>
    <div class="val">${esc(periodStr)}</div>
  </div>
  <div class="item">
    <div class="lab">Projects</div>
    <div class="val">${esc(projectsLabel)}</div>
  </div>
  <div class="item">
    <div class="lab">Entries</div>
    <div class="val">${posted.length}</div>
  </div>
</div>

${filterChipsHtml}

<div class="totals">
  <div class="tcell in"><div class="v">+${fmtInr(income)}</div><div class="l">Total In</div></div>
  <div class="tcell out"><div class="v">−${fmtInr(expense)}</div><div class="l">Total Out</div></div>
  <div class="tcell bal"><div class="v">${balance < 0 ? '−' : ''}${fmtInr(Math.abs(balance))}</div><div class="l">Balance</div></div>
</div>

<div class="section">
  <div class="section-hdr">
    <span class="section-title">Transactions</span>
    <span class="section-cnt">${posted.length}</span>
  </div>
  <table class="txn-table">
    <thead><tr>
      <th>Date</th>
      <th>Project</th>
      <th>Sender</th>
      <th>Receiver</th>
      <th>Category</th>
      <th>Method</th>
      <th>Description</th>
      <th>Creator</th>
      <th class="num">Amount</th>
    </tr></thead>
    <tbody>${posted.length ? txnRows : emptyRow(9, 'No transactions match the selected filters')}</tbody>
  </table>
</div>

<div class="section">
  <div class="section-hdr">
    <span class="section-title">Summary by Project</span>
    <span class="section-cnt">${byProject.length}</span>
  </div>
  <table>
    <thead><tr><th>Project</th><th class="num">Entries</th><th class="num">In</th><th class="num">Out</th></tr></thead>
    <tbody>
      ${byProject.length ? sumRows(byProject) : emptyRow(4, 'No data')}
      ${byProject.length ? `<tr class="total-row"><td>Total</td><td class="num">${posted.length}</td><td class="num amt in">${fmtInr(projTotalIn)}</td><td class="num amt out">${fmtInr(projTotalOut)}</td></tr>` : ''}
    </tbody>
  </table>
</div>

<div class="section">
  <div class="section-hdr">
    <span class="section-title">Summary by Category</span>
    <span class="section-cnt">${byCategory.length}</span>
  </div>
  <table>
    <thead><tr><th>Category</th><th class="num">Entries</th><th class="num">In</th><th class="num">Out</th></tr></thead>
    <tbody>
      ${byCategory.length ? sumRows(byCategory) : emptyRow(4, 'No data')}
      ${byCategory.length ? `<tr class="total-row"><td>Total</td><td class="num">${posted.length}</td><td class="num amt in">${fmtInr(catTotalIn)}</td><td class="num amt out">${fmtInr(catTotalOut)}</td></tr>` : ''}
    </tbody>
  </table>
</div>

<div class="section">
  <div class="section-hdr">
    <span class="section-title">Summary by Payment Method</span>
    <span class="section-cnt">${byMethod.length}</span>
  </div>
  <table>
    <thead><tr><th>Method</th><th class="num">Entries</th><th class="num">In</th><th class="num">Out</th></tr></thead>
    <tbody>
      ${byMethod.length ? sumRows(byMethod) : emptyRow(4, 'No data')}
      ${byMethod.length ? `<tr class="total-row"><td>Total</td><td class="num">${posted.length}</td><td class="num amt in">${fmtInr(methTotalIn)}</td><td class="num amt out">${fmtInr(methTotalOut)}</td></tr>` : ''}
    </tbody>
  </table>
</div>

<div class="footer">
  <div>${esc(org.name)} · Studio Ledger</div>
  <div>Ledger Report · ${today}</div>
</div>

</body></html>`;
}

export async function generateLedgerReport(input: LedgerReportInput): Promise<void> {
  const org = await getOrgInfo(input.orgId);
  const html = buildHtml({ ...input, org });
  const periodTag =
    input.dateFrom && input.dateTo
      ? `${fmtDateRaw(input.dateFrom)} to ${fmtDateRaw(input.dateTo)}`
      : 'All Time';
  const filename = `Ledger - ${org.name} - ${periodTag}`;
  await generateAndShareWebPdf({
    html,
    filename,
    dialogTitle: `Share ${filename}`,
  });
}
