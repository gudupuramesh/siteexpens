/**
 * Daily Progress Report — HTML for PDF (expo-print).
 */
export type DprPdfStaffRow = {
  name: string;
  role: string;
  statusLabel: string;
  rateLabel: string;
  estPayLabel: string;
};

export type DprPdfMaterialSection = {
  title: string;
  statusLabel: string;
  totalLabel: string;
  /** Pre-rendered rows: name | qty | rate | line total */
  itemLines: string[];
};

export type DprPdfTaskRow = {
  title: string;
  category: string;
  assignee: string;
  start: string;
  end: string;
  progress: number;
  statusLabel: string;
  /** Trimmed task description; omit empty in caller */
  description?: string;
};

export type DprPdfUpdateRow = {
  author: string;
  taskTitle: string;
  deltaPrefix: string;
  progress: number;
  note: string;
  photoCount: number;
  photoUris: string[];
};

export type DprPdfData = {
  projectName: string;
  projectAddress: string;
  reportDateLabel: string;
  generatedOnLabel: string;
  staffPresent: number;
  staffTotal: number;
  materialRequestedCount: number;
  materialRequestedValueLabel: string;
  workDone: string;
  issues: string;
  tomorrowPlan: string;
  tasks: DprPdfTaskRow[];
  updates: DprPdfUpdateRow[];
  photoUris: string[];
  staffRows?: DprPdfStaffRow[];
  staffEstPayTotalLabel?: string;
  materialSections?: DprPdfMaterialSection[];
};

export function buildDprHtml(d: DprPdfData): string {
  const css = baseCss();
  const staffRowsData = d.staffRows ?? [];
  const materialSectionsData = d.materialSections ?? [];

  const staffTableHtml =
    staffRowsData.length === 0
      ? ''
      : `<section class="section-flow">
    <h2>Staff roster</h2>
    <table class="staff">
      <thead>
        <tr>
          <th>Name</th>
          <th>Role</th>
          <th>Status</th>
          <th class="num">Rate</th>
          <th class="num">Est. pay</th>
        </tr>
      </thead>
      <tbody>${staffRowsData
        .map(
          (s) => `
        <tr>
          <td>${escape(s.name)}</td>
          <td>${escape(s.role)}</td>
          <td><span class="pill-muted">${escape(s.statusLabel)}</span></td>
          <td class="num">${escape(s.rateLabel)}</td>
          <td class="num">${escape(s.estPayLabel)}</td>
        </tr>`,
        )
        .join('')}
      </tbody>
    </table>
    ${
      d.staffEstPayTotalLabel
        ? `<div class="staff-total muted">Estimated payroll (rated rows): ${escape(d.staffEstPayTotalLabel)}</div>`
        : ''
    }
  </section>`;

  const materialBlocksHtml =
    materialSectionsData.length === 0
      ? ''
      : `<section class="section-flow">
    <h2>Material requested (detail)</h2>
    ${materialSectionsData
      .map((m) => {
        const rows =
          m.itemLines.length === 0
            ? `<tr><td colspan="4" class="muted">No line items</td></tr>`
            : m.itemLines
                .map(
                  (line) =>
                    `<tr><td colspan="4" class="mat-line">${escape(line)}</td></tr>`,
                )
                .join('');
        return `<div class="mat-block">
      <div class="mat-head">
        <strong>${escape(m.title)}</strong>
        <span class="pill-muted">${escape(m.statusLabel)}</span>
        <span class="mat-total">${escape(m.totalLabel)}</span>
      </div>
      <table class="mat-items"><tbody>${rows}</tbody></table>
    </div>`;
      })
      .join('')}
  </section>`;

  const taskRows = d.tasks
    .map(
      (t, i) => `
      <tr>
        <td class="idx">${String(i + 1).padStart(2, '0')}</td>
        <td>
          <div class="t-title">${escape(t.title)}</div>
          <div class="t-meta">${escape(t.category)}${t.assignee ? ` &middot; ${escape(t.assignee)}` : ''}</div>
          ${
            t.description?.trim()
              ? `<div class="t-desc">${escape(t.description.trim())}</div>`
              : ''
          }
        </td>
        <td class="t-date">${escape(t.start)}</td>
        <td class="t-date">${escape(t.end)}</td>
        <td class="num">${t.progress}%</td>
        <td><span class="pill-muted">${escape(t.statusLabel)}</span></td>
      </tr>`,
    )
    .join('');

  const updatePhotoGrid = (uris: string[]) =>
    uris.length === 0
      ? ''
      : `<div class="upd-photos">${uris
          .map(
            (uri) =>
              `<div class="upd-photo-cell"><img src="${escapeAttr(uri)}" alt="" /></div>`,
          )
          .join('')}</div>`;

  const updateRows = d.updates
    .map(
      (u) => `
      <div class="upd">
        <div class="upd-head">
          <strong>${escape(u.author)}</strong>
          <span class="muted">&middot; ${escape(u.taskTitle)}</span>
        </div>
        <div class="upd-prog">${escape(u.deltaPrefix)}${u.progress}%</div>
        ${u.note ? `<pre class="upd-note">${escape(u.note)}</pre>` : ''}
        ${updatePhotoGrid(u.photoUris ?? [])}
      </div>`,
    )
    .join('');

  const photoGrid =
    d.photoUris.length === 0
      ? ''
      : `<section class="section-flow">
    <h2>Site photos</h2>
    <div class="photos-grid">${d.photoUris
      .map(
        (uri) =>
          `<div class="photo-cell"><img src="${escapeAttr(uri)}" alt="" /></div>`,
      )
      .join('')}</div>
  </section>`;

  const snapshotSection = `<section class="section-compact">
    <h2>Snapshot</h2>
    <div class="snap">
      <div class="snap-cell">
        <div class="kicker">STAFF PRESENT</div>
        <div class="snap-val">${d.staffPresent}</div>
        <div class="muted">of ${d.staffTotal} rostered</div>
        ${
          d.staffEstPayTotalLabel
            ? `<div class="muted">Est. pay today: ${escape(d.staffEstPayTotalLabel)}</div>`
            : ''
        }
      </div>
      <div class="snap-cell">
        <div class="kicker">MATERIAL REQUESTED</div>
        <div class="snap-val">${d.materialRequestedCount}</div>
        <div class="muted">created this day</div>
      </div>
      <div class="snap-cell">
        <div class="kicker">MATERIAL VALUE</div>
        <div class="snap-val">${escape(d.materialRequestedValueLabel)}</div>
      </div>
    </div>
  </section>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escape(d.projectName)} — DPR ${escape(d.reportDateLabel)}</title>
<style>${css}</style>
</head>
<body>
  <header class="cover">
    <div class="brand">SITEEXPENS &middot; DAILY PROGRESS REPORT</div>
    <h1>${escape(d.projectName)}</h1>
    ${d.projectAddress ? `<div class="muted">${escape(d.projectAddress)}</div>` : ''}
    <div class="muted">Report date: ${escape(d.reportDateLabel)}</div>
    <div class="muted">Generated ${escape(d.generatedOnLabel)}</div>
  </header>

  ${snapshotSection}

  ${staffTableHtml}

  ${materialBlocksHtml}

  ${
    d.workDone.trim()
      ? `<section class="section-flow"><h2>Work done</h2><pre class="block">${escape(d.workDone.trim())}</pre></section>`
      : ''
  }
  ${
    d.issues.trim()
      ? `<section class="section-flow"><h2>Issues / delays</h2><pre class="block">${escape(d.issues.trim())}</pre></section>`
      : ''
  }
  ${
    d.tomorrowPlan.trim()
      ? `<section class="section-flow"><h2>Tomorrow&apos;s plan</h2><pre class="block">${escape(d.tomorrowPlan.trim())}</pre></section>`
      : ''
  }

  <section class="section-flow">
    <h2>Today&apos;s tasks &middot; ${d.tasks.length}</h2>
    ${
      d.tasks.length === 0
        ? `<div class="empty">No tasks active or updated on this date.</div>`
        : `<table class="tasks">
      <thead>
        <tr>
          <th class="idx">#</th>
          <th>TASK</th>
          <th>START</th>
          <th>END</th>
          <th class="num">%</th>
          <th>STATUS</th>
        </tr>
      </thead>
      <tbody>${taskRows}</tbody>
    </table>`
    }
  </section>

  <section class="section-flow">
    <h2>Progress updates today &middot; ${d.updates.length}</h2>
    ${d.updates.length === 0 ? `<div class="empty">No timeline posts on this date.</div>` : `<div class="upd-list">${updateRows}</div>`}
  </section>

  ${photoGrid}

  <footer>End of report &middot; Generated by Interior OS</footer>
</body>
</html>`;
}

function baseCss(): string {
  return `
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      color: #0F172A;
      font-size: 11pt;
      line-height: 1.4;
    }
    body { padding: 14mm 12mm; }
    /* Dark blue headings/labels (readable on white; avoid pale #94A3B8). */
    .muted { color: #1E40AF; font-size: 9pt; margin-top: 2pt; }
    .kicker {
      font-family: Menlo, Consolas, monospace;
      font-size: 8pt; font-weight: 700;
      color: #1E3A8A; letter-spacing: 1.2px;
    }
    .num { text-align: right; font-variant-numeric: tabular-nums; }

    .cover {
      border-bottom: 1px solid #E2E8F0;
      padding-bottom: 14pt;
      margin-bottom: 18pt;
      page-break-inside: avoid;
    }
    .brand {
      font-family: Menlo, Consolas, monospace;
      font-size: 8pt; font-weight: 700;
      color: #172554; letter-spacing: 1.4px;
    }
    h1 { font-size: 20pt; margin: 6pt 0 4pt 0; font-weight: 800; letter-spacing: -0.5px; }

    section { margin-bottom: 14pt; }
    .section-compact { page-break-inside: avoid; }
    .section-flow { page-break-inside: auto; }

    h2 {
      font-family: Menlo, Consolas, monospace;
      font-size: 9pt; font-weight: 800;
      color: #172554; letter-spacing: 1px;
      text-transform: uppercase;
      margin: 0 0 6pt 0;
      padding-bottom: 4pt;
      border-bottom: 2px solid #3B82F6;
    }

    .snap {
      display: flex;
      gap: 10pt;
      border: 1px solid #E2E8F0;
      padding: 10pt;
    }
    .snap-cell { flex: 1; }
    .snap-val { font-size: 18pt; font-weight: 800; margin-top: 4pt; }

    .staff-total { margin-top: 6pt; text-align: right; font-weight: 600; }

    .mat-block {
      margin-bottom: 12pt;
      border: 1px solid #EEF2F7;
      padding: 8pt 10pt;
      background: #FBFBFD;
    }
    .mat-head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8pt;
      margin-bottom: 6pt;
    }
    .mat-total { margin-left: auto; font-weight: 700; font-size: 10pt; }
    table.mat-items { width: 100%; }
    table.mat-items td.mat-line {
      padding: 3pt 0;
      font-size: 9pt;
      border-bottom: none;
    }

    pre.block {
      white-space: pre-wrap;
      word-break: break-word;
      margin: 0;
      padding: 10pt;
      background: #F8FAFC;
      border: 1px solid #EEF2F7;
      font-size: 10pt;
      font-family: inherit;
    }

    table { width: 100%; border-collapse: collapse; }
    th, td {
      padding: 6pt 8pt;
      text-align: left;
      border-bottom: 1px solid #EEF2F7;
      font-size: 10pt;
      vertical-align: top;
    }
    th {
      font-family: Menlo, Consolas, monospace;
      font-size: 8pt; font-weight: 800;
      color: #172554; letter-spacing: 0.8px;
      background: #DBEAFE;
      border-bottom: 1px solid #3B82F6;
    }
    .tasks .idx {
      font-family: Menlo, Consolas, monospace;
      font-size: 9pt; font-weight: 700; color: #1E40AF;
      width: 26pt;
    }
    .tasks .t-title { font-weight: 700; font-size: 11pt; line-height: 1.3; }
    .tasks .t-meta {
      font-family: Menlo, Consolas, monospace;
      font-size: 8pt; font-weight: 600;
      color: #1D4ED8; letter-spacing: 0.5px;
      margin-top: 2pt;
    }
    .tasks .t-desc {
      margin-top: 4pt;
      font-size: 9pt;
      color: #1E40AF;
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.35;
    }
    .tasks .t-date { font-size: 9.5pt; font-weight: 600; white-space: nowrap; width: 68pt; }

    .pill-muted {
      display: inline-block;
      padding: 2pt 6pt;
      border-radius: 9pt;
      background: #DBEAFE;
      color: #172554;
      font-family: Menlo, Consolas, monospace;
      font-size: 7.5pt; font-weight: 700;
    }

    .upd-list { display: flex; flex-direction: column; gap: 10pt; }
    .upd {
      padding: 8pt 10pt;
      border: 1px solid #EEF2F7;
      background: #FBFBFD;
      page-break-inside: avoid;
    }
    .upd-head { font-size: 10pt; margin-bottom: 4pt; }
    .upd-prog { font-weight: 700; color: #172554; font-size: 10pt; }
    pre.upd-note {
      white-space: pre-wrap;
      word-break: break-word;
      margin: 6pt 0 0 0;
      font-size: 9pt;
      color: #1E40AF;
      font-family: inherit;
    }

    .upd-photos {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 5pt;
      margin-top: 8pt;
    }
    .upd-photo-cell {
      page-break-inside: avoid;
      min-height: 52pt;
    }
    .upd-photo-cell img {
      width: 100%;
      height: 52pt;
      object-fit: cover;
      border: 1px solid #E2E8F0;
      border-radius: 3pt;
      background: #F1F5F9;
      display: block;
    }

    .photos-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6pt;
    }
    .photo-cell {
      page-break-inside: avoid;
    }
    .photo-cell img {
      width: 100%;
      height: 72pt;
      max-height: 72pt;
      object-fit: cover;
      border: 1px solid #E2E8F0;
      border-radius: 4pt;
      background: #F1F5F9;
      display: block;
    }

    .empty { padding: 12pt; color: #1E40AF; text-align: center; font-size: 10pt; }

    footer {
      margin-top: 20pt;
      padding-top: 8pt;
      text-align: center;
      font-family: Menlo, Consolas, monospace;
      font-size: 7.5pt;
      color: #3730A3;
      letter-spacing: 1.2px;
      border-top: 1px solid #EEF2F7;
    }
  `;
}

function escape(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s: string): string {
  return escape(s).replace(/`/g, '&#96;');
}
