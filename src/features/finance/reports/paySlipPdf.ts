/**
 * Per-staff Pay Slip PDF — generated from the Payroll tab.
 *
 * One staff, one month. The slip mirrors the salary entry that was
 * (or will be) posted to `orgFinances` — same numbers, formatted
 * for sharing with the staff member.
 *
 * Reuses `generateAndShareWebPdf()`. No new deps.
 */
import { db } from '@/src/lib/firebase';
import { generateAndShareWebPdf } from '@/src/features/projects/reports/generatePdf';
import {
  WORKING_DAYS_PER_MONTH,
  type Staff,
} from '@/src/features/staff/types';

export type PaySlipInput = {
  orgId: string;
  staff: Staff;
  /** YYYY-MM month key (matches `staff.lastPayrollMonth`). */
  monthKey: string;
  /** Human label for the month — e.g. "May 2026". */
  monthLabel: string;
  presentDays: number;
  halfDays: number;
  absentDays: number;
  /** Net amount payable (computed by `computePayroll`). Same value
   *  that is/was posted to orgFinances. */
  netAmount: number;
  /** True if the matching orgFinances entry has been posted. Just
   *  drives the badge in the slip ("PAID" vs "PROVISIONAL"). */
  posted: boolean;
};

type OrgInfo = { name: string; gstin?: string; addressLine1?: string };

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

async function getOrgInfo(orgId: string): Promise<OrgInfo> {
  try {
    const snap = await db.collection('organizations').doc(orgId).get();
    const d = snap.data();
    return {
      name: (d?.name as string) || 'Studio',
      gstin: typeof d?.gstin === 'string' ? d.gstin : undefined,
      addressLine1: typeof d?.addressLine1 === 'string' ? d.addressLine1 : undefined,
    };
  } catch {
    return { name: 'Studio' };
  }
}

function buildHtml(input: PaySlipInput & { org: OrgInfo }): string {
  const { org, staff, monthLabel, presentDays, halfDays, absentDays, netAmount, posted } = input;

  const today = fmtDateRaw(new Date());
  const earnedDays = presentDays + halfDays * 0.5;
  const dailyRate = staff.monthlySalary / WORKING_DAYS_PER_MONTH;
  const grossEarned = Math.round(earnedDays * dailyRate);
  const dayRateFmt = fmtInr(dailyRate);
  const monthlyFmt = fmtInr(staff.monthlySalary);

  const payModelLabel =
    staff.payUnit === 'month'
      ? `Monthly · ${monthlyFmt}/mo (pro-rated by attendance)`
      : `Per-day · ${dayRateFmt}/day (${monthlyFmt} ÷ ${WORKING_DAYS_PER_MONTH} working days)`;

  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8" />
<style>
@page{margin:14mm 12mm}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:10.5px;color:#111827;line-height:1.5}

.hdr{display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:14px;margin-bottom:18px;border-bottom:3px solid #111827}
.hdr-left .co{font-size:18px;font-weight:800;color:#111827;letter-spacing:-0.4px}
.hdr-left .gst{font-size:9px;color:#6b7280;margin-top:3px;letter-spacing:0.2px}
.hdr-left .addr{font-size:9px;color:#6b7280;margin-top:2px}
.hdr-right{text-align:right}
.hdr-right .rpt{font-size:15px;font-weight:700;color:#111827;letter-spacing:-0.2px}
.hdr-right .gen{font-size:9px;color:#6b7280;margin-top:3px}
.hdr-right .pill{display:inline-block;margin-top:4px;padding:2px 8px;border-radius:8px;font-size:9px;font-weight:800;letter-spacing:0.6px}
.pill.paid{background:#ecfdf5;color:#059669;border:1px solid #a7f3d0}
.pill.prov{background:#fef3c7;color:#b45309;border:1px solid #fcd34d}

.meta-strip{display:flex;gap:24px;padding:12px 14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;margin-bottom:18px}
.meta-strip .item{flex:1}
.meta-strip .lab{font-size:8px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:3px}
.meta-strip .val{font-size:12px;font-weight:600;color:#111827}

.section{margin-bottom:14px}
.section-hdr{display:flex;justify-content:space-between;align-items:center;padding:7px 0;margin-bottom:6px;border-bottom:2px solid #111827}
.section-title{font-size:12px;font-weight:700;color:#111827;letter-spacing:-0.1px}

table{width:100%;border-collapse:collapse}
th{background:#f9fafb;font-size:8px;font-weight:700;text-transform:uppercase;color:#6b7280;letter-spacing:0.5px;padding:7px 10px;text-align:left;border-bottom:1px solid #d1d5db}
td{font-size:11px;padding:9px 10px;border-bottom:1px solid #f3f4f6;color:#374151;vertical-align:middle}
tbody tr:last-child td{border-bottom:1px solid #d1d5db}
.num{text-align:right;font-variant-numeric:tabular-nums}

.total-row td{font-weight:800;background:#f9fafb;color:#111827;border-top:2px solid #d1d5db;padding:11px 10px}
.net-row td{font-weight:800;background:#ecfdf5;color:#059669;font-size:13px;padding:12px 10px}

.notes{font-size:9px;color:#6b7280;margin-top:8px;padding:0 2px}

.signature{margin-top:36px;display:flex;justify-content:flex-end}
.sigbox{width:200px;text-align:center}
.sigline{border-top:1px solid #111827;padding-top:6px;font-size:10px;font-weight:600;color:#111827}
.sigsub{font-size:9px;color:#6b7280;margin-top:2px}

.footer{margin-top:24px;padding-top:10px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;font-size:8px;color:#9ca3af}
</style>
</head><body>

<div class="hdr">
  <div class="hdr-left">
    <div class="co">${esc(org.name)}</div>
    ${org.gstin ? `<div class="gst">GSTIN: ${esc(org.gstin)}</div>` : ''}
    ${org.addressLine1 ? `<div class="addr">${esc(org.addressLine1)}</div>` : ''}
  </div>
  <div class="hdr-right">
    <div class="rpt">Pay Slip</div>
    <div class="gen">Generated ${today}</div>
    <div class="pill ${posted ? 'paid' : 'prov'}">${posted ? 'PAID' : 'PROVISIONAL'}</div>
  </div>
</div>

<div class="meta-strip">
  <div class="item">
    <div class="lab">Employee</div>
    <div class="val">${esc(staff.name)}</div>
  </div>
  <div class="item">
    <div class="lab">Designation</div>
    <div class="val">${esc(staff.role || 'Staff')}</div>
  </div>
  <div class="item">
    <div class="lab">Pay Period</div>
    <div class="val">${esc(monthLabel)}</div>
  </div>
</div>

<div class="section">
  <div class="section-hdr">
    <span class="section-title">Attendance Summary</span>
  </div>
  <table>
    <thead>
      <tr>
        <th>Bucket</th>
        <th class="num">Days</th>
        <th class="num">Weight</th>
        <th class="num">Earned Days</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Present (full)</td>
        <td class="num">${presentDays}</td>
        <td class="num">×1.0</td>
        <td class="num">${presentDays.toFixed(1)}</td>
      </tr>
      <tr>
        <td>Half day</td>
        <td class="num">${halfDays}</td>
        <td class="num">×0.5</td>
        <td class="num">${(halfDays * 0.5).toFixed(1)}</td>
      </tr>
      <tr>
        <td>Absent</td>
        <td class="num">${absentDays}</td>
        <td class="num">×0.0</td>
        <td class="num">0.0</td>
      </tr>
      <tr class="total-row">
        <td>Total earned days</td>
        <td class="num">${presentDays + halfDays + absentDays}</td>
        <td class="num">—</td>
        <td class="num">${earnedDays.toFixed(1)}</td>
      </tr>
    </tbody>
  </table>
</div>

<div class="section">
  <div class="section-hdr">
    <span class="section-title">Salary Calculation</span>
  </div>
  <table>
    <tbody>
      <tr>
        <td>Pay model</td>
        <td class="num">${esc(payModelLabel)}</td>
      </tr>
      <tr>
        <td>Standard working days</td>
        <td class="num">${WORKING_DAYS_PER_MONTH}</td>
      </tr>
      <tr>
        <td>Daily rate</td>
        <td class="num">${dayRateFmt}</td>
      </tr>
      <tr>
        <td>Earned days</td>
        <td class="num">${earnedDays.toFixed(1)}</td>
      </tr>
      <tr>
        <td>Gross earned (rate × days)</td>
        <td class="num">${fmtInr(grossEarned)}</td>
      </tr>
      <tr class="net-row">
        <td>Net Payable</td>
        <td class="num">${fmtInr(netAmount)}</td>
      </tr>
    </tbody>
  </table>
  <div class="notes">
    Net payable is computed as <b>monthly salary × earned days ÷ ${WORKING_DAYS_PER_MONTH}</b>
    and rounded to the nearest rupee. Half-days count as 0.5 days. No statutory deductions
    (PF, ESI, TDS) are calculated by this slip — apply them separately if required.
  </div>
</div>

<div class="signature">
  <div class="sigbox">
    <div class="sigline">Authorised Signatory</div>
    <div class="sigsub">${esc(org.name)}</div>
  </div>
</div>

<div class="footer">
  <div>${esc(org.name)} · Pay Slip</div>
  <div>${esc(staff.name)} · ${esc(monthLabel)}</div>
</div>

</body></html>`;
}

export async function generatePaySlip(input: PaySlipInput): Promise<void> {
  const org = await getOrgInfo(input.orgId);
  const html = buildHtml({ ...input, org });
  const filename = `Pay Slip - ${input.staff.name} - ${input.monthLabel}`;
  await generateAndShareWebPdf({
    html,
    filename,
    dialogTitle: `Share ${filename}`,
  });
}
