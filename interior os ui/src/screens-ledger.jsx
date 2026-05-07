// Ledger (Expenses list) + Add Expense + Expense detail + Approvals + Parties + More
const { useState: useSt_L } = React;

function LedgerScreen({ t, onNavigate }) {
  const { C, T, S } = t;
  const [tab, setTab] = useSt_L('all');

  const all = [
    ...EXPENSES.map(e => ({ ...e, kind: 'out' })),
    ...INCOME.map(i => ({ ...i, kind: 'in', category: 'income', vendor: i.from, note: i.note })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  const list = tab === 'all' ? all : tab === 'out' ? all.filter(x => x.kind === 'out') : all.filter(x => x.kind === 'in');

  // group by day
  const groups = {};
  list.forEach(x => { const k = x.date.slice(0,10); (groups[k] = groups[k] || []).push(x); });

  const totalOut = EXPENSES.reduce((a,b) => a+b.amount, 0);
  const totalIn  = INCOME.reduce((a,b) => a+b.amount, 0);

  return (
    <div style={{ background: C.bg }}>
      <div style={{ padding: `0 ${S.gutter}px 14px`, display: 'flex', alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: T.mono, fontSize: 10, color: C.ink3, letterSpacing: 1.8 }}>APRIL · 2026</div>
          <div style={{ fontFamily: T.family, fontSize: 26, fontWeight: 600, color: C.ink, marginTop: 2, letterSpacing: -0.6 }}>
            Ledger
          </div>
        </div>
        <div style={{ width: 36, height: 36, border: `1px solid ${C.hairline2}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <Icon name="filter" size={16} color={C.ink}/>
        </div>
      </div>

      {/* Running totals ribbon */}
      <div style={{ padding: `0 ${S.gutter}px 14px` }}>
        <div style={{ display: 'flex', border: `1px solid ${C.hairline2}`, background: C.surface2 }}>
          <div style={{ flex: 1, padding: 12, borderRight: `1px solid ${C.hairline2}` }}>
            <div style={{ fontFamily: T.mono, fontSize: 9, color: C.ink3, letterSpacing: 1.2 }}>INCOME</div>
            <div style={{ fontFamily: T.num, fontSize: 17, fontWeight: 600, color: C.success, marginTop: 2, ...T.tabular, letterSpacing: -0.3 }}>
              +{INRcompact(totalIn)}
            </div>
          </div>
          <div style={{ flex: 1, padding: 12, borderRight: `1px solid ${C.hairline2}` }}>
            <div style={{ fontFamily: T.mono, fontSize: 9, color: C.ink3, letterSpacing: 1.2 }}>EXPENSE</div>
            <div style={{ fontFamily: T.num, fontSize: 17, fontWeight: 600, color: C.ink, marginTop: 2, ...T.tabular, letterSpacing: -0.3 }}>
              −{INRcompact(totalOut)}
            </div>
          </div>
          <div style={{ flex: 1, padding: 12 }}>
            <div style={{ fontFamily: T.mono, fontSize: 9, color: C.ink3, letterSpacing: 1.2 }}>NET</div>
            <div style={{ fontFamily: T.num, fontSize: 17, fontWeight: 600, color: C.accent, marginTop: 2, ...T.tabular, letterSpacing: -0.3 }}>
              {INRcompact(totalIn - totalOut)}
            </div>
          </div>
        </div>
      </div>

      <Segmented t={t} value={tab} onChange={setTab} items={[
        { key: 'all', label: `All · ${all.length}` },
        { key: 'out', label: `Expenses · ${EXPENSES.length}` },
        { key: 'in',  label: `Income · ${INCOME.length}` },
      ]}/>

      <div style={{ padding: '12px 0 30px' }}>
        {Object.keys(groups).length === 0 ? (
          <EmptyState t={t} icon="inbox" title={STR.empty.expenses.title} sub={STR.empty.expenses.sub}/>
        ) : Object.entries(groups).map(([day, items]) => {
          const dayTotal = items.reduce((a, b) => a + (b.kind === 'in' ? b.amount : -b.amount), 0);
          return (
            <div key={day} style={{ marginBottom: 18 }}>
              <div style={{
                padding: `0 ${S.gutter}px 6px`, display: 'flex', justifyContent: 'space-between',
              }}>
                <div style={{ fontFamily: T.mono, fontSize: 10, color: C.ink3, letterSpacing: 1.5 }}>
                  {dateHeader(day)}
                </div>
                <div style={{ fontFamily: T.mono, fontSize: 10, color: dayTotal >= 0 ? C.success : C.ink3, letterSpacing: 0.5, ...T.tabular }}>
                  {dayTotal >= 0 ? '+' : '−'}{INRcompact(Math.abs(dayTotal))}
                </div>
              </div>
              <div style={{ borderTop: `1px solid ${C.hairline}`, borderBottom: `1px solid ${C.hairline}` }}>
                {items.map((x, i) => {
                  const proj = PROJECTS.find(p => p.id === x.project);
                  const cat = CATEGORIES.find(c => c.key === x.category);
                  const isIn = x.kind === 'in';
                  return (
                    <Row key={x.id} t={t}
                      onClick={() => !isIn && onNavigate('expense', x.id)}
                      title={x.note}
                      subtitle={`${proj?.name} · ${isIn ? x.from : x.vendor}`}
                      left={<div style={{ width: 32, height: 32, background: isIn ? 'rgba(31,122,76,0.08)' : C.surface, border: `1px solid ${C.hairline}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon name={isIn ? 'wallet' : (cat?.icon || 'folder')} size={14} color={isIn ? C.success : C.ink2}/>
                      </div>}
                      meta={
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontFamily: T.num, fontSize: 14, fontWeight: 600, color: isIn ? C.success : C.ink, ...T.tabular }}>
                            {isIn ? '+' : '−'}{INR(x.amount)}
                          </div>
                          <div style={{ fontFamily: T.mono, fontSize: 9, color: C.ink3, letterSpacing: 0.5 }}>
                            {timeOf(x.date)} · {x.mode}
                          </div>
                        </div>
                      }
                      last={i === items.length - 1}/>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ height: 40 }}/>
    </div>
  );
}

// ── Add Expense screen
function AddExpenseScreen({ t, onClose, onSave }) {
  const { C, T, S } = t;
  const [amount, setAmount] = useSt_L('');
  const [cat, setCat] = useSt_L('marble');
  const [proj, setProj] = useSt_L('p1');
  const [mode, setMode] = useSt_L('UPI');
  const [vendor, setVendor] = useSt_L('');
  const [note, setNote] = useSt_L('');

  const modes = ['Cash', 'UPI', 'Bank Transfer', 'Card'];
  const project = PROJECTS.find(p => p.id === proj);
  const category = CATEGORIES.find(c => c.key === cat);

  return (
    <div style={{ background: C.bg, height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        padding: `0 ${S.gutter}px 16px`, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: `1px solid ${C.hairline}`,
      }}>
        <div onClick={onClose} style={{ cursor: 'pointer', color: C.ink2, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Icon name="close" size={20} color={C.ink2}/>
        </div>
        <div style={{ fontFamily: T.family, fontSize: 15, fontWeight: 600, color: C.ink }}>New expense</div>
        <div style={{ fontFamily: T.mono, fontSize: 10, color: C.ink3, letterSpacing: 1 }}>DRAFT</div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Amount hero */}
        <div style={{ padding: '28px 20px 24px', textAlign: 'center', borderBottom: `1px solid ${C.hairline}` }}>
          <div style={{ fontFamily: T.mono, fontSize: 10, color: C.ink3, letterSpacing: 1.5 }}>AMOUNT · INR</div>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 10,
          }}>
            <div style={{ fontFamily: T.num, fontSize: 38, color: amount ? C.ink : C.ink3, fontWeight: 600 }}>₹</div>
            <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="0"
              style={{
                border: 'none', outline: 'none', background: 'transparent',
                fontFamily: T.num, fontSize: 48, fontWeight: 700,
                color: C.ink, width: 180, textAlign: 'left', letterSpacing: -1.5,
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

        {/* Mode chips */}
        <div style={{ padding: `14px ${S.gutter}px`, borderBottom: `1px solid ${C.hairline}` }}>
          <div style={{ fontFamily: T.mono, fontSize: 10, color: C.ink3, letterSpacing: 1.5, marginBottom: 10 }}>
            PAID VIA
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {modes.map(m => (
              <Chip key={m} t={t} label={m} active={mode === m} onClick={() => setMode(m)}/>
            ))}
          </div>
        </div>

        {/* Rows */}
        <Group t={t}>
          <Row t={t} title="Project" subtitle={`${project?.client} · ${project?.location}`}
            left={<Icon name="projects" size={18} color={C.ink2}/>}
            meta={project?.name} chevron onClick={() => {}}/>
          <Row t={t} title="Category"
            left={<Icon name={category?.icon || 'folder'} size={18} color={C.ink2}/>}
            meta={category?.label} chevron onClick={() => {}}/>
          <Row t={t} title="Vendor / paid to"
            left={<Icon name="user" size={18} color={C.ink2}/>}
            meta={vendor || 'Choose party'} chevron onClick={() => {}} last/>
        </Group>

        <Group t={t}>
          <InputRow t={t} label="Note" value={note} onChange={setNote} placeholder="What was bought, for which area"/>
          <PickerRow t={t} label="Date" value="Today · 10:34 AM"
            icon={<Icon name="calendar" size={18} color={C.ink2}/>}/>
          <Row t={t} title="Attach receipt"
            left={<Icon name="camera" size={18} color={C.ink2}/>}
            right={<span style={{ fontFamily: T.family, fontSize: 13, color: C.accent, fontWeight: 500 }}>Add photo</span>}
            last/>
        </Group>

        <Group t={t} footer="Submitted for approval if under site-supervisor role.">
          <ToggleRow t={t} label="Mark reimbursable" value={false} onChange={() => {}}/>
          <ToggleRow t={t} label="Bill client" value={true} onChange={() => {}} sub="Add to client's invoice" last/>
        </Group>

        <div style={{ height: 100 }}/>
      </div>

      {/* Footer save */}
      <div style={{ padding: `12px ${S.gutter}px 16px`, borderTop: `1px solid ${C.hairline}`, background: C.bg }}>
        <PrimaryButton t={t} onClick={onSave} disabled={!amount}>Save expense · {amount ? INRcompact(parseInt(amount, 10)) : '₹0'}</PrimaryButton>
      </div>
    </div>
  );
}

// ── Expense detail
function ExpenseDetailScreen({ t, expenseId, onBack }) {
  const { C, T, S } = t;
  const e = EXPENSES.find(x => x.id === expenseId) || EXPENSES[0];
  const proj = PROJECTS.find(p => p.id === e.project);
  const cat = CATEGORIES.find(c => c.key === e.category);
  return (
    <div style={{ background: C.bg }}>
      <div style={{ padding: `0 ${S.gutter}px 10px` }}>
        <div onClick={onBack} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, color: C.ink2, marginBottom: 10 }}>
          <Icon name="chev_l" size={16} color={C.ink2}/>
          <span style={{ fontFamily: T.family, fontSize: 14 }}>Ledger</span>
        </div>
      </div>

      <div style={{ padding: `0 ${S.gutter}px 22px`, textAlign: 'center' }}>
        <div style={{ fontFamily: T.mono, fontSize: 10, color: C.ink3, letterSpacing: 1.5 }}>EXPENSE · {e.id.toUpperCase()}</div>
        <div style={{ fontFamily: T.num, fontSize: 38, fontWeight: 700, color: C.ink, marginTop: 8, letterSpacing: -1.2, ...T.tabular }}>
          −{INR(e.amount)}
        </div>
        <div style={{ fontFamily: T.family, fontSize: 14, color: C.ink2, marginTop: 4 }}>
          {e.note}
        </div>
        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'center', gap: 8 }}>
          <Pill t={t} tone={e.status === 'Pending' ? 'warning' : 'success'}>{e.status}</Pill>
          <Pill t={t}>{e.mode}</Pill>
        </div>
      </div>

      {/* Receipt thumbnail */}
      <div style={{ padding: `0 ${S.gutter}px 22px` }}>
        <div style={{
          height: 180, background: C.surface, border: `1px solid ${C.hairline}`,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
        }}>
          <Icon name="receipt" size={36} color={C.ink3} strokeWidth={1}/>
          <span style={{ fontFamily: T.mono, fontSize: 10, color: C.ink3, letterSpacing: 1 }}>RECEIPT · IMG_04{e.id.slice(1)}.jpg</span>
          <span style={{ fontFamily: T.family, fontSize: 13, color: C.accent, fontWeight: 500, cursor: 'pointer' }}>View full</span>
        </div>
      </div>

      <Group t={t} header="Details">
        <Row t={t} title="Project" meta={proj?.name} chevron/>
        <Row t={t} title="Category" meta={cat?.label} left={<Icon name={cat?.icon||'folder'} size={16} color={C.ink2}/>}/>
        <Row t={t} title="Vendor" meta={e.vendor} chevron/>
        <Row t={t} title="Date" meta={absDate(e.date) + ' · ' + timeOf(e.date)}/>
        <Row t={t} title="Paid by" meta={e.by} last/>
      </Group>

      <Group t={t}>
        <Row t={t} title="Edit" left={<Icon name="edit" size={18} color={C.ink2}/>} chevron/>
        <Row t={t} title="Duplicate" left={<Icon name="copy" size={18} color={C.ink2}/>} chevron/>
        <Row t={t} title="Delete expense" destructive left={<Icon name="trash" size={18} color={C.danger}/>} last/>
      </Group>
      <div style={{ height: 40 }}/>
    </div>
  );
}

// ── Approvals
function ApprovalsScreen({ t, onNavigate, onBack }) {
  const { C, T, S } = t;
  const [items, setItems] = useSt_L(APPROVALS);

  const act = (id, action) => {
    setItems(items.filter(x => x.id !== id));
  };

  const total = items.reduce((a,b) => a+b.amount, 0);

  return (
    <div style={{ background: C.bg }}>
      <div style={{ padding: `0 ${S.gutter}px 10px` }}>
        <div onClick={onBack} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, color: C.ink2, marginBottom: 10 }}>
          <Icon name="chev_l" size={16} color={C.ink2}/>
          <span style={{ fontFamily: T.family, fontSize: 14 }}>Home</span>
        </div>
        <div style={{ fontFamily: T.mono, fontSize: 10, color: C.ink3, letterSpacing: 1.8 }}>
          {items.length} PENDING · {INRcompact(total)}
        </div>
        <div style={{ fontFamily: T.family, fontSize: 26, fontWeight: 600, color: C.ink, marginTop: 2, letterSpacing: -0.6 }}>
          Approvals
        </div>
        <div style={{ fontFamily: T.family, fontSize: 13, color: C.ink2, marginTop: 4 }}>
          Submitted by site supervisors · swipe to act.
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState t={t} icon="check_circle" title={STR.empty.approvals.title} sub={STR.empty.approvals.sub}/>
      ) : (
        <div style={{ padding: `20px ${S.gutter}px 30px`, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map(a => {
            const proj = PROJECTS.find(p => p.id === a.project);
            const cat = CATEGORIES.find(c => c.key === a.category);
            return (
              <div key={a.id} style={{ border: `1px solid ${C.hairline2}`, background: C.bg }}>
                <div style={{ padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Avatar t={t} name={a.submitter} size={32}/>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: T.family, fontSize: 13, fontWeight: 600, color: C.ink }}>{a.submitter}</div>
                      <div style={{ fontFamily: T.mono, fontSize: 10, color: C.ink3, letterSpacing: 0.8 }}>
                        {relDate(a.submitted).toUpperCase()} · {timeOf(a.submitted)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: T.num, fontSize: 20, fontWeight: 700, color: C.ink, letterSpacing: -0.4, ...T.tabular }}>
                        ₹{a.amount.toLocaleString('en-IN')}
                      </div>
                    </div>
                  </div>
                  <div style={{ marginTop: 12, padding: 10, background: C.surface, borderLeft: `2px solid ${C.accent}` }}>
                    <div style={{ fontFamily: T.family, fontSize: 13, color: C.ink, fontWeight: 500 }}>{a.note}</div>
                    <div style={{ marginTop: 6, display: 'flex', gap: 10, alignItems: 'center' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Icon name={cat?.icon || 'folder'} size={12} color={C.ink3}/>
                        <span style={{ fontFamily: T.mono, fontSize: 10, color: C.ink3, letterSpacing: 0.8 }}>{cat?.label.toUpperCase()}</span>
                      </div>
                      <span style={{ fontFamily: T.mono, fontSize: 10, color: C.ink3, letterSpacing: 0.8 }}>·</span>
                      <span style={{ fontFamily: T.mono, fontSize: 10, color: C.ink3, letterSpacing: 0.8 }}>{proj?.name?.toUpperCase()}</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', borderTop: `1px solid ${C.hairline}` }}>
                  <div onClick={() => act(a.id, 'reject')} style={{
                    flex: 1, padding: '12px 0', textAlign: 'center', cursor: 'pointer',
                    borderRight: `1px solid ${C.hairline}`,
                    fontFamily: T.family, fontSize: 14, fontWeight: 500, color: C.danger,
                  }}>Reject</div>
                  <div onClick={() => act(a.id, 'approve')} style={{
                    flex: 1, padding: '12px 0', textAlign: 'center', cursor: 'pointer',
                    fontFamily: T.family, fontSize: 14, fontWeight: 600, color: C.accent,
                  }}>Approve</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div style={{ height: 30 }}/>
    </div>
  );
}

// ── Parties (directory)
function PartiesScreen({ t, onNavigate, onBack }) {
  const { C, T, S } = t;
  const [tab, setTab] = useSt_L('all');

  const tabs = [
    { key: 'all',         label: 'All' },
    { key: 'Client',      label: 'Clients' },
    { key: 'Vendor',      label: 'Vendors' },
    { key: 'Subcontractor', label: 'Subs' },
    { key: 'Staff',       label: 'Staff' },
  ];

  const list = tab === 'all' ? VENDORS : VENDORS.filter(v => v.type === tab);
  // group alpha
  const groups = {};
  list.forEach(v => { const k = v.name[0].toUpperCase(); (groups[k] = groups[k] || []).push(v); });
  const letters = Object.keys(groups).sort();

  const totalOwed = VENDORS.filter(v => v.balance < 0).reduce((a,b) => a + b.balance, 0);
  const totalOwe  = VENDORS.filter(v => v.balance > 0).reduce((a,b) => a + b.balance, 0);

  return (
    <div style={{ background: C.bg }}>
      <div style={{ padding: `0 ${S.gutter}px 14px` }}>
        <div onClick={onBack} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, color: C.ink2, marginBottom: 10 }}>
          <Icon name="chev_l" size={16} color={C.ink2}/>
          <span style={{ fontFamily: T.family, fontSize: 14 }}>More</span>
        </div>
        <div style={{ fontFamily: T.mono, fontSize: 10, color: C.ink3, letterSpacing: 1.8 }}>{VENDORS.length} CONTACTS</div>
        <div style={{ fontFamily: T.family, fontSize: 26, fontWeight: 600, color: C.ink, marginTop: 2, letterSpacing: -0.6 }}>
          Parties
        </div>
      </div>
      <div style={{ padding: `0 ${S.gutter}px 12px` }}>
        <div style={{ display: 'flex', border: `1px solid ${C.hairline2}`, background: C.surface2 }}>
          <div style={{ flex: 1, padding: 12, borderRight: `1px solid ${C.hairline2}` }}>
            <div style={{ fontFamily: T.mono, fontSize: 9, color: C.ink3, letterSpacing: 1.2 }}>YOU OWE</div>
            <div style={{ fontFamily: T.num, fontSize: 17, fontWeight: 600, color: C.danger, marginTop: 2, ...T.tabular }}>
              {INRcompact(Math.abs(totalOwed))}
            </div>
          </div>
          <div style={{ flex: 1, padding: 12 }}>
            <div style={{ fontFamily: T.mono, fontSize: 9, color: C.ink3, letterSpacing: 1.2 }}>RECEIVABLE</div>
            <div style={{ fontFamily: T.num, fontSize: 17, fontWeight: 600, color: C.success, marginTop: 2, ...T.tabular }}>
              {INRcompact(totalOwe)}
            </div>
          </div>
        </div>
      </div>

      <Segmented t={t} value={tab} onChange={setTab} items={tabs}/>

      <div style={{ padding: '12px 0 30px' }}>
        {letters.map(L => (
          <div key={L}>
            <div style={{
              padding: `6px ${S.gutter}px`, fontFamily: T.mono, fontSize: 10,
              color: C.ink3, letterSpacing: 1.5, background: C.surface,
            }}>{L}</div>
            <div style={{ borderTop: `1px solid ${C.hairline}`, borderBottom: `1px solid ${C.hairline}` }}>
              {groups[L].map((v, i, arr) => (
                <Row key={v.id} t={t} onClick={() => onNavigate('party', v.id)}
                  left={<Avatar t={t} name={v.name} size={36}/>}
                  title={v.name}
                  subtitle={`${v.role} · ${v.phone}`}
                  meta={
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: T.num, fontSize: 13, fontWeight: 600,
                        color: v.balance === 0 ? C.ink3 : v.balance < 0 ? C.danger : C.success, ...T.tabular }}>
                        {v.balance === 0 ? '—' : (v.balance < 0 ? '−' : '+') + INRcompact(Math.abs(v.balance)).replace('₹', '₹')}
                      </div>
                      <div style={{ fontFamily: T.mono, fontSize: 9, color: C.ink3, letterSpacing: 0.8 }}>
                        {v.balance === 0 ? 'SETTLED' : v.balance < 0 ? 'PAYABLE' : 'RECEIVABLE'}
                      </div>
                    </div>
                  }
                  chevron last={i === arr.length - 1}/>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div style={{ height: 30 }}/>
    </div>
  );
}

function PartyDetailScreen({ t, partyId, onBack }) {
  const { C, T, S } = t;
  const v = VENDORS.find(x => x.id === partyId) || VENDORS[0];
  const txs = EXPENSES.filter(e => e.vendor === v.name);
  return (
    <div style={{ background: C.bg }}>
      <div style={{ padding: `0 ${S.gutter}px 16px` }}>
        <div onClick={onBack} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, color: C.ink2, marginBottom: 10 }}>
          <Icon name="chev_l" size={16} color={C.ink2}/>
          <span style={{ fontFamily: T.family, fontSize: 14 }}>Parties</span>
        </div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <Avatar t={t} name={v.name} size={56}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: T.family, fontSize: 20, fontWeight: 600, color: C.ink, letterSpacing: -0.4 }}>
              {v.name}
            </div>
            <div style={{ fontFamily: T.family, fontSize: 13, color: C.ink2, marginTop: 2 }}>{v.role}</div>
            <div style={{ fontFamily: T.mono, fontSize: 11, color: C.ink3, marginTop: 2, ...T.tabular }}>{v.phone}</div>
          </div>
        </div>
        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <SecondaryButton t={t} icon="phone" style={{ height: 40 }}>Call</SecondaryButton>
          <SecondaryButton t={t} icon="whatsapp" style={{ height: 40 }}>Message</SecondaryButton>
        </div>
      </div>
      <Group t={t}>
        <Row t={t} title="Balance"
          meta={<span style={{
            fontFamily: 'inherit', color: v.balance === 0 ? C.ink3 : v.balance < 0 ? C.danger : C.success,
            fontWeight: 600,
          }}>{v.balance === 0 ? 'Settled' : (v.balance < 0 ? 'You owe ' : 'Receivable ') + INR(Math.abs(v.balance))}</span>}/>
        <Row t={t} title="Role" meta={v.type}/>
        <Row t={t} title="Settle up" left={<Icon name="wallet" size={18} color={C.ink2}/>} chevron last/>
      </Group>

      <Group t={t} header={`Transactions · ${txs.length}`}>
        {txs.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', fontFamily: T.family, fontSize: 13, color: C.ink3 }}>No transactions yet.</div>
        ) : txs.map((e, i) => {
          const proj = PROJECTS.find(p => p.id === e.project);
          return (
            <Row key={e.id} t={t}
              title={e.note}
              subtitle={`${proj?.name} · ${relDate(e.date)}`}
              meta={<span style={{ fontFamily: T.num, fontWeight: 600, color: C.ink, ...T.tabular }}>−{INR(e.amount)}</span>}
              last={i === txs.length - 1}/>
          );
        })}
      </Group>
      <div style={{ height: 40 }}/>
    </div>
  );
}

// ── More
function MoreScreen({ t, onNavigate, onSignOut }) {
  const { C, T, S } = t;
  return (
    <div style={{ background: C.bg }}>
      <div style={{ padding: `0 ${S.gutter}px 20px` }}>
        <div style={{ fontFamily: T.mono, fontSize: 10, color: C.ink3, letterSpacing: 1.8 }}>ACCOUNT</div>
        <div style={{ fontFamily: T.family, fontSize: 26, fontWeight: 600, color: C.ink, marginTop: 2, letterSpacing: -0.6 }}>
          More
        </div>
      </div>

      {/* profile card */}
      <div style={{ padding: `0 ${S.gutter}px 22px` }}>
        <div onClick={() => onNavigate('studio')} style={{
          border: `1px solid ${C.hairline2}`, padding: 14, display: 'flex', alignItems: 'center', gap: 14,
          background: C.surface2, cursor: 'pointer', borderRadius: 12,
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12, background: '#fff',
            border: `1px solid ${C.hairline2}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ fontFamily: T.family, fontSize: 17, fontWeight: 700, color: C.accent, letterSpacing: -0.5 }}>SA</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: T.family, fontSize: 15, fontWeight: 700, color: C.ink, letterSpacing: -0.2 }}>Studio Atelier</div>
            <div style={{ fontFamily: T.family, fontSize: 12, color: C.ink2 }}>Banjara Hills · Hyderabad</div>
            <div style={{ fontFamily: T.family, fontSize: 10.5, color: C.ink3, marginTop: 2, letterSpacing: 0.5, fontWeight: 600 }}>
              GSTIN · 36ABCDE1234F1Z5
            </div>
          </div>
          <Icon name="chev_r" size={14} color={C.ink3}/>
        </div>
      </div>

      <Group t={t} header="Workspace">
        <Row t={t} title="Ledger" subtitle="All transactions across projects"
          left={<Icon name="ledger" size={18} color={C.ink2}/>} chevron
          onClick={() => onNavigate('ledger')}/>
        <Row t={t} title="Appointments" subtitle="Site visits, reviews, pitches"
          left={<Icon name="calendar" size={18} color={C.ink2}/>} chevron
          onClick={() => onNavigate('appointments')}/>
        <Row t={t} title="Parties" subtitle="Clients, vendors, subs, staff"
          left={<Icon name="users" size={18} color={C.ink2}/>} chevron
          onClick={() => onNavigate('parties')}/>
        <Row t={t} title="Approvals"
          left={<Icon name="check_circle" size={18} color={C.ink2}/>}
          right={<Pill t={t} tone="accent">{APPROVALS.length}</Pill>} chevron
          onClick={() => onNavigate('approvals')}/>
        <Row t={t} title="Reports"     left={<Icon name="chart" size={18} color={C.ink2}/>} chevron/>
        <Row t={t} title="Documents"   left={<Icon name="folder" size={18} color={C.ink2}/>} chevron last/>
      </Group>
      <Group t={t} header="Studio">
        <Row t={t} title="Tax settings"    left={<Icon name="archive" size={18} color={C.ink2}/>} meta="GST 18%" chevron/>
        <Row t={t} title="Categories"      left={<Icon name="tag" size={18} color={C.ink2}/>} meta={`${CATEGORIES.length}`} chevron/>
        <Row t={t} title="Team & roles"    left={<Icon name="shield" size={18} color={C.ink2}/>} meta="5 members" chevron/>
        <Row t={t} title="Export to CA"    left={<Icon name="download" size={18} color={C.ink2}/>} chevron last/>
      </Group>
      <Group t={t} header="App">
        <Row t={t} title="Components library" subtitle="Visual reference of every primitive"
          left={<Icon name="sparkle" size={18} color={C.ink2}/>} chevron
          onClick={() => onNavigate('components')}/>
        <Row t={t} title="Appearance" left={<Icon name="moon" size={18} color={C.ink2}/>} meta="Light" chevron/>
        <Row t={t} title="Language"   left={<Icon name="globe" size={18} color={C.ink2}/>} meta="English" chevron/>
        <Row t={t} title="Help & support" left={<Icon name="help" size={18} color={C.ink2}/>} chevron/>
        <Row t={t} title="About InteriorOS" left={<Icon name="info" size={18} color={C.ink2}/>} meta="v1.0.0" last/>
      </Group>
      <Group t={t}>
        <Row t={t} title="Sign out" destructive left={<Icon name="logout" size={18} color={C.danger}/>}
          onClick={onSignOut} last/>
      </Group>
      <div style={{
        padding: `8px ${S.gutter}px 30px`, textAlign: 'center',
        fontFamily: T.mono, fontSize: 10, color: C.ink3, letterSpacing: 1.5,
      }}>INTERIOROS · v1.0.0 · BUILD 246</div>
      <div style={{ height: 40 }}/>
    </div>
  );
}

Object.assign(window, {
  LedgerScreen, AddExpenseScreen, ExpenseDetailScreen,
  ApprovalsScreen, PartiesScreen, PartyDetailScreen, MoreScreen,
});
