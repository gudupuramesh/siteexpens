// Money + date + strings

const INR = (n, opts = {}) => {
  const { noSymbol = false, decimals = 0 } = opts;
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  const s = abs.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${sign}${noSymbol ? '' : '₹'}${s}`;
};

const INRcompact = (n) => {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(abs >= 1e8 ? 1 : 2).replace(/\.?0+$/, '')}Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(abs >= 1e6 ? 1 : 2).replace(/\.?0+$/, '')}L`;
  if (abs >= 1e3) return `${sign}₹${(abs / 1e3).toFixed(0)}K`;
  return `${sign}₹${abs}`;
};

const relDate = (iso) => {
  const d = new Date(iso);
  const now = new Date('2026-04-19T10:30:00');
  const diffMs = now - d;
  const diffD = Math.floor(diffMs / 86400000);
  if (diffD === 0) return 'Today';
  if (diffD === 1) return 'Yesterday';
  if (diffD < 7) return `${diffD} days ago`;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const absDate = (iso) => {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const dateHeader = (iso) => {
  const d = new Date(iso);
  const now = new Date('2026-04-19T10:30:00');
  const diffD = Math.floor((now - d) / 86400000);
  if (diffD === 0) return 'Today';
  if (diffD === 1) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase();
};

const timeOf = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });

// Strings (i18n-ready)
const STR = {
  appName: 'InteriorOS',
  tagline: 'Studio ledger for interior practice',
  empty: {
    expenses:    { title: 'Ledger is clean.',     sub: 'No expenses logged this month.' },
    projects:    { title: 'No projects yet.',     sub: 'Create your first brief to begin.' },
    approvals:   { title: 'All caught up.',       sub: 'No pending submissions.' },
    parties:     { title: 'Directory is empty.',  sub: 'Add your first contact.' },
    tasks:       { title: 'Nothing due.',         sub: 'Your board is quiet today.' },
  },
  tabs: { home: 'Home', projects: 'Projects', add: 'Add', ledger: 'Ledger', more: 'More' },
};

window.INR = INR;
window.INRcompact = INRcompact;
window.relDate = relDate;
window.absDate = absDate;
window.dateHeader = dateHeader;
window.timeOf = timeOf;
window.STR = STR;
