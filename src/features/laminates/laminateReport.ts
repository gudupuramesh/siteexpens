/**
 * Laminate Report PDF Generator.
 * Converts local images to base64 for embedding, uses compact table layout.
 */
import * as FileSystem from 'expo-file-system';
import { db } from '@/src/lib/firebase';
import type { Project } from '@/src/features/projects/types';
import type { Party } from '@/src/features/parties/types';
import type { Laminate, RoomLaminates } from './types';

type ReportInput = {
  project: Project;
  rooms: RoomLaminates[];
  parties: Party[];
  orgName?: string;
};

function esc(str: string | undefined | null): string {
  if (!str) return '—';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtDate(ts: { toDate: () => Date } | null | undefined): string {
  if (!ts) return '—';
  return ts.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtInr(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return '—';
  return `₹${amount.toLocaleString('en-IN')}`;
}

async function getOrgName(orgId: string): Promise<string> {
  try {
    const snap = await db.collection('organizations').doc(orgId).get();
    return snap.data()?.name || 'Company';
  } catch {
    return 'Company';
  }
}

/** Convert a local file:// or content:// URI to a data:image/jpeg;base64,... string */
async function toBase64(uri: string | undefined): Promise<string | null> {
  if (!uri) return null;
  try {
    // Remote http(s) URLs — use as-is (expo-print can fetch them)
    if (uri.startsWith('http://') || uri.startsWith('https://')) return uri;
    // Local file — read as base64
    const b64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
    return `data:image/jpeg;base64,${b64}`;
  } catch {
    return null;
  }
}

/** Pre-process all laminate images to base64 */
async function resolveImages(rooms: RoomLaminates[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const tasks: Promise<void>[] = [];
  for (const room of rooms) {
    for (const lam of room.laminates) {
      if (lam.photoUrl) {
        tasks.push(
          toBase64(lam.photoUrl).then((b64) => {
            if (b64) map.set(lam.id, b64);
          }),
        );
      }
    }
  }
  await Promise.all(tasks);
  return map;
}

function buildHtml(
  input: ReportInput & { companyName: string },
  imageMap: Map<string, string>,
): string {
  const { project, rooms, companyName, parties } = input;
  const clientParty = parties.find((p) => p.partyType === 'client' || p.role === 'client');

  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  let totalLaminates = 0;
  rooms.forEach((r) => { totalLaminates += r.laminates.length; });

  const roomsHtml = rooms.map((room) => {
    const rows = room.laminates.map((lam, idx) => {
      const imgSrc = imageMap.get(lam.id);
      const photoCell = imgSrc
        ? `<td class="photo-cell"><img src="${imgSrc}" class="thumb" /></td>`
        : `<td class="photo-cell"><div class="no-photo">—</div></td>`;

      return `<tr>
        <td class="center">${idx + 1}</td>
        ${photoCell}
        <td><strong>${esc(lam.brand)}</strong>${lam.laminateCode ? `<br/><span class="code">${esc(lam.laminateCode)}</span>` : ''}</td>
        <td>${esc(lam.finish)}</td>
        <td>${esc(lam.edgeBandCode)}</td>
        <td class="notes">${esc(lam.notes)}</td>
      </tr>`;
    }).join('');

    return `
    <div class="room-block">
      <div class="room-hdr">
        <span>🏠 <strong>${esc(room.roomName)}</strong></span>
        <span class="room-cnt">${room.laminates.length}</span>
      </div>
      <table>
        <thead><tr>
          <th class="w30">#</th>
          <th class="w55">Photo</th>
          <th>Brand / Code</th>
          <th>Finish</th>
          <th>Edge Band</th>
          <th>Notes</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"/>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:10px;color:#1a1a1a;padding:20px;line-height:1.4}

.hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #2563eb;padding-bottom:10px;margin-bottom:12px}
.co{font-size:16px;font-weight:700;color:#2563eb}
.subtitle{font-size:12px;font-weight:600;color:#374151;margin-top:1px}
.date{font-size:9px;color:#6b7280;text-align:right}

.info-grid{display:flex;gap:12px;margin-bottom:12px}
.info-box{flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;padding:8px 10px}
.info-title{font-size:8px;font-weight:700;color:#2563eb;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px}
.ir{display:flex;margin-bottom:1px}
.il{font-size:9px;color:#6b7280;width:80px;flex-shrink:0}
.iv{font-size:9px;color:#1a1a1a;font-weight:500}

.sbar{display:flex;gap:8px;margin-bottom:12px}
.sc{flex:1;text-align:center;background:#eff6ff;border:1px solid #bfdbfe;border-radius:4px;padding:5px}
.sv{font-size:14px;font-weight:700;color:#2563eb}
.sl{font-size:8px;color:#6b7280;text-transform:uppercase}

.room-block{margin-bottom:10px;page-break-inside:avoid}
.room-hdr{background:#f1f5f9;border:1px solid #e2e8f0;border-bottom:none;border-radius:4px 4px 0 0;padding:4px 8px;display:flex;justify-content:space-between;align-items:center;font-size:11px}
.room-cnt{background:#dbeafe;color:#2563eb;font-size:9px;font-weight:700;padding:1px 6px;border-radius:8px}

table{width:100%;border-collapse:collapse;border:1px solid #e2e8f0}
th{background:#f8fafc;font-size:8px;font-weight:700;text-transform:uppercase;color:#6b7280;padding:4px 6px;text-align:left;border-bottom:1px solid #e2e8f0}
td{font-size:9px;padding:4px 6px;border-bottom:1px solid #f1f5f9;color:#374151;vertical-align:middle}
tr:last-child td{border-bottom:none}
.w30{width:24px}
.w55{width:50px}
.center{text-align:center}
.code{color:#2563eb;font-weight:600;font-size:8px}
.notes{font-size:8px;color:#6b7280;max-width:100px}
.photo-cell{padding:3px}
.thumb{width:44px;height:44px;object-fit:cover;border-radius:3px;border:1px solid #e2e8f0;display:block}
.no-photo{width:44px;height:44px;background:#f1f5f9;border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:8px;color:#ccc;text-align:center;line-height:44px}

.footer{margin-top:16px;padding-top:8px;border-top:1px solid #e2e8f0;text-align:center;font-size:8px;color:#9ca3af}
</style>
</head><body>

<div class="hdr">
  <div><div class="co">${esc(companyName)}</div><div class="subtitle">Laminate Selection Report</div></div>
  <div class="date">Generated: ${today}</div>
</div>

<div class="info-grid">
  <div class="info-box">
    <div class="info-title">Project Details</div>
    <div class="ir"><span class="il">Project</span><span class="iv">${esc(project.name)}</span></div>
    <div class="ir"><span class="il">Address</span><span class="iv">${esc(project.siteAddress)}</span></div>
    <div class="ir"><span class="il">Value</span><span class="iv">${fmtInr(project.value)}</span></div>
    <div class="ir"><span class="il">Start</span><span class="iv">${fmtDate(project.startDate)}</span></div>
    <div class="ir"><span class="il">End</span><span class="iv">${fmtDate(project.endDate)}</span></div>
    <div class="ir"><span class="il">Status</span><span class="iv">${esc(project.status?.charAt(0).toUpperCase() + project.status?.slice(1))}</span></div>
  </div>
  <div class="info-box">
    <div class="info-title">Client Details</div>
    ${clientParty ? `
      <div class="ir"><span class="il">Name</span><span class="iv">${esc(clientParty.name)}</span></div>
      <div class="ir"><span class="il">Phone</span><span class="iv">${esc(clientParty.phone)}</span></div>
      ${clientParty.email ? `<div class="ir"><span class="il">Email</span><span class="iv">${esc(clientParty.email)}</span></div>` : ''}
      ${clientParty.address ? `<div class="ir"><span class="il">Address</span><span class="iv">${esc(clientParty.address)}</span></div>` : ''}
    ` : `<div class="ir"><span class="iv" style="color:#9ca3af">No client assigned</span></div>`}
  </div>
</div>

<div class="sbar">
  <div class="sc"><div class="sv">${rooms.length}</div><div class="sl">Rooms</div></div>
  <div class="sc"><div class="sv">${totalLaminates}</div><div class="sl">Laminates</div></div>
  <div class="sc"><div class="sv">${new Set(rooms.flatMap((r) => r.laminates.map((l) => l.brand))).size}</div><div class="sl">Brands</div></div>
</div>

${roomsHtml}

<div class="footer">${esc(companyName)} · Laminate Selection Report · ${esc(project.name)} · ${today}</div>

</body></html>`;
}

export async function generateLaminateReport(input: ReportInput): Promise<void> {
  const Print = await import('expo-print');
  const Sharing = await import('expo-sharing');

  const [companyName, imageMap] = await Promise.all([
    getOrgName(input.project.orgId),
    resolveImages(input.rooms),
  ]);

  const html = buildHtml({ ...input, companyName }, imageMap);
  const { uri } = await Print.printToFileAsync({ html });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: `Laminate Report - ${input.project.name}`,
      UTI: 'com.adobe.pdf',
    });
  }
}
