/**
 * Progress Report PDF — HTML template.
 *
 * Mirrors the on-screen `TaskReportModal` preview, formatted for A4
 * print. Designer hands this PDF to the client to communicate WHERE
 * the project is right now: status totals, weighted progress bar,
 * category breakdown, every task's start/end/duration/% complete.
 */
export type ProgressReportData = {
  projectName: string;
  projectAddress: string;
  generatedOn: string;
  periodStart: string | null;
  periodEnd: string | null;
  totalDays: number;
  workDays: number;
  total: number;
  completed: number;
  ongoing: number;
  notStarted: number;
  weightedProgress: number;
  categories: Array<{
    label: string;
    count: number;
    totalDays: number;
    avgProgress: number;
  }>;
  tasks: Array<{
    title: string;
    description: string;
    category: string;
    assignee: string;
    status: 'completed' | 'ongoing' | 'not_started';
    start: string;
    end: string;
    durationLabel: string;
    progress: number;
  }>;
};

const STATUS_LABEL = {
  completed: 'DONE',
  ongoing: 'ONGOING',
  not_started: 'PENDING',
} as const;

const STATUS_COLOR = {
  completed: { bg: '#E3F5EB', fg: '#0F9D58' },
  ongoing:   { bg: '#FEF3C7', fg: '#D97706' },
  not_started: { bg: '#F1F5F9', fg: '#475569' },
} as const;

export function buildProgressReportHtml(d: ProgressReportData): string {
  const cssBase = baseCss();

  const categoryRows = d.categories
    .map(
      (c) => `
        <tr>
          <td>${escape(c.label)}</td>
          <td class="num">${c.count}</td>
          <td class="num">${c.totalDays}</td>
          <td class="num">${c.avgProgress}%</td>
        </tr>`,
    )
    .join('');

  const taskRows = d.tasks
    .map((t, i) => {
      const sc = STATUS_COLOR[t.status];
      return `
        <tr>
          <td class="idx">${String(i + 1).padStart(2, '0')}</td>
          <td>
            <div class="t-title">${escape(t.title)}</div>
            <div class="t-meta">${escape(t.category)}${
              t.assignee ? ` &middot; ${escape(t.assignee)}` : ''
            }</div>
            ${t.description ? `<div class="t-note">${escape(t.description)}</div>` : ''}
          </td>
          <td class="t-date">${escape(t.start)}</td>
          <td class="t-date">${escape(t.end)}</td>
          <td class="t-date">${escape(t.durationLabel)}</td>
          <td class="t-prog">
            <div class="pbar"><div class="pbar-fill" style="width:${t.progress}%"></div></div>
            <div class="pbar-label">${t.progress}%</div>
          </td>
          <td>
            <span class="pill" style="background:${sc.bg};color:${sc.fg}">
              ${STATUS_LABEL[t.status]}
            </span>
          </td>
        </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escape(d.projectName)} — Progress Report</title>
<style>${cssBase}</style>
</head>
<body>
  <header class="cover">
    <div class="brand">SITEEXPENS &middot; PROGRESS REPORT</div>
    <h1>${escape(d.projectName)}</h1>
    ${d.projectAddress ? `<div class="muted">${escape(d.projectAddress)}</div>` : ''}
    <div class="muted">Generated ${escape(d.generatedOn)}</div>
  </header>

  <section>
    <h2>Project period</h2>
    <div class="period">
      <div class="period-col">
        <div class="kicker">START</div>
        <div class="period-val">${escape(d.periodStart ?? '—')}</div>
      </div>
      <div class="period-arrow">&rarr;</div>
      <div class="period-col">
        <div class="kicker">END</div>
        <div class="period-val">${escape(d.periodEnd ?? '—')}</div>
      </div>
      <div class="period-col">
        <div class="kicker">TOTAL SPAN</div>
        <div class="period-val">${d.totalDays} days</div>
      </div>
      ${
        d.workDays > 0
          ? `<div class="period-col">
        <div class="kicker">WORK-DAYS</div>
        <div class="period-val">${d.workDays}</div>
      </div>`
          : ''
      }
    </div>
  </section>

  <section>
    <h2>Summary</h2>
    <div class="stats">
      <div class="stat">
        <div class="stat-val">${d.total}</div>
        <div class="stat-label">TOTAL TASKS</div>
      </div>
      <div class="stat stat-success">
        <div class="stat-val">${d.completed}</div>
        <div class="stat-label">COMPLETED</div>
      </div>
      <div class="stat stat-warning">
        <div class="stat-val">${d.ongoing}</div>
        <div class="stat-label">ONGOING</div>
      </div>
      <div class="stat stat-muted">
        <div class="stat-val">${d.notStarted}</div>
        <div class="stat-label">NOT STARTED</div>
      </div>
    </div>
    <div class="overall">
      <div class="overall-row">
        <div class="kicker">OVERALL PROGRESS (DURATION-WEIGHTED)</div>
        <div class="overall-val">${d.weightedProgress}%</div>
      </div>
      <div class="bar"><div class="bar-fill" style="width:${d.weightedProgress}%"></div></div>
    </div>
  </section>

  ${
    d.categories.length > 0
      ? `<section>
    <h2>By category</h2>
    <table class="cat">
      <thead>
        <tr>
          <th>CATEGORY</th>
          <th class="num">TASKS</th>
          <th class="num">DAYS</th>
          <th class="num">AVG %</th>
        </tr>
      </thead>
      <tbody>${categoryRows}</tbody>
    </table>
  </section>`
      : ''
  }

  <section>
    <h2>Detailed log &middot; ${d.tasks.length} task${d.tasks.length === 1 ? '' : 's'}</h2>
    ${
      d.tasks.length === 0
        ? `<div class="empty">No tasks on this timeline yet.</div>`
        : `<table class="tasks">
      <thead>
        <tr>
          <th class="idx">#</th>
          <th>TASK</th>
          <th>START</th>
          <th>END</th>
          <th>DURATION</th>
          <th>PROGRESS</th>
          <th>STATUS</th>
        </tr>
      </thead>
      <tbody>${taskRows}</tbody>
    </table>`
    }
  </section>

  <footer>
    End of report &middot; Generated by Interior OS
  </footer>
</body>
</html>`;
}

// ────────────────────────────────────────────────────────────────────
// CSS — print-friendly, A4 portrait, system fonts, sharp lines.
// ────────────────────────────────────────────────────────────────────

function baseCss(): string {
  return `
    /* Page size only — margins live entirely on body padding. Stacking
       @page margin with body padding doubled the visible margin on
       Android WebView print and made the content look postage-stamp
       sized inside the paper. 12mm side / 14mm top is the standard
       office-report ratio (slightly more breathing room at top/bottom
       than at the sides). */
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

    .muted { color: #475569; font-size: 9pt; margin-top: 2pt; }
    .kicker {
      font-family: Menlo, Consolas, monospace;
      font-size: 7.5pt; font-weight: 700;
      color: #94A3B8; letter-spacing: 1.4px;
    }
    .num { text-align: right; font-variant-numeric: tabular-nums; }

    /* Cover */
    .cover {
      border-bottom: 1px solid #E2E8F0;
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

    /* Period */
    .period {
      display: flex; align-items: center; gap: 12pt;
      padding: 8pt 10pt;
      border: 1px solid #E2E8F0;
    }
    .period-col { flex: 1; }
    .period-val {
      font-size: 13pt; font-weight: 700; margin-top: 2pt;
      letter-spacing: -0.2px;
    }
    .period-arrow { color: #94A3B8; font-size: 14pt; }

    /* Summary stats */
    .stats { display: flex; gap: 8pt; margin-bottom: 10pt; }
    .stat {
      flex: 1; padding: 10pt;
      background: #F8FAFC;
      border: 1px solid #EEF2F7;
    }
    .stat-success { background: #E3F5EB; border-color: #C7E8D5; }
    .stat-warning { background: #FEF3C7; border-color: #F0E2A2; }
    .stat-muted   { background: #F1F5F9; border-color: #E2E8F0; }
    .stat-val { font-size: 22pt; font-weight: 800; letter-spacing: -0.4px; }
    .stat-label {
      font-family: Menlo, Consolas, monospace;
      font-size: 7.5pt; font-weight: 700; letter-spacing: 1.2px;
      margin-top: 2pt;
    }

    .overall {
      padding: 8pt 10pt;
      border: 1px solid #E2E8F0;
    }
    .overall-row {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 4pt;
    }
    .overall-val { font-size: 12pt; font-weight: 700; color: #2563EB; }
    .bar {
      height: 7pt; background: #F1F5F9; border-radius: 3pt; overflow: hidden;
    }
    .bar-fill { height: 100%; background: #2563EB; }

    /* Tables */
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
      font-size: 7.5pt; font-weight: 700;
      color: #475569; letter-spacing: 1.2px;
      border-bottom: 1px solid #E2E8F0;
      background: #F8FAFC;
    }

    .cat tr:nth-child(even) { background: #FBFBFD; }

    .tasks .idx {
      font-family: Menlo, Consolas, monospace;
      font-size: 9pt; font-weight: 700; color: #94A3B8;
      width: 26pt;
    }
    .tasks .t-title { font-weight: 700; font-size: 11pt; line-height: 1.3; }
    .tasks .t-meta {
      font-family: Menlo, Consolas, monospace;
      font-size: 7.5pt; font-weight: 600;
      color: #2563EB; letter-spacing: 0.8px;
      margin-top: 2pt;
    }
    .tasks .t-note { font-size: 9pt; color: #475569; margin-top: 3pt; }
    .tasks .t-date {
      font-size: 9.5pt; font-weight: 600;
      white-space: nowrap; width: 60pt;
    }
    .tasks .t-prog { width: 90pt; }
    .pbar {
      height: 5pt; background: #F1F5F9; overflow: hidden; border-radius: 2.5pt;
    }
    .pbar-fill { height: 100%; background: #2563EB; }
    .pbar-label {
      font-family: Menlo, Consolas, monospace;
      font-size: 8pt; font-weight: 700; color: #475569;
      margin-top: 2pt;
    }
    .pill {
      display: inline-block;
      padding: 2pt 6pt;
      border-radius: 9pt;
      font-family: Menlo, Consolas, monospace;
      font-size: 7.5pt; font-weight: 700; letter-spacing: 0.8px;
      white-space: nowrap;
    }
    .empty { padding: 14pt; color: #475569; text-align: center; font-size: 10pt; }

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
