import { db } from '@/src/lib/firebase';
import { generateAndShareWebPdf } from '@/src/features/projects/reports/generatePdf';
import type { Project } from '@/src/features/projects/types';
import type { Party } from '@/src/features/parties/types';
import {
  getCategoryLabel,
  getPaymentMethodLabel,
  normalizeTransactionType,
  type Transaction,
  type TransactionCategory,
  type PaymentMethod,
} from './types';

export type ReceiptInput = {
  project: Project;
  transaction: Transaction;
  party: Party | null;
  orgId: string;
  /** Display name of who created the transaction. */
  creatorName?: string;
};

type OrgInfo = {
  name: string;
  gstin?: string;
  city?: string;
  state?: string;
  addressLine1?: string;
};

function esc(s: string | undefined | null): string {
  if (s == null || s === '') return '—';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function fmtInr(n: number): string {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(ts: { toDate: () => Date } | null | undefined): string {
  if (!ts) return '—';
  return ts
    .toDate()
    .toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

async function getOrgInfo(orgId: string): Promise<OrgInfo> {
  try {
    const snap = await db.collection('organizations').doc(orgId).get();
    const d = snap.data() ?? {};
    return {
      name: (d.name as string) || 'Company',
      gstin: typeof d.gstin === 'string' ? d.gstin : undefined,
      city: typeof d.city === 'string' ? d.city : undefined,
      state: typeof d.state === 'string' ? d.state : undefined,
      addressLine1: typeof d.addressLine1 === 'string' ? d.addressLine1 : undefined,
    };
  } catch {
    return { name: 'Company' };
  }
}

function buildHtml(input: ReceiptInput & { org: OrgInfo }): string {
  const { project, transaction: t, party, org, creatorName } = input;

  const dir = normalizeTransactionType(t.type);
  const isIn = dir === 'payment_in';

  const receiptTitle = isIn ? 'Payment Receipt' : 'Payment Out Receipt';
  const subjectLine = isIn ? 'Payment In Receipt' : 'Payment Out Receipt';
  const confirmText = isIn
    ? `We confirm receipt of below payment on ${fmtDate(t.date)}.`
    : `We confirm disbursal of below payment on ${fmtDate(t.date)}.`;

  // "To" section: payer for in (we received from them); payee for out (we paid them).
  const toName = t.partyName || party?.name || '—';
  // Party type doesn't carry a GST field today; PAN is the closest tax ID.
  const toTaxId = party?.panNumber ? `PAN: ${party.panNumber}` : 'GSTIN: NA';
  const toAddress = party?.address && party.address.trim().length > 0 ? party.address : null;
  const toPhone = party?.phone && party.phone.trim().length > 0 ? party.phone : null;

  const orgAddressBits = [org.addressLine1, org.city, org.state].filter(
    (s) => typeof s === 'string' && s.trim().length > 0,
  );
  const orgAddress = orgAddressBits.length ? orgAddressBits.join(', ') : null;

  const method = t.paymentMethod
    ? getPaymentMethodLabel(t.paymentMethod as PaymentMethod)
    : '—';
  const category = t.category
    ? getCategoryLabel(t.category as TransactionCategory)
    : null;

  const today = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8" />
<style>
@page{margin:16mm 14mm}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;color:#111827;line-height:1.55}

/* ── Header ─────────────────────────────── */
.hdr{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:14px;margin-bottom:24px;border-bottom:1px solid #d1d5db}
.hdr-left .co{font-size:18px;font-weight:800;color:#111827;letter-spacing:-0.4px}
.hdr-left .co-sub{font-size:9.5px;color:#6b7280;margin-top:3px;letter-spacing:0.2px}
.hdr-right{text-align:right}
.hdr-right .rpt{font-size:18px;font-weight:800;color:#111827;letter-spacing:-0.3px}
.hdr-right .meta{font-size:10px;color:#6b7280;margin-top:6px}
.hdr-right .meta .lab{font-weight:700;color:#374151}

/* ── Address blocks ─────────────────────── */
.blocks{display:flex;gap:24px;margin-bottom:18px}
.block{flex:1}
.block .lab{font-size:9px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:4px}
.block .name{font-size:12px;font-weight:700;color:#111827}
.block .sub{font-size:10px;color:#6b7280;margin-top:2px;line-height:1.4}

/* ── Subject + greeting ─────────────────── */
.subject-block{margin-bottom:18px}
.subject-block .lab{font-size:9px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:3px}
.subject-block .val{font-size:12px;font-weight:700;color:#111827}
.greeting{font-size:11px;color:#374151;margin-bottom:4px}
.confirm{font-size:11px;color:#374151;margin-bottom:14px}

/* ── Details table (key/value) ──────────── */
.details{width:100%;border-collapse:collapse;border:1px solid #e5e7eb;margin-bottom:14px}
.details td{padding:10px 14px;border-bottom:1px solid #f3f4f6;vertical-align:top}
.details tr:last-child td{border-bottom:none}
.details .k{width:30%;font-size:10px;color:#6b7280;font-weight:600;background:#fafafa;border-right:1px solid #f3f4f6}
.details .v{font-size:11px;color:#111827;font-weight:500;text-align:right}
.details .v.amt-in{color:#059669;font-weight:800;font-size:13px}
.details .v.amt-out{color:#dc2626;font-weight:800;font-size:13px}
.details .v.attach{text-align:right}
.details .v.attach img{max-width:140px;max-height:140px;border-radius:6px;border:1px solid #e5e7eb}

/* ── Closing ────────────────────────────── */
.closing{font-size:10px;color:#6b7280;margin-top:18px;margin-bottom:48px;line-height:1.5}

.signature{display:flex;justify-content:flex-end;margin-top:40px}
.signature .sig{text-align:center;min-width:160px}
.signature .sig-line{border-top:1px solid #111827;padding-top:5px}
.signature .sig-name{font-size:10px;font-weight:700;color:#111827}

.footer{margin-top:36px;padding-top:10px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;font-size:8.5px;color:#9ca3af}
</style>
</head><body>

<div class="hdr">
  <div class="hdr-left">
    <div class="co">${esc(org.name)}</div>
    ${org.gstin ? `<div class="co-sub">GSTIN: ${esc(org.gstin)}</div>` : ''}
    ${orgAddress ? `<div class="co-sub">${esc(orgAddress)}</div>` : ''}
  </div>
  <div class="hdr-right">
    <div class="rpt">${receiptTitle}</div>
    <div class="meta"><span class="lab">Receipt #:</span> ${esc(t.id.slice(-8).toUpperCase())}</div>
    <div class="meta"><span class="lab">Date:</span> ${fmtDate(t.date)}</div>
  </div>
</div>

<div class="blocks">
  <div class="block">
    <div class="lab">Project</div>
    <div class="name">${esc(project.name)}</div>
    ${project.siteAddress ? `<div class="sub">${esc(project.siteAddress)}</div>` : ''}
  </div>
  <div class="block">
    <div class="lab">${isIn ? 'From' : 'To'}</div>
    <div class="name">${esc(toName)}</div>
    <div class="sub">${esc(toTaxId)}</div>
    ${toPhone ? `<div class="sub">${esc(toPhone)}</div>` : ''}
    ${toAddress ? `<div class="sub">${esc(toAddress)}</div>` : ''}
  </div>
</div>

<div class="subject-block">
  <div class="lab">Subject</div>
  <div class="val">${subjectLine}</div>
</div>

<div class="greeting">Dear Sir/Madam,</div>
<div class="confirm">${confirmText}</div>

<table class="details">
  <tr>
    <td class="k">Amount</td>
    <td class="v ${isIn ? 'amt-in' : 'amt-out'}">${isIn ? '+' : '−'} ${fmtInr(t.amount)}</td>
  </tr>
  <tr>
    <td class="k">Payment Date</td>
    <td class="v">${fmtDate(t.date)}</td>
  </tr>
  <tr>
    <td class="k">Payment Method</td>
    <td class="v">${esc(method)}</td>
  </tr>
  ${category ? `
  <tr>
    <td class="k">Category</td>
    <td class="v">${esc(category)}</td>
  </tr>` : ''}
  ${t.referenceNumber ? `
  <tr>
    <td class="k">Reference No.</td>
    <td class="v">${esc(t.referenceNumber)}</td>
  </tr>` : ''}
  ${t.description ? `
  <tr>
    <td class="k">Description</td>
    <td class="v">${esc(t.description)}</td>
  </tr>` : ''}
  ${creatorName ? `
  <tr>
    <td class="k">Recorded By</td>
    <td class="v">${esc(creatorName)}</td>
  </tr>` : ''}
  ${t.photoUrl ? `
  <tr>
    <td class="k">Attachment</td>
    <td class="v attach"><img src="${esc(t.photoUrl)}" alt="Attachment" /></td>
  </tr>` : ''}
</table>

<div class="closing">${
    isIn
      ? 'Thank you for your payment. Please contact us for any clarifications.'
      : 'Thank you for your services. Please contact us for any clarifications.'
  }</div>

<div class="signature">
  <div class="sig">
    <div class="sig-line"></div>
    <div class="sig-name">Authorised Signatory</div>
  </div>
</div>

<div class="footer">
  <div>${esc(org.name)} · ${esc(project.name)}</div>
  <div>${receiptTitle} · Generated ${today}</div>
</div>

</body></html>`;
}

export async function generateTransactionReceipt(input: ReceiptInput): Promise<void> {
  const org = await getOrgInfo(input.orgId);
  const html = buildHtml({ ...input, org });
  const dir = normalizeTransactionType(input.transaction.type);
  const titleWord = dir === 'payment_in' ? 'Receipt' : 'Out-Receipt';
  const filename = `Payment ${titleWord} - ${input.transaction.partyName || 'Party'} - ${input.transaction.id.slice(-6)}`;
  await generateAndShareWebPdf({
    html,
    filename,
    dialogTitle: `Share ${filename}`,
  });
}
