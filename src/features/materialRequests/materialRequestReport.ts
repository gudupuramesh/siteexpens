/**
 * Material Request PDF — shop share version (NO prices).
 * Follows the laminateReport.ts pattern.
 */
import { db } from '@/src/lib/firebase';
import type { Project } from '@/src/features/projects/types';
import type { MaterialRequest } from './types';

function esc(str: string | undefined | null): string {
  if (!str) return '—';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function getOrgName(orgId: string): Promise<string> {
  try {
    const snap = await db.collection('organizations').doc(orgId).get();
    return snap.data()?.name || 'Company';
  } catch {
    return 'Company';
  }
}

function buildHtml(request: MaterialRequest, project: Project, companyName: string): string {
  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const dateStr = request.createdAt
    ? request.createdAt.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : today;

  const rows = request.items
    .map(
      (item, idx) => `<tr>
        <td class="center">${idx + 1}</td>
        <td><strong>${esc(item.name)}</strong></td>
        <td>${esc(item.brand)}</td>
        <td>${esc([item.variety, item.make].filter(Boolean).join(' / '))}</td>
        <td>${esc(item.size)}</td>
        <td class="center">${item.quantity}</td>
        <td class="center">${esc(item.unit)}</td>
      </tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"/>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:11px;color:#1a1a1a;padding:24px;line-height:1.5}

.hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #2563eb;padding-bottom:10px;margin-bottom:14px}
.co{font-size:16px;font-weight:700;color:#2563eb}
.subtitle{font-size:12px;font-weight:600;color:#374151;margin-top:2px}
.date{font-size:9px;color:#6b7280;text-align:right}

.info{margin-bottom:14px}
.ir{display:flex;margin-bottom:2px}
.il{font-size:10px;color:#6b7280;width:90px}
.iv{font-size:10px;color:#1a1a1a;font-weight:500}

table{width:100%;border-collapse:collapse;border:1px solid #e2e8f0;margin-bottom:12px}
th{background:#f8fafc;font-size:9px;font-weight:700;text-transform:uppercase;color:#6b7280;padding:6px 8px;text-align:left;border-bottom:1px solid #e2e8f0}
td{font-size:10px;padding:6px 8px;border-bottom:1px solid #f1f5f9;color:#374151}
tr:last-child td{border-bottom:none}
.center{text-align:center}

.total-row{text-align:right;font-size:11px;font-weight:700;color:#374151;padding:8px 0}
.footer{margin-top:16px;padding-top:8px;border-top:1px solid #e2e8f0;text-align:center;font-size:8px;color:#9ca3af}
.note{font-size:9px;color:#6b7280;margin-top:8px;font-style:italic}
</style>
</head><body>

<div class="hdr">
  <div>
    <div class="co">${esc(companyName)}</div>
    <div class="subtitle">Material Request — ${esc(request.title || 'Purchase Order')}</div>
  </div>
  <div class="date">Date: ${dateStr}</div>
</div>

<div class="info">
  <div class="ir"><span class="il">Project</span><span class="iv">${esc(project.name)}</span></div>
  <div class="ir"><span class="il">Site Address</span><span class="iv">${esc(project.siteAddress)}</span></div>
</div>

<table>
  <thead><tr>
    <th style="width:30px">#</th>
    <th>Material</th>
    <th>Brand</th>
    <th>Variety / Make</th>
    <th>Size</th>
    <th style="width:50px">Qty</th>
    <th style="width:40px">Unit</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>

<div class="total-row">Total Items: ${request.items.length}</div>

<div class="note">This is a material list only. Prices are not included.</div>

<div class="footer">${esc(companyName)} · ${esc(project.name)} · ${today}</div>

</body></html>`;
}

export async function generateShopSharePdf(
  request: MaterialRequest,
  project: Project,
): Promise<void> {
  const Print = await import('expo-print');
  const Sharing = await import('expo-sharing');

  const companyName = await getOrgName(project.orgId);
  const html = buildHtml(request, project, companyName);
  const { uri } = await Print.printToFileAsync({ html });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: `Material List - ${request.title || project.name}`,
      UTI: 'com.adobe.pdf',
    });
  }
}
