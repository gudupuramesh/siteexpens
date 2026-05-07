// Projects list + detail — v2: compact header, expanded tabs (Overview/Expenses/Materials/Designs/Laminates/Whiteboard/Timeline/Team)
const { useState: useSt_P, useMemo: useMemo_P } = React;

function ProjectsScreen({ t, onNavigate }) {
  const { C, T, S } = t;
  const [filter, setFilter] = useSt_P('all');
  const [statusOverrides, setStatusOverrides] = useSt_P({});
  const [statusEdit, setStatusEdit] = useSt_P(null);
  const [q, setQ] = useSt_P('');

  const filters = [
    { key: 'all',       label: 'All',       count: PROJECTS.length },
    { key: 'Active',    label: 'Active',    count: PROJECTS.filter(p => p.status === 'Active').length },
    { key: 'On Hold',   label: 'On Hold',   count: PROJECTS.filter(p => p.status === 'On Hold').length },
    { key: 'Completed', label: 'Completed', count: PROJECTS.filter(p => p.status === 'Completed').length },
  ];

  let list = PROJECTS.map(p => ({ ...p, status: statusOverrides[p.id] || p.status }));
  if (filter !== 'all') list = list.filter(p => p.status === filter);
  if (q) list = list.filter(p => (p.name + p.client + p.location).toLowerCase().includes(q.toLowerCase()));

  return (
    <div style={{ background: C.bg }}>
      <div style={{ padding: `0 ${S.gutter}px 12px`, display: 'flex', alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: T.mono, fontSize: 10, color: C.ink3, letterSpacing: 1.8 }}>
            {PROJECTS.length} PROJECTS · 4 ACTIVE
          </div>
          <div style={{ fontFamily: T.family, fontSize: 26, fontWeight: 600, color: C.ink, marginTop: 2, letterSpacing: -0.6 }}>
            Projects
          </div>
        </div>
        <div onClick={() => onNavigate('new-project')} style={{
          width: 36, height: 36, background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}>
          <Icon name="plus" size={20} color="#fff"/>
        </div>
      </div>
      <div style={{ padding: `0 ${S.gutter}px 12px` }}>
        <div style={{
          display: 'flex', alignItems: 'center', height: 40, border: `1px solid ${C.hairline2}`, padding: '0 12px', gap: 8,
        }}>
          <Icon name="search" size={16} color={C.ink3}/>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name, client, location"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent',
              fontFamily: T.family, fontSize: 14, color: C.ink }}/>
        </div>
      </div>
      <div style={{ paddingBottom: 14 }}>
        <FilterChips t={t} items={filters} value={filter} onChange={setFilter}/>
      </div>
      <div style={{ padding: `0 ${S.gutter}px 30px`, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {list.map(p => (
          <div key={p.id} onClick={() => onNavigate('project', p.id)} style={{
            border: `1px solid ${C.hairline2}`, padding: 14, cursor: 'pointer', background: C.bg,
          }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <Thumb t={t} size={52} label={p.name.slice(0,2).toUpperCase()}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div style={{
                    fontFamily: T.family, fontSize: 15, fontWeight: 600, color: C.ink,
                    letterSpacing: -0.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{p.name}</div>
                  <div onClick={(e) => { e.stopPropagation(); setStatusEdit(p); }}>
                    <Pill t={t} tone={p.status === 'Active' ? 'success' : p.status === 'Completed' ? 'default' : 'warning'}>
                      {p.status}
                    </Pill>
                  </div>
                </div>
                <div style={{ fontFamily: T.family, fontSize: 12, color: C.ink2, marginTop: 2 }}>
                  {p.client} · {p.location}
                </div>
                <div style={{ fontFamily: T.mono, fontSize: 10, color: C.ink3, marginTop: 2, letterSpacing: 1 }}>
                  {p.type.toUpperCase()}
                </div>
              </div>
            </div>
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <ProgressBar t={t} value={p.spent} max={p.budget}/>
              </div>
              <div style={{ fontFamily: T.mono, fontSize: 10, color: C.ink3, ...T.tabular, letterSpacing: 0.5 }}>
                {p.progress}%
              </div>
            </div>
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between' }}>
              <div style={{ fontFamily: T.mono, fontSize: 11, color: C.ink, ...T.tabular }}>
                {INRcompact(p.spent)} <span style={{ color: C.ink3 }}>/ {INRcompact(p.budget)}</span>
              </div>
              <div style={{ fontFamily: T.mono, fontSize: 10, color: C.ink3, ...T.tabular }}>
                {absDate(p.end)}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ height: 40 }}/>
      {statusEdit && (
        <StatusEditSheet t={t} project={statusEdit}
          onPick={(s) => { setStatusOverrides(o => ({ ...o, [statusEdit.id]: s })); setStatusEdit(null); }}
          onClose={() => setStatusEdit(null)}/>
      )}
    </div>
  );
}

// ── Filter sheet (bottom card with all expense filters)
function FilterSheet({ t, onClose, status, setStatus, cat, setCat, vendor, setVendor, mode, setMode, vendors, categories, statuses, onClear, activeCount, resultCount }) {
  const { C, T, S } = t;
  const PAY_MODES = ['all', 'Cash', 'UPI', 'Bank Transfer', 'Card', 'Cheque'];

  const Section = ({ label, children }) => (
    <div style={{ padding: `14px ${S.gutter}px`, borderBottom: `1px solid ${C.hairline}` }}>
      <div style={{
        fontFamily: T.family, fontSize: 11, color: C.ink3, letterSpacing: 0.5, fontWeight: 700,
        textTransform: 'uppercase', marginBottom: 10,
      }}>{label}</div>
      {children}
    </div>
  );

  const ChipBtn = ({ active, onClick, children }) => (
    <button onClick={onClick} style={{
      padding: '7px 12px', borderRadius: 999,
      border: `1px solid ${active ? C.accent : C.hairline2}`,
      background: active ? C.accentSoft : C.bg,
      color: active ? C.accent : C.ink,
      fontFamily: T.family, fontSize: 12.5, fontWeight: active ? 600 : 500,
      cursor: 'pointer', whiteSpace: 'nowrap',
    }}>{children}</button>
  );

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 600, background: 'rgba(15,23,42,0.45)', animation: 'fadeIn 180ms' }}
         onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        maxHeight: '82%',
        background: C.bg, borderTopLeftRadius: 18, borderTopRightRadius: 18,
        animation: 'sheetUp 280ms cubic-bezier(.2,.8,.2,1)',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 -10px 40px rgba(15,23,42,0.18)',
      }}>
        {/* Grabber */}
        <div style={{ display:'flex', justifyContent:'center', paddingTop: 8, paddingBottom: 4 }}>
          <div style={{ width: 38, height: 4, borderRadius: 2, background: C.hairline2 }}/>
        </div>

        {/* Header */}
        <div style={{
          padding: `8px ${S.gutter}px 14px`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: `1px solid ${C.hairline}`,
        }}>
          <div>
            <div style={{ fontFamily: T.family, fontSize: 17, fontWeight: 700, color: C.ink, letterSpacing: -0.3 }}>
              Filter expenses
            </div>
            <div style={{ fontFamily: T.family, fontSize: 12, color: C.ink2, marginTop: 1 }}>
              {activeCount > 0
                ? `${activeCount} filter${activeCount === 1 ? '' : 's'} active · ${resultCount} result${resultCount === 1 ? '' : 's'}`
                : 'No filters applied'}
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: 16, border: 'none', background: C.surface2,
            display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer',
          }}>
            <Icon name="close" size={16} color={C.ink}/>
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <Section label="Status">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {statuses.map(s => (
                <ChipBtn key={s.key} active={status === s.key} onClick={() => setStatus(s.key)}>
                  {s.label}
                </ChipBtn>
              ))}
            </div>
          </Section>

          <Section label="Category">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {categories.map(c => (
                <ChipBtn key={c.key} active={cat === c.key} onClick={() => setCat(c.key)}>
                  {c.label}
                </ChipBtn>
              ))}
            </div>
          </Section>

          <Section label="Vendor / Party">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <ChipBtn active={vendor === 'all'} onClick={() => setVendor('all')}>All vendors</ChipBtn>
              {vendors.map(v => (
                <ChipBtn key={v} active={vendor === v} onClick={() => setVendor(v)}>
                  {v}
                </ChipBtn>
              ))}
            </div>
          </Section>

          <Section label="Payment method">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {PAY_MODES.map(m => (
                <ChipBtn key={m} active={mode === m} onClick={() => setMode(m)}>
                  {m === 'all' ? 'Any method' : m}
                </ChipBtn>
              ))}
            </div>
          </Section>

          <div style={{ height: 12 }}/>
        </div>

        {/* Footer */}
        <div style={{
          padding: `12px ${S.gutter}px 16px`,
          borderTop: `1px solid ${C.hairline2}`,
          background: C.bg, display: 'flex', gap: 10,
        }}>
          <button onClick={onClear} disabled={activeCount === 0} style={{
            flex: 1, height: 46, borderRadius: 10,
            border: `1px solid ${C.hairline2}`,
            background: C.bg, color: activeCount > 0 ? C.ink : C.ink3,
            fontFamily: T.family, fontSize: 14, fontWeight: 600,
            cursor: activeCount > 0 ? 'pointer' : 'default',
          }}>Clear all</button>
          <button onClick={onClose} style={{
            flex: 2, height: 46, borderRadius: 10, border: 'none',
            background: C.accent, color: '#fff',
            fontFamily: T.family, fontSize: 14, fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 4px 10px rgba(37,99,235,0.28)',
          }}>Show {resultCount} result{resultCount === 1 ? '' : 's'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Payment sheet (In / Out)
function PaymentSheet({ t, kind, onClose, onSave }) {
  const { C, T, S } = t;
  const [amount, setAmount] = useSt_P('');
  const [mode, setMode] = useSt_P('UPI');
  const [party, setParty] = useSt_P('');
  const [note, setNote] = useSt_P('');
  const [cat, setCat] = useSt_P(kind === 'out' ? 'marble' : '');
  const modes = ['Cash','UPI','Bank Transfer','Card','Cheque'];
  const isIn = kind === 'in';
  const accent = isIn ? C.success : C.accent;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.38)', animation: 'fadeIn 180ms' }}>
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, top: 50,
        background: C.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20,
        animation: 'sheetUp 260ms cubic-bezier(.2,.8,.2,1)', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', paddingTop: 10,
      }}>
        <div style={{ display:'flex', justifyContent:'center', paddingBottom: 6 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: C.hairline2 }}/>
        </div>
        <div style={{
          padding: `0 ${S.gutter}px 14px`,
          display:'flex', alignItems:'center', justifyContent:'space-between',
          borderBottom: `1px solid ${C.hairline}`,
        }}>
          <div onClick={onClose} style={{ cursor: 'pointer', color: C.ink2 }}>
            <Icon name="close" size={20} color={C.ink2}/>
          </div>
          <div style={{ fontFamily: T.family, fontSize: 15, fontWeight: 600, color: C.ink }}>
            {isIn ? 'Payment in' : 'Payment out'}
          </div>
          <div style={{ fontFamily: T.mono, fontSize: 10, color: accent, letterSpacing: 1 }}>
            {isIn ? 'RECEIVE' : 'PAY'}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '24px 20px 20px', textAlign: 'center', borderBottom: `1px solid ${C.hairline}` }}>
            <div style={{ fontFamily: T.mono, fontSize: 10, color: C.ink3, letterSpacing: 1.5 }}>AMOUNT · INR</div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap: 4, marginTop: 8 }}>
              <div style={{ fontFamily: T.num, fontSize: 36, color: amount ? accent : C.ink3, fontWeight: 600 }}>
                {isIn ? '+₹' : '−₹'}
              </div>
              <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="0"
                style={{
                  border: 'none', outline: 'none', background: 'transparent',
                  fontFamily: T.num, fontSize: 44, fontWeight: 700,
                  color: accent, width: 180, textAlign: 'left', letterSpacing: -1.2,
                  ...T.tabular,
                }}
              />
            </div>
            {amount && (
              <div style={{ fontFamily: T.mono, fontSize: 11, color: C.ink3, marginTop: 4, letterSpacing: 0.8 }}>
                {INRcompact(parseInt(amount, 10))}
              </div>
            )}
          </div>

          <div style={{ padding: `14px ${S.gutter}px`, borderBottom: `1px solid ${C.hairline}` }}>
            <div style={{ fontFamily: T.mono, fontSize: 10, color: C.ink3, letterSpacing: 1.5, marginBottom: 10 }}>
              {isIn ? 'RECEIVED VIA' : 'PAID VIA'}
            </div>
            <div style={{ display:'flex', gap: 6, flexWrap: 'wrap' }}>
              {modes.map(m => <Chip key={m} t={t} label={m} active={mode === m} onClick={() => setMode(m)}/>)}
            </div>
          </div>

          <Group t={t}>
            <Row t={t} title={isIn ? 'From (client)' : 'Paid to (vendor)'}
              left={<Icon name="user" size={18} color={C.ink2}/>}
              meta={party || 'Choose party'} chevron/>
            {!isIn && (
              <Row t={t} title="Category"
                left={<Icon name="tag" size={18} color={C.ink2}/>}
                meta={(CATEGORIES.find(c=>c.key===cat)||{}).label} chevron/>
            )}
            <InputRow t={t} label="Note" value={note} onChange={setNote} placeholder={isIn ? 'Milestone, installment…' : 'What was purchased'} />
            <PickerRow t={t} label="Date" value="Today · 10:34 AM"
              icon={<Icon name="calendar" size={18} color={C.ink2}/>} last/>
          </Group>

          {!isIn && (
            <Group t={t}>
              <Row t={t} title="Attach receipt"
                left={<Icon name="camera" size={18} color={C.ink2}/>}
                right={<span style={{ fontFamily: T.family, fontSize: 13, color: C.accent, fontWeight: 500 }}>Add photo</span>} last/>
            </Group>
          )}

          <div style={{ height: 40 }}/>
        </div>

        <div style={{ padding: `12px ${S.gutter}px 18px`, borderTop: `1px solid ${C.hairline}`, background: C.bg }}>
          <button onClick={onSave} disabled={!amount} style={{
            width: '100%', height: 48, border: 'none',
            background: amount ? accent : C.hairline,
            color: '#fff', fontFamily: T.family, fontSize: 15, fontWeight: 600,
            borderRadius: 8, cursor: amount ? 'pointer' : 'default',
          }}>
            {isIn ? 'Record payment in' : 'Record payment out'}{amount ? ` · ${INRcompact(parseInt(amount,10))}` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProjectDetailScreen({ t, projectId, onNavigate, onBack }) {
  const { C, T, S } = t;
  const baseP = PROJECTS.find(x => x.id === projectId) || PROJECTS[0];
  const [pState, setPState] = useSt_P({ progress: baseP.progress, status: baseP.status });
  const p = { ...baseP, ...pState };
  const [progEdit, setProgEdit] = useSt_P(false);
  const [statusEdit2, setStatusEdit2] = useSt_P(false);
  const [tab, setTab] = useSt_P('overview');
  const [expQ, setExpQ] = useSt_P('');
  const [expCat, setExpCat] = useSt_P('all');
  const [expStatus, setExpStatus] = useSt_P('all');
  const [payKind, setPayKind] = useSt_P(null); // null | 'in' | 'out'
  const [toast, setToast] = useSt_P(null);
  const [filterOpen, setFilterOpen] = useSt_P(false);
  const [expVendor, setExpVendor] = useSt_P('all');
  const [expMode, setExpMode] = useSt_P('all');

  const expenses = EXPENSES.filter(e => e.project === p.id);
  const spent = expenses.reduce((a, b) => a + b.amount, 0);
  const incomeItems = INCOME.filter(i => i.project === p.id);
  const received = incomeItems.reduce((a, b) => a + b.amount, 0);

  const byCat = {};
  expenses.forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + e.amount; });
  const topCats = Object.entries(byCat).sort((a,b) => b[1] - a[1]).slice(0, 4);

  const catOptions = [{ key: 'all', label: `All · ${expenses.length}` },
    ...Object.keys(byCat).map(k => ({ key: k, label: (CATEGORIES.find(c => c.key === k)||{}).label || k, count: expenses.filter(e=>e.category===k).length }))];
  const statusOpts = [
    { key: 'all', label: 'All' },
    { key: 'Posted', label: 'Posted' },
    { key: 'Pending', label: 'Pending' },
  ];

  const filteredExp = expenses.filter(e => {
    if (expCat !== 'all' && e.category !== expCat) return false;
    if (expStatus !== 'all' && e.status !== expStatus) return false;
    if (expVendor !== 'all' && e.vendor !== expVendor) return false;
    if (expMode !== 'all' && (e.mode || 'UPI') !== expMode) return false;
    if (expQ) {
      const hay = (e.note + e.vendor + (CATEGORIES.find(c=>c.key===e.category)?.label||'')).toLowerCase();
      if (!hay.includes(expQ.toLowerCase())) return false;
    }
    return true;
  });
  const activeFilters = [expCat, expStatus, expVendor, expMode].filter(v => v !== 'all').length;
  const expVendors = Array.from(new Set(expenses.map(e => e.vendor)));

  const doToast = (m) => { setToast(m); setTimeout(() => setToast(null), 1700); };

  return (
    <div style={{ background: C.bg, position: 'relative' }}>
      {/* Compact header — only back + project name stuck to top */}
      <div style={{
        padding: `0 ${S.gutter}px 10px`,
        display: 'flex', alignItems: 'center', gap: 10,
        borderBottom: `1px solid ${C.hairline}`, paddingBottom: 10,
      }}>
        <div onClick={onBack} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', color: C.ink2 }}>
          <Icon name="chev_l" size={18} color={C.ink2}/>
        </div>
        <Thumb t={t} size={28} label={p.name.slice(0,2).toUpperCase()}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: T.family, fontSize: 15, fontWeight: 600, color: C.ink,
            letterSpacing: -0.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{p.name}</div>
          <div style={{
            fontFamily: T.mono, fontSize: 9, color: C.ink3, letterSpacing: 1.2,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{p.client.toUpperCase()} · {p.location.toUpperCase()}</div>
        </div>
        <div style={{ width: 32, height: 32, border: `1px solid ${C.hairline2}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <Icon name="more" size={16} color={C.ink}/>
        </div>
      </div>

      {/* Tabs (scrollable) */}
      <Segmented t={t} value={tab} onChange={setTab} items={[
        { key: 'overview',   label: 'Overview' },
        { key: 'expenses',   label: `Expenses · ${expenses.length}` },
        { key: 'materials',  label: 'Materials' },
        { key: 'designs',    label: 'Designs' },
        { key: 'laminates',  label: 'Laminates' },
        { key: 'whiteboard', label: 'Whiteboard' },
        { key: 'timeline',   label: 'Timeline' },
        { key: 'attendance', label: 'Attendance' },
        { key: 'team',       label: `Team · ${p.team}` },
      ]}/>

      {tab === 'overview' && (
        <div style={{ padding: `18px 0 30px` }}>
          {/* KPI strip lives inside overview now */}
          <div style={{ padding: `0 ${S.gutter}px 14px` }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', border: `1px solid ${C.hairline2}`,
              background: C.surface2,
            }}>
              <div style={{ padding: 12, borderRight: `1px solid ${C.hairline2}` }}>
                <div style={{ fontFamily: T.mono, fontSize: 9, color: C.ink3, letterSpacing: 1.2 }}>BUDGET</div>
                <div style={{ fontFamily: T.num, fontSize: 18, fontWeight: 600, color: C.ink, marginTop: 2, ...T.tabular, letterSpacing: -0.3 }}>
                  {INRcompact(p.budget)}
                </div>
              </div>
              <div style={{ padding: 12, borderRight: `1px solid ${C.hairline2}` }}>
                <div style={{ fontFamily: T.mono, fontSize: 9, color: C.ink3, letterSpacing: 1.2 }}>SPENT</div>
                <div style={{ fontFamily: T.num, fontSize: 18, fontWeight: 600, color: p.spent/p.budget > 0.9 ? C.danger : C.ink, marginTop: 2, ...T.tabular, letterSpacing: -0.3 }}>
                  {INRcompact(p.spent)}
                </div>
              </div>
              <div style={{ padding: 12 }}>
                <div style={{ fontFamily: T.mono, fontSize: 9, color: C.ink3, letterSpacing: 1.2 }}>LEFT</div>
                <div style={{ fontFamily: T.num, fontSize: 18, fontWeight: 600, color: C.accent, marginTop: 2, ...T.tabular, letterSpacing: -0.3 }}>
                  {INRcompact(p.budget - p.spent)}
                </div>
              </div>
            </div>
            <div onClick={() => setProgEdit(true)} style={{ marginTop: 10, cursor: 'pointer' }}>
              <ProgressBar t={t} value={p.spent} max={p.budget} height={3}/>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontFamily: T.mono, fontSize: 10, color: C.ink3, letterSpacing: 0.8 }}>
                <span style={{ color: C.accent, fontWeight: 700 }}>{p.progress}% COMPLETE · EDIT</span>
                <span>{Math.round(p.spent/p.budget*100)}% BUDGET USED</span>
              </div>
            </div>
          </div>
          <Group t={t} header="Project info">
            <Row t={t} title="Start date"       meta={absDate(p.start)}/>
            <Row t={t} title="Target handover"  meta={absDate(p.end)}/>
            <Row t={t} title="Status" onClick={() => setStatusEdit2(true)} chevron
              right={<Pill t={t} tone={p.status === 'Active' ? 'success' : p.status === 'Completed' ? 'default' : 'warning'}>{p.status}</Pill>}/>
            <Row t={t} title="Location"         meta={p.location} chevron last/>
          </Group>
          <Group t={t} header="Spend by category">
            <div style={{ padding: `14px ${S.gutter}px` }}>
              {topCats.map(([key, amt], i) => {
                const cat = CATEGORIES.find(c => c.key === key);
                const pct = amt / spent * 100;
                return (
                  <div key={key} style={{ marginBottom: i === topCats.length - 1 ? 0 : 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Icon name={cat?.icon || 'folder'} size={14} color={C.ink2}/>
                        <span style={{ fontFamily: T.family, fontSize: 13, color: C.ink, fontWeight: 500 }}>{cat?.label}</span>
                      </div>
                      <span style={{ fontFamily: T.num, fontSize: 12, color: C.ink, ...T.tabular }}>{INRcompact(amt)}</span>
                    </div>
                    <ProgressBar t={t} value={pct} max={100} height={4} color={i === 0 ? C.accent : C.ink}/>
                  </div>
                );
              })}
            </div>
          </Group>
          <Group t={t} header="Client">
            <Row t={t} left={<Avatar t={t} name={p.client} size={32}/>}
              title={p.client}
              subtitle="Primary client · Owner"
              right={
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ width: 32, height: 32, border: `1px solid ${C.hairline2}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="phone" size={14} color={C.ink}/>
                  </div>
                  <div style={{ width: 32, height: 32, border: `1px solid ${C.hairline2}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="whatsapp" size={14} color={C.ink}/>
                  </div>
                </div>
              } last/>
          </Group>
        </div>
      )}

      {tab === 'expenses' && (
        <div style={{ padding: `0 0 130px` }}>
          {/* In/Out summary ribbon */}
          <div style={{ padding: `12px ${S.gutter}px 10px` }}>
            <div style={{ display:'flex', border: `1px solid ${C.hairline2}`, background: C.surface2, borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ flex: 1, padding: 10, borderRight: `1px solid ${C.hairline2}` }}>
                <div style={{ fontFamily: T.mono, fontSize: 9, color: C.ink3, letterSpacing: 1.2 }}>RECEIVED</div>
                <div style={{ fontFamily: T.num, fontSize: 15, fontWeight: 600, color: C.success, marginTop: 2, ...T.tabular, letterSpacing: -0.2 }}>
                  +{INRcompact(received)}
                </div>
              </div>
              <div style={{ flex: 1, padding: 10, borderRight: `1px solid ${C.hairline2}` }}>
                <div style={{ fontFamily: T.mono, fontSize: 9, color: C.ink3, letterSpacing: 1.2 }}>SPENT</div>
                <div style={{ fontFamily: T.num, fontSize: 15, fontWeight: 600, color: C.ink, marginTop: 2, ...T.tabular, letterSpacing: -0.2 }}>
                  −{INRcompact(spent)}
                </div>
              </div>
              <div style={{ flex: 1, padding: 10 }}>
                <div style={{ fontFamily: T.mono, fontSize: 9, color: C.ink3, letterSpacing: 1.2 }}>NET</div>
                <div style={{ fontFamily: T.num, fontSize: 15, fontWeight: 600, color: C.accent, marginTop: 2, ...T.tabular, letterSpacing: -0.2 }}>
                  {INRcompact(received - spent)}
                </div>
              </div>
            </div>
          </div>

          {/* Search + filter */}
          <div style={{ padding: `2px ${S.gutter}px 10px`, display: 'flex', gap: 8 }}>
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', height: 40, border: `1px solid ${C.hairline2}`, padding: '0 12px', gap: 8, borderRadius: 10,
            }}>
              <Icon name="search" size={16} color={C.ink3}/>
              <input value={expQ} onChange={e => setExpQ(e.target.value)} placeholder="Search note, vendor, category"
                style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', minWidth: 0,
                  fontFamily: T.family, fontSize: 14, color: C.ink }}/>
              {expQ && (
                <div onClick={() => setExpQ('')} style={{ cursor: 'pointer' }}>
                  <Icon name="close" size={14} color={C.ink3}/>
                </div>
              )}
            </div>
            <button onClick={() => setFilterOpen(true)} style={{
              width: 40, height: 40, border: `1px solid ${activeFilters > 0 ? C.accent : C.hairline2}`,
              background: activeFilters > 0 ? C.accentSoft : C.bg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', borderRadius: 10, position: 'relative', flexShrink: 0,
            }}>
              <Icon name="filter" size={17} color={activeFilters > 0 ? C.accent : C.ink}/>
              {activeFilters > 0 && (
                <div style={{
                  position: 'absolute', top: -5, right: -5,
                  minWidth: 17, height: 17, padding: '0 4px', borderRadius: 9,
                  background: C.accent, color: '#fff',
                  fontFamily: T.family, fontSize: 10, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: `2px solid ${C.bg}`,
                }}>{activeFilters}</div>
              )}
            </button>
          </div>

          {/* Result meta */}
          <div style={{
            padding: `6px ${S.gutter}px 10px`, display:'flex', justifyContent:'space-between', alignItems: 'center',
            fontFamily: T.mono, fontSize: 10, color: C.ink3, letterSpacing: 1.2,
          }}>
            <span>{filteredExp.length} RESULT{filteredExp.length === 1 ? '' : 'S'}{activeFilters > 0 ? ` · ${activeFilters} FILTER${activeFilters === 1 ? '' : 'S'}` : ''}</span>
            <span>Σ {INRcompact(filteredExp.reduce((a,b)=>a+b.amount,0))}</span>
          </div>

          {/* List */}
          {filteredExp.length === 0 ? (
            <EmptyState t={t} icon="inbox" title="No matching entries." sub="Try another filter or clear search."/>
          ) : (
            <div style={{ borderTop: `1px solid ${C.hairline}`, borderBottom: `1px solid ${C.hairline}` }}>
              {filteredExp.map((e, i) => {
                const cat = CATEGORIES.find(c => c.key === e.category);
                return (
                  <Row key={e.id} t={t}
                    onClick={() => onNavigate('expense', e.id)}
                    title={e.note}
                    subtitle={`${cat?.label} · ${e.vendor} · ${relDate(e.date)}`}
                    left={<div style={{ width: 32, height: 32, background: C.surface, border: `1px solid ${C.hairline}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name={cat?.icon || 'folder'} size={14} color={C.ink2}/>
                    </div>}
                    meta={
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontFamily: T.num, fontSize: 14, fontWeight: 600, color: C.ink, ...T.tabular }}>−{INR(e.amount)}</div>
                        <div style={{ fontFamily: T.mono, fontSize: 10, color: e.status === 'Pending' ? C.warning : C.ink3, letterSpacing: 0.5 }}>{e.status.toUpperCase()}</div>
                      </div>
                    }
                    last={i === filteredExp.length - 1}/>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'materials' && <MaterialsTab t={t} projectId={p.id}/>}
      {tab === 'designs' && <DesignsTab t={t} projectId={p.id}/>}
      {tab === 'laminates' && <LaminatesTab t={t} projectId={p.id}/>}
      {tab === 'whiteboard' && <WhiteboardTab t={t} projectId={p.id}/>}

      {tab === 'timeline' && (
        <TimelineTab t={t} projectId={p.id} project={p}/>
      )}

      {tab === 'attendance' && (
        <AttendanceTab t={t} projectId={p.id}/>
      )}

      {tab === 'team' && (
        <div style={{ padding: `10px 0 30px` }}>
          <Group t={t} header={`Assigned team · ${p.team}`}>
            {VENDORS.filter(v => ['Staff','Subcontractor','Client'].includes(v.type)).slice(0, p.team).map((v, i, arr) => (
              <Row key={v.id} t={t} onClick={() => onNavigate('party', v.id)}
                left={<Avatar t={t} name={v.name} size={32}/>}
                title={v.name} subtitle={v.role}
                right={<Pill t={t} tone={v.type === 'Client' ? 'accent' : 'default'}>{v.type}</Pill>}
                chevron last={i === arr.length - 1}/>
            ))}
          </Group>
        </div>
      )}

      <div style={{ height: 40 }}/>

      {/* Sticky bottom action bar (only on Expenses tab) */}
      {tab === 'expenses' && (
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 50,
          padding: `10px ${S.gutter}px 12px`,
          background: 'rgba(255,255,255,0.94)', backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          borderTop: `1px solid ${C.hairline2}`,
          display: 'flex', gap: 8, alignItems: 'center',
        }}>
          <button onClick={() => setPayKind('in')} style={{
            flex: 1, height: 46, border: `1px solid ${C.success}`,
            background: 'rgba(22,163,74,0.08)', color: C.success,
            fontFamily: T.family, fontSize: 14, fontWeight: 600,
            display:'flex', alignItems:'center', justifyContent:'center', gap: 6,
            cursor:'pointer', borderRadius: 10,
          }}>
            <Icon name="download" size={16} color={C.success}/>
            Payment In
          </button>
          <button onClick={() => setPayKind('out')} style={{
            flex: 1, height: 46, border: 'none',
            background: C.accent, color: '#fff',
            fontFamily: T.family, fontSize: 14, fontWeight: 600,
            display:'flex', alignItems:'center', justifyContent:'center', gap: 6,
            cursor:'pointer', borderRadius: 10,
            boxShadow: '0 6px 14px rgba(37,99,235,0.30)',
          }}>
            <Icon name="upload" size={16} color="#fff"/>
            Payment Out
          </button>
        </div>
      )}

      {filterOpen && (
        <FilterSheet t={t}
          onClose={() => setFilterOpen(false)}
          status={expStatus} setStatus={setExpStatus}
          cat={expCat} setCat={setExpCat}
          vendor={expVendor} setVendor={setExpVendor}
          mode={expMode} setMode={setExpMode}
          vendors={expVendors}
          categories={catOptions}
          statuses={statusOpts}
          onClear={() => { setExpStatus('all'); setExpCat('all'); setExpVendor('all'); setExpMode('all'); }}
          activeCount={activeFilters}
          resultCount={filteredExp.length}
        />
      )}

      {payKind && (
        <PaymentSheet t={t} kind={payKind}
          onClose={() => setPayKind(null)}
          onSave={() => { setPayKind(null); doToast(payKind === 'in' ? 'Payment recorded.' : 'Expense saved.'); }}/>
      )}
      {progEdit && (
        <ProgressEditSheet t={t} value={p.progress}
          onSave={(v) => { setPState(s => ({ ...s, progress: v })); setProgEdit(false); doToast(`Progress updated to ${v}%.`); }}
          onClose={() => setProgEdit(false)}/>
      )}
      {statusEdit2 && (
        <StatusEditSheet t={t} project={p}
          onPick={(s) => { setPState(st => ({ ...st, status: s })); setStatusEdit2(false); doToast(`Status set to ${s}.`); }}
          onClose={() => setStatusEdit2(false)}/>
      )}
      {toast && (
        <div style={{
          position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          background: C.ink, color: C.bg, padding: '10px 16px', borderRadius: 4,
          fontFamily: T.family, fontSize: 13, fontWeight: 500, zIndex: 600,
          boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
        }}>{toast}</div>
      )}
    </div>
  );
}

// ── Materials Request tab
function MaterialsTab({ t, projectId }) {
  const { C, T, S } = t;
  const [filter, setFilter] = useSt_P('all');
  const items = [
    { id: 'm1', item: 'Italian Statuario Marble',  qty: '180 sqft', vendor: 'Lafarge Marble Co.',   status: 'Delivered', area: 'Living, Dining',     need: '2026-04-12', note: 'Slab photos approved by client.' },
    { id: 'm2', item: 'Burma Teak Veneer 4x8',     qty: '24 sheets',vendor: 'Sri Lakshmi Timbers',  status: 'Ordered',   area: 'Master Wardrobe',   need: '2026-04-25', note: 'Batch matched. Lead time 5 days.' },
    { id: 'm3', item: 'Jaquar Florentine Faucets', qty: '8 sets',   vendor: 'Jaquar',               status: 'Pending',   area: 'All Bathrooms',     need: '2026-05-02', note: 'Awaiting approval from Vikram.' },
    { id: 'm4', item: 'Philips Track Lights 9W',   qty: '32 pcs',   vendor: 'Havells Lighting',     status: 'Delivered', area: 'Kitchen, Foyer',    need: '2026-04-08', note: '' },
    { id: 'm5', item: 'Saint-Gobain Gypsum Board', qty: '40 sheets',vendor: 'Saint-Gobain',         status: 'Ordered',   area: 'False Ceiling — All',need: '2026-04-22', note: 'Delivery on 21st Apr, morning.' },
    { id: 'm6', item: 'Asian Paints Royale — Taupe',qty: '28 L',    vendor: 'Asian Paints Studio',  status: 'Requested', area: 'Living',             need: '2026-05-08', note: 'Swatch 8214 confirmed.' },
    { id: 'm7', item: 'Hettich soft-close hinges', qty: '120 pcs',  vendor: 'Hameed Carpentry',      status: 'Delivered', area: 'All wardrobes',     need: '2026-04-10', note: '' },
  ];
  const filters = [
    { key: 'all',       label: 'All',       count: items.length },
    { key: 'Requested', label: 'Requested', count: items.filter(i=>i.status==='Requested').length },
    { key: 'Ordered',   label: 'Ordered',   count: items.filter(i=>i.status==='Ordered').length },
    { key: 'Delivered', label: 'Delivered', count: items.filter(i=>i.status==='Delivered').length },
    { key: 'Pending',   label: 'Pending',   count: items.filter(i=>i.status==='Pending').length },
  ];
  const list = filter === 'all' ? items : items.filter(i => i.status === filter);
  const toneFor = (s) => s === 'Delivered' ? 'success' : s === 'Ordered' ? 'accent' : s === 'Pending' ? 'warning' : 'default';

  return (
    <div style={{ padding: `14px 0 40px` }}>
      <div style={{
        padding: `0 ${S.gutter}px 10px`, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ fontFamily: T.mono, fontSize: 10, color: C.ink3, letterSpacing: 1.5 }}>
          MATERIAL REQUESTS · {items.length}
        </div>
        <button style={{
          height: 30, padding: '0 10px', border: 'none', background: C.accent, color: '#fff',
          fontFamily: T.family, fontSize: 12, fontWeight: 600, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 5, borderRadius: 3,
        }}>
          <Icon name="plus" size={14} color="#fff"/> Request
        </button>
      </div>
      <div style={{ paddingBottom: 10 }}>
        <FilterChips t={t} items={filters} value={filter} onChange={setFilter}/>
      </div>
      <div style={{ padding: `4px ${S.gutter}px 0`, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {list.map(m => (
          <div key={m.id} style={{ border: `1px solid ${C.hairline2}`, padding: 12, background: C.bg }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: T.family, fontSize: 14, fontWeight: 600, color: C.ink, letterSpacing: -0.2 }}>{m.item}</div>
                <div style={{ fontFamily: T.family, fontSize: 12, color: C.ink2, marginTop: 2 }}>
                  {m.vendor} · {m.area}
                </div>
              </div>
              <Pill t={t} tone={toneFor(m.status)}>{m.status}</Pill>
            </div>
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontFamily: T.mono, fontSize: 11, color: C.ink, ...T.tabular }}>
                QTY · <span style={{ fontWeight: 600 }}>{m.qty}</span>
              </div>
              <div style={{ fontFamily: T.mono, fontSize: 10, color: C.ink3, letterSpacing: 1 }}>
                NEED BY {absDate(m.need).toUpperCase()}
              </div>
            </div>
            {m.note && (
              <div style={{
                marginTop: 10, padding: 8, background: C.surface, borderLeft: `2px solid ${C.accent}`,
                fontFamily: T.family, fontSize: 12, color: C.ink2, lineHeight: '17px',
              }}>{m.note}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Designs tab — moodboards / drawings
function DesignsTab({ t, projectId }) {
  const { C, T, S } = t;
  const rooms = [
    { k: 'living',  label: 'Living Room',  drawings: 4, revs: 3, status: 'Approved',       updated: '2026-04-14' },
    { k: 'kitchen', label: 'Kitchen',      drawings: 6, revs: 2, status: 'In Review',      updated: '2026-04-17' },
    { k: 'mbr',     label: 'Master Bedroom',drawings: 5,revs: 4, status: 'Approved',       updated: '2026-04-10' },
    { k: 'bath',    label: 'Bathrooms',    drawings: 3, revs: 1, status: 'In Review',      updated: '2026-04-18' },
    { k: 'study',   label: 'Study',        drawings: 2, revs: 2, status: 'Draft',          updated: '2026-04-16' },
    { k: 'foyer',   label: 'Foyer',        drawings: 2, revs: 1, status: 'Approved',       updated: '2026-04-05' },
  ];
  const hatches = [
    'repeating-linear-gradient(45deg, #EFE1DC 0 6px, #F7F7F5 6px 12px)',
    'repeating-linear-gradient(-45deg, #DDE6E2 0 6px, #F7F7F5 6px 12px)',
    'repeating-linear-gradient(90deg, #F2E8D5 0 4px, #F7F7F5 4px 10px)',
    'repeating-linear-gradient(0deg, #E8E2D8 0 5px, #F7F7F5 5px 11px)',
  ];
  const toneFor = (s) => s === 'Approved' ? 'success' : s === 'In Review' ? 'warning' : 'default';

  return (
    <div style={{ padding: `14px 0 40px` }}>
      <div style={{
        padding: `0 ${S.gutter}px 12px`, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ fontFamily: T.mono, fontSize: 10, color: C.ink3, letterSpacing: 1.5 }}>
          DESIGN SHEETS · {rooms.length} ROOMS
        </div>
        <button style={{
          height: 30, padding: '0 10px', border: `1px solid ${C.hairline2}`, background: C.bg, color: C.ink,
          fontFamily: T.family, fontSize: 12, fontWeight: 500, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 5,
        }}>
          <Icon name="upload" size={13} color={C.ink}/> Upload
        </button>
      </div>
      <div style={{
        padding: `0 ${S.gutter}px`,
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
      }}>
        {rooms.map((r, i) => (
          <div key={r.k} style={{ border: `1px solid ${C.hairline2}`, background: C.bg, cursor: 'pointer' }}>
            <div style={{
              aspectRatio: '4/3', background: hatches[i % hatches.length],
              position: 'relative', borderBottom: `1px solid ${C.hairline}`,
            }}>
              {/* floor-plan-ish lines */}
              <svg viewBox="0 0 160 120" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                <rect x="16" y="16" width="128" height="88" fill="none" stroke={C.ink2} strokeWidth="0.8"/>
                <line x1="16" y1="60" x2="90" y2="60" stroke={C.ink2} strokeWidth="0.6"/>
                <line x1="90" y1="16" x2="90" y2="104" stroke={C.ink2} strokeWidth="0.6"/>
                <rect x="96" y="64" width="44" height="36" fill={C.accentSoft} opacity="0.7"/>
                <text x="140" y="112" fill={C.ink3} fontFamily="monospace" fontSize="6" textAnchor="end" letterSpacing="0.5">R-{String(i+1).padStart(2,'0')}</text>
              </svg>
              <div style={{
                position: 'absolute', top: 6, right: 6,
              }}>
                <Pill t={t} tone={toneFor(r.status)}>{r.status}</Pill>
              </div>
            </div>
            <div style={{ padding: 10 }}>
              <div style={{ fontFamily: T.family, fontSize: 13, fontWeight: 600, color: C.ink, letterSpacing: -0.1 }}>{r.label}</div>
              <div style={{ display:'flex', justifyContent:'space-between', marginTop: 4 }}>
                <div style={{ fontFamily: T.mono, fontSize: 10, color: C.ink3, letterSpacing: 0.8 }}>
                  {r.drawings} DWG · v{r.revs}
                </div>
                <div style={{ fontFamily: T.mono, fontSize: 10, color: C.ink3, letterSpacing: 0.8, ...T.tabular }}>
                  {relDate(r.updated).toUpperCase()}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Laminates tab — room × laminate spec
function LaminatesTab({ t, projectId }) {
  const { C, T, S } = t;
  const rooms = [
    { room: 'Master Bedroom', items: [
      { part: 'Wardrobe shutter', code: 'Century 3174 SF',  finish: 'Suede',     color: 'Walnut Crema', sqft: 86 },
      { part: 'Loft',             code: 'Century 2041 PM',  finish: 'Pre-matte', color: 'Ivory',        sqft: 24 },
      { part: 'Dresser',          code: 'Merino 12093 HGL', finish: 'High Gloss', color: 'Champagne',   sqft: 14 },
    ]},
    { room: 'Kitchen', items: [
      { part: 'Base cabinets',    code: 'Greenlam 2001 SUD', finish: 'Suede',     color: 'Graphite',    sqft: 112 },
      { part: 'Wall cabinets',    code: 'Greenlam 1110 ML',  finish: 'Matt Lumen', color: 'Ivory Linen', sqft: 78 },
      { part: 'Tall unit',        code: 'Century 3174 SF',   finish: 'Suede',     color: 'Walnut Crema',sqft: 42 },
    ]},
    { room: 'Living', items: [
      { part: 'TV unit',          code: 'Merino 5003 NTR',   finish: 'Natural',   color: 'Smoked Oak',  sqft: 54 },
      { part: 'Bookshelf',        code: 'Century 2041 PM',   finish: 'Pre-matte', color: 'Ivory',       sqft: 32 },
    ]},
    { room: 'Study', items: [
      { part: 'Desk + storage',   code: 'Greenlam 1104 SF',  finish: 'Suede',     color: 'Bronze',      sqft: 28 },
    ]},
  ];
  const swatch = (color) => {
    const m = { 'Walnut Crema': '#7A4F3A', 'Ivory': '#E8E0CE', 'Champagne': '#D9B98A', 'Graphite': '#3A3A3E', 'Ivory Linen': '#EFE4CE', 'Smoked Oak': '#665243', 'Bronze': '#8B6A3E' };
    return m[color] || '#C8654A';
  };
  return (
    <div style={{ padding: `14px 0 40px` }}>
      <div style={{
        padding: `0 ${S.gutter}px 12px`, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ fontFamily: T.mono, fontSize: 10, color: C.ink3, letterSpacing: 1.5 }}>
          LAMINATE SCHEDULE · 4 ROOMS
        </div>
        <button style={{
          height: 30, padding: '0 10px', border: `1px solid ${C.hairline2}`, background: C.bg, color: C.ink,
          fontFamily: T.family, fontSize: 12, fontWeight: 500, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 5,
        }}>
          <Icon name="download" size={13} color={C.ink}/> Export
        </button>
      </div>
      {rooms.map(r => (
        <div key={r.room} style={{ marginBottom: 14 }}>
          <div style={{
            padding: `0 ${S.gutter}px 6px`,
            fontFamily: T.family, fontSize: 13, fontWeight: 600, color: C.ink, letterSpacing: -0.1,
          }}>{r.room}</div>
          <div style={{ borderTop: `1px solid ${C.hairline}`, borderBottom: `1px solid ${C.hairline}` }}>
            {r.items.map((it, i, arr) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: `10px ${S.gutter}px`,
                borderBottom: i === arr.length - 1 ? 'none' : `1px solid ${C.hairline}`,
              }}>
                <div style={{
                  width: 40, height: 40, background: swatch(it.color),
                  border: `1px solid ${C.hairline2}`, flexShrink: 0, position: 'relative',
                }}>
                  {/* grain lines */}
                  <svg viewBox="0 0 40 40" style={{ position:'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.28 }}>
                    <line x1="0" y1="8"  x2="40" y2="6" stroke="#000" strokeWidth="0.4"/>
                    <line x1="0" y1="18" x2="40" y2="20" stroke="#000" strokeWidth="0.3"/>
                    <line x1="0" y1="28" x2="40" y2="26" stroke="#000" strokeWidth="0.4"/>
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: T.family, fontSize: 13, fontWeight: 600, color: C.ink, letterSpacing: -0.1 }}>
                    {it.part} <span style={{ color: C.ink3, fontWeight: 500 }}>· {it.color}</span>
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: 10, color: C.ink3, letterSpacing: 0.8, marginTop: 2 }}>
                    {it.code.toUpperCase()} · {it.finish.toUpperCase()}
                  </div>
                </div>
                <div style={{ fontFamily: T.num, fontSize: 13, color: C.ink, fontWeight: 600, ...T.tabular }}>
                  {it.sqft} <span style={{ fontSize: 10, color: C.ink3, fontWeight: 500 }}>sqft</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Whiteboard tab — design idea discussion
function WhiteboardTab({ t, projectId }) {
  const { C, T, S } = t;
  const [draft, setDraft] = useSt_P('');
  const notes = [
    { id: 'n1', author: 'Meher Nair',  role: 'Designer',  when: '2026-04-18T14:22:00', kind: 'idea',
      text: 'Proposal: run the travertine from the foyer into the dining — single material, single line. Reads calmer.', pins: 4, replies: 3 },
    { id: 'n2', author: 'Vikram Reddy', role: 'Client',   when: '2026-04-18T20:01:00', kind: 'reply',
      text: 'I like this. Curious how the threshold detail will look with the Italian marble in the living.', pins: 1, replies: 0 },
    { id: 'n3', author: 'Ravi Prakash', role: 'Supervisor', when: '2026-04-19T08:40:00', kind: 'note',
      text: 'Site note: hidden beam above dining needs 40mm drop in ceiling. Will impact uplights.', pins: 2, replies: 1 },
    { id: 'n4', author: 'Meher Nair',  role: 'Designer',  when: '2026-04-19T09:12:00', kind: 'idea',
      text: 'Swap the pendant over the dining to a linear profile — softer, runs with the ceiling fold.', pins: 0, replies: 0 },
  ];
  const kindTone = (k) => k === 'idea' ? 'accent' : k === 'note' ? 'warning' : 'default';
  return (
    <div style={{ padding: `14px 0 30px`, display: 'flex', flexDirection: 'column' }}>
      <div style={{
        padding: `0 ${S.gutter}px 12px`, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ fontFamily: T.mono, fontSize: 10, color: C.ink3, letterSpacing: 1.5 }}>
          WHITEBOARD · {notes.length} NOTES
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ width: 28, height: 28, border: `1px solid ${C.hairline2}`, display: 'flex', alignItems:'center', justifyContent:'center', cursor: 'pointer' }}>
            <Icon name="image" size={14} color={C.ink}/>
          </div>
          <div style={{ width: 28, height: 28, border: `1px solid ${C.hairline2}`, display: 'flex', alignItems:'center', justifyContent:'center', cursor: 'pointer' }}>
            <Icon name="camera" size={14} color={C.ink}/>
          </div>
        </div>
      </div>

      {/* Composer */}
      <div style={{ padding: `0 ${S.gutter}px 14px` }}>
        <div style={{
          border: `1px solid ${C.hairline2}`, background: C.surface2, padding: 10,
        }}>
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Pin an idea, question, or site note…"
            style={{
              width: '100%', minHeight: 60, border: 'none', outline: 'none', resize: 'none', background: 'transparent',
              fontFamily: T.family, fontSize: 14, color: C.ink, lineHeight: '20px',
            }}/>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop: 4 }}>
            <div style={{ display:'flex', gap: 6 }}>
              <Chip t={t} label="Idea"  active={false}/>
              <Chip t={t} label="Note"  active={false}/>
              <Chip t={t} label="Issue" active={false}/>
            </div>
            <button disabled={!draft} style={{
              height: 30, padding: '0 12px', border: 'none',
              background: draft ? C.accent : C.hairline, color: '#fff',
              fontFamily: T.family, fontSize: 12, fontWeight: 600, cursor: draft ? 'pointer' : 'default',
              borderRadius: 3,
            }}>Post</button>
          </div>
        </div>
      </div>

      {/* Notes — pinned-card style */}
      <div style={{ padding: `0 ${S.gutter}px`, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {notes.map(n => (
          <div key={n.id} style={{
            border: `1px solid ${C.hairline2}`, background: C.bg, padding: 12,
            position: 'relative',
          }}>
            {/* corner pin */}
            <div style={{
              position: 'absolute', top: -4, left: 12,
              width: 8, height: 8, background: C.accent, borderRadius: 4,
              boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
            }}/>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar t={t} name={n.author} size={30}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: T.family, fontSize: 13, fontWeight: 600, color: C.ink }}>
                  {n.author} <span style={{ color: C.ink3, fontWeight: 500 }}>· {n.role}</span>
                </div>
                <div style={{ fontFamily: T.mono, fontSize: 10, color: C.ink3, letterSpacing: 0.8 }}>
                  {relDate(n.when).toUpperCase()} · {timeOf(n.when)}
                </div>
              </div>
              <Pill t={t} tone={kindTone(n.kind)}>{n.kind}</Pill>
            </div>
            <div style={{
              fontFamily: T.family, fontSize: 14, color: C.ink, marginTop: 10, lineHeight: '21px',
            }}>{n.text}</div>
            <div style={{
              display: 'flex', gap: 16, marginTop: 10, paddingTop: 10,
              borderTop: `1px dashed ${C.hairline}`,
            }}>
              <div style={{ display:'flex', alignItems:'center', gap: 5, color: C.ink2, cursor:'pointer' }}>
                <Icon name="pin" size={13} color={C.ink2}/>
                <span style={{ fontFamily: T.mono, fontSize: 11, ...T.tabular }}>{n.pins}</span>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap: 5, color: C.ink2, cursor:'pointer' }}>
                <Icon name="chev_r" size={12} color={C.ink2}/>
                <span style={{ fontFamily: T.mono, fontSize: 11, ...T.tabular }}>{n.replies} repl{n.replies === 1 ? 'y' : 'ies'}</span>
              </div>
              <div style={{ flex: 1 }}/>
              <div style={{ display:'flex', alignItems:'center', gap: 5, color: C.ink2, cursor:'pointer' }}>
                <Icon name="more" size={14} color={C.ink2}/>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { ProjectsScreen, ProjectDetailScreen });
