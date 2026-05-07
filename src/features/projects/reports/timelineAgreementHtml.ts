/**
 * Timeline & Scope Sheet PDF — HTML template.
 *
 * This is the document a designer attaches to the client AGREEMENT.
 * It's not a status report — it's a forward-looking declaration of
 * scope: every line of work, when it starts, when it ends, who's
 * responsible, what the description / scope details are. Plus a
 * signature block so client + designer can sign on the dotted line.
 *
 * Differences from the Progress Report:
 *   - No status pills, no progress bars (this isn't about completion).
 *   - One row per task with serial number, dates, duration, scope,
 *     assignee — formatted like a contract schedule.
 *   - "Scope summary" up top that calls out total span + total work
 *     scope + category list (so the client sees the agreement covers
 *     all the things they discussed).
 *   - Signature block at the end with date + signature lines.
 */
export type TimelineAgreementData = {
  projectName: string;
  projectAddress: string;
  clientName?: string;
  /** Free-text designer / firm name; falls back if not supplied. */
  designerName?: string;
  generatedOn: string;
  periodStart: string | null;
  periodEnd: string | null;
  totalDays: number;
  workDays: number;
  total: number;
  categories: string[];
  tasks: Array<{
    title: string;
    description: string;
    category: string;
    assignee: string;
    start: string;
    end: string;
    durationLabel: string;
  }>;
};

export function buildTimelineAgreementHtml(d: TimelineAgreementData): string {
  const css = baseCss();

  const taskRows = d.tasks.length
    ? d.tasks
        .map(
          (t, i) => `
        <tr>
          <td class="sno">${String(i + 1).padStart(2, '0')}</td>
          <td>
            <div class="scope-title">${escape(t.title)}</div>
            <div class="scope-cat">${escape(t.category)}${
              t.assignee ? ` &middot; ${escape(t.assignee)}` : ''
            }</div>
            ${
              t.description
                ? `<div class="scope-desc">${escape(t.description)}</div>`
                : ''
            }
          </td>
          <td class="t-date">${escape(t.start)}</td>
          <td class="t-date">${escape(t.end)}</td>
          <td class="t-date">${escape(t.durationLabel)}</td>
        </tr>`,
        )
        .join('')
    : `<tr><td colspan="5" class="empty">No scope items recorded yet.</td></tr>`;

  const categoryChips = d.categories.length
    ? d.categories
        .map((c) => `<span class="chip">${escape(c)}</span>`)
        .join('')
    : '<span class="muted">No categories specified.</span>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escape(d.projectName)} — Timeline & Scope of Work</title>
<style>${css}</style>
</head>
<body>
  <header class="cover">
    <div class="brand">SITEEXPENS &middot; SCHEDULE OF WORK</div>
    <h1>${escape(d.projectName)}</h1>
    ${d.projectAddress ? `<div class="muted">${escape(d.projectAddress)}</div>` : ''}
    <div class="cover-meta">
      ${d.clientName ? `<div><span class="kicker">CLIENT</span><div class="cover-meta-val">${escape(d.clientName)}</div></div>` : ''}
      ${d.designerName ? `<div><span class="kicker">DESIGNER</span><div class="cover-meta-val">${escape(d.designerName)}</div></div>` : ''}
      <div><span class="kicker">DATE</span><div class="cover-meta-val">${escape(d.generatedOn)}</div></div>
    </div>
  </header>

  <section>
    <h2>Scope summary</h2>
    <table class="kv">
      <tr>
        <th>Project period</th>
        <td>${escape(d.periodStart ?? '—')} &nbsp;&rarr;&nbsp; ${escape(d.periodEnd ?? '—')}</td>
      </tr>
      <tr>
        <th>Total span</th>
        <td>${d.totalDays} day${d.totalDays === 1 ? '' : 's'}</td>
      </tr>
      ${
        d.workDays > 0
          ? `<tr><th>Work-days scheduled</th><td>${d.workDays}</td></tr>`
          : ''
      }
      <tr>
        <th>Total scope items</th>
        <td>${d.total}</td>
      </tr>
      <tr>
        <th>Trades involved</th>
        <td class="chips">${categoryChips}</td>
      </tr>
    </table>
  </section>

  <section>
    <h2>Schedule of work</h2>
    <table class="schedule">
      <thead>
        <tr>
          <th class="sno">S.NO</th>
          <th>SCOPE OF WORK</th>
          <th>START</th>
          <th>END</th>
          <th>DURATION</th>
        </tr>
      </thead>
      <tbody>${taskRows}</tbody>
    </table>
  </section>

  <section class="terms">
    <h2>Notes</h2>
    <ol>
      <li>Dates above are indicative and contingent on timely material delivery, site readiness, and client approvals at every stage.</li>
      <li>Any change in scope, finish or specification after sign-off will be quoted separately and may extend the timeline.</li>
      <li>Work shall proceed on working days only. Sundays and public holidays are excluded unless agreed otherwise in writing.</li>
      <li>The designer reserves the right to re-sequence trades on site to optimise execution without affecting the overall delivery date.</li>
    </ol>
  </section>

  <section class="sign">
    <div class="sign-col">
      <div class="sign-line"></div>
      <div class="sign-label">CLIENT SIGNATURE</div>
      ${d.clientName ? `<div class="sign-name">${escape(d.clientName)}</div>` : '<div class="sign-name">&nbsp;</div>'}
      <div class="sign-date">Date: ____________________</div>
    </div>
    <div class="sign-col">
      <div class="sign-line"></div>
      <div class="sign-label">DESIGNER SIGNATURE</div>
      ${d.designerName ? `<div class="sign-name">${escape(d.designerName)}</div>` : '<div class="sign-name">&nbsp;</div>'}
      <div class="sign-date">Date: ____________________</div>
    </div>
  </section>

  <footer>
    Schedule of Work &middot; Generated by Interior OS on ${escape(d.generatedOn)}
  </footer>
</body>
</html>`;
}

// ────────────────────────────────────────────────────────────────────
// CSS — formal contract feel: serif-ish weighting, no bright colours
// outside the brand stripe, clear ruled tables.
// ────────────────────────────────────────────────────────────────────

function baseCss(): string {
  return `
    /* Page size only — margins live entirely on body padding. Stacking
       @page margin with body padding doubled the visible margin on
       Android WebView print. 12mm side / 14mm top matches the standard
       office-report ratio. */
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      color: #0F172A;
      font-size: 11pt;
      line-height: 1.45;
    }
    body { padding: 14mm 12mm; }

    .muted { color: #475569; font-size: 9.5pt; margin-top: 2pt; }
    .kicker {
      font-family: Menlo, Consolas, monospace;
      font-size: 7.5pt; font-weight: 700;
      color: #94A3B8; letter-spacing: 1.4px;
    }

    /* Cover */
    .cover {
      border-bottom: 2px solid #0F172A;
      padding-bottom: 14pt;
      margin-bottom: 18pt;
    }
    .brand {
      font-family: Menlo, Consolas, monospace;
      font-size: 8pt; font-weight: 700;
      color: #2563EB; letter-spacing: 1.6px;
    }
    h1 {
      font-size: 22pt; margin: 6pt 0 4pt 0;
      font-weight: 800; letter-spacing: -0.5px;
    }
    .cover-meta {
      display: flex; gap: 28pt; margin-top: 12pt;
      flex-wrap: wrap;
    }
    .cover-meta-val { font-size: 12pt; font-weight: 700; margin-top: 2pt; }

    section { margin-bottom: 16pt; page-break-inside: avoid; }
    h2 {
      font-family: Menlo, Consolas, monospace;
      font-size: 8pt; font-weight: 700;
      color: #94A3B8; letter-spacing: 1.4px;
      text-transform: uppercase;
      margin: 0 0 6pt 0;
      padding-bottom: 4pt;
      border-bottom: 1px solid #EEF2F7;
    }

    /* Tables */
    table { width: 100%; border-collapse: collapse; }
    th, td {
      padding: 7pt 8pt;
      text-align: left;
      border-bottom: 1px solid #EEF2F7;
      font-size: 10pt;
      vertical-align: top;
    }

    /* Key-value summary table */
    .kv th {
      width: 32%;
      font-family: Menlo, Consolas, monospace;
      font-size: 8pt; font-weight: 700;
      color: #475569; letter-spacing: 1.2px;
      background: #F8FAFC;
    }
    .kv td { font-weight: 600; }
    .chips { display: flex; flex-wrap: wrap; gap: 4pt; }
    .chip {
      display: inline-block;
      padding: 1pt 6pt;
      border: 1px solid #E2E8F0;
      background: #F8FAFC;
      font-family: Menlo, Consolas, monospace;
      font-size: 7.5pt; font-weight: 700; letter-spacing: 0.8px;
      color: #475569;
    }

    /* Schedule of work */
    .schedule th {
      font-family: Menlo, Consolas, monospace;
      font-size: 7.5pt; font-weight: 700;
      color: #475569; letter-spacing: 1.2px;
      background: #F8FAFC;
      border-bottom: 1.5px solid #0F172A;
      border-top: 1.5px solid #0F172A;
    }
    .schedule .sno {
      width: 32pt;
      font-family: Menlo, Consolas, monospace;
      font-weight: 700; color: #94A3B8;
      text-align: center;
    }
    .schedule .scope-title { font-weight: 700; font-size: 11pt; line-height: 1.3; }
    .schedule .scope-cat {
      font-family: Menlo, Consolas, monospace;
      font-size: 7.5pt; font-weight: 600;
      color: #2563EB; letter-spacing: 0.8px;
      margin-top: 2pt;
    }
    .schedule .scope-desc {
      font-size: 9.5pt; color: #475569;
      margin-top: 4pt;
    }
    .schedule .t-date {
      font-size: 9.5pt; font-weight: 600;
      white-space: nowrap; width: 70pt;
    }
    .empty { padding: 14pt; color: #475569; text-align: center; font-size: 10pt; }

    /* Terms list */
    .terms ol { margin: 0; padding-left: 18pt; }
    .terms li { font-size: 10pt; color: #1E293B; margin-bottom: 4pt; line-height: 1.5; }

    /* Signature block */
    .sign {
      display: flex; gap: 36pt;
      margin-top: 28pt;
      padding-top: 12pt;
      border-top: 1px solid #E2E8F0;
      page-break-inside: avoid;
    }
    .sign-col { flex: 1; }
    .sign-line {
      height: 36pt;
      border-bottom: 1.5px solid #0F172A;
      margin-bottom: 6pt;
    }
    .sign-label {
      font-family: Menlo, Consolas, monospace;
      font-size: 7.5pt; font-weight: 700;
      color: #94A3B8; letter-spacing: 1.4px;
    }
    .sign-name {
      font-size: 11pt; font-weight: 700;
      margin-top: 2pt;
    }
    .sign-date {
      font-size: 9.5pt; color: #475569;
      margin-top: 6pt;
    }

    footer {
      margin-top: 24pt;
      padding-top: 8pt;
      text-align: center;
      font-family: Menlo, Consolas, monospace;
      font-size: 7.5pt;
      color: #94A3B8;
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
