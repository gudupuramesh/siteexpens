// Leads & Appointments screens — sales pipeline + scheduling
const { useState: useSt_LA, useMemo: useMemo_LA } = React;

// ── Lead pipeline panel (shown inside CRMScreen)
function LeadsPanel({ t, onNavigate }) {
  const { C, T, S } = t;
  const [view, setView] = useSt_LA('list'); // list | board
  const [stage, setStage] = useSt_LA('all');
  const [q, setQ] = useSt_LA('');

  const stages = ['New','Contacted','Qualified','Proposal','Negotiation','Won','Lost'];
  const stageMeta = {
    'New':         { tone: 'accent',  dot: '#2563EB' },
    'Contacted':   { tone: 'default', dot: '#0EA5E9' },
    'Qualified':   { tone: 'default', dot: '#0D9488' },
    'Proposal':    { tone: 'warning', dot: '#D97706' },
    'Negotiation': { tone: 'warning', dot: '#F59E0B' },
    'Won':         { tone: 'success', dot: '#0F9D58' },
    'Lost':        { tone: 'danger',  dot: '#DC2626' },
  };
  const scoreTone = (s) => s === 'Hot' ? 'danger' : s === 'Warm' ? 'warning' : 'default';

  const filters = [{ key: 'all', label: 'All', count: LEADS.length },
    ...stages.map(s => ({ key: s, label: s, count: LEADS.filter(l => l.stage === s).length }))];

  let list = LEADS;
  if (stage !== 'all') list = list.filter(l => l.stage === stage);
  if (q) list = list.filter(l => (l.name + l.city + l.type + l.source).toLowerCase().includes(q.toLowerCase()));

  // KPIs
  const totalValue = LEADS.filter(l => !['Lost','Won'].includes(l.stage)).reduce((a,b) => a + b.budget, 0);
  const won = LEADS.filter(l => l.stage === 'Won').length;
  const conv = Math.round(won / LEADS.length * 100);
  const hot = LEADS.filter(l => l.score === 'Hot' && !['Won','Lost'].includes(l.stage)).length;

  return (
    <div style={{ background: C.surface, minHeight: '100%' }}>
      <div style={{ padding: `12px ${S.gutter}px`, background: C.bg, borderBottom: `1px solid ${C.hairline2}` }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <StatusCard t={t} label="Pipeline" value={INRcompact(totalValue)} sub={`${LEADS.length - won - LEADS.filter(l=>l.stage==='Lost').length} open`} icon="target"/>
          <StatusCard t={t} label="Hot" value={hot} sub="needs follow-up" tone="danger" icon="sparkle"/>
          <StatusCard t={t} label="Conv" value={`${conv}%`} sub={`${won} won this Q`} tone="success" icon="check_circle"/>
        </div>
      </div>

      <div style={{
        padding: `10px ${S.gutter}px`, background: C.bg, borderBottom: `1px solid ${C.hairline2}`,
        display: 'flex', gap: 8, alignItems: 'center',
      }}>
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', height: 38, padding: '0 12px', borderRadius: 8,
          background: C.surface2, border: `1px solid ${C.hairline}`, gap: 8,
        }}>
          <Icon name="search" size={15} color={C.ink3}/>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search leads…"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontFamily: T.family, fontSize: 14, color: C.ink }}/>
        </div>
        <div style={{ display: 'flex', borderRadius: 8, border: `1px solid ${C.hairline2}`, overflow: 'hidden' }}>
          <div onClick={() => setView('list')} style={{
            padding: '0 10px', height: 38, display: 'flex', alignItems: 'center',
            background: view === 'list' ? C.ink : C.bg, color: view === 'list' ? '#fff' : C.ink2, cursor: 'pointer',
          }}>
            <Icon name="filter" size={15} color={view === 'list' ? '#fff' : C.ink2}/>
          </div>
          <div onClick={() => setView('board')} style={{
            padding: '0 10px', height: 38, display: 'flex', alignItems: 'center',
            background: view === 'board' ? C.ink : C.bg, color: view === 'board' ? '#fff' : C.ink2, cursor: 'pointer', borderLeft: `1px solid ${C.hairline2}`,
          }}>
            <Icon name="clipboard" size={15} color={view === 'board' ? '#fff' : C.ink2}/>
          </div>
        </div>
      </div>

      {view === 'list' && (
        <>
          <div style={{ padding: '10px 0', background: C.bg, borderBottom: `1px solid ${C.hairline2}` }}>
            <FilterChips t={t} items={filters} value={stage} onChange={setStage}/>
          </div>

          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {list.length === 0 ? (
              <div style={{ background: C.bg, borderRadius: S.radius, border: `1px solid ${C.hairline2}` }}>
                <EmptyState t={t} icon="inbox" title="No leads match." sub="Try a different stage or clear search."/>
              </div>
            ) : list.map(l => {
              const sm = stageMeta[l.stage];
              return (
                <div key={l.id} onClick={() => onNavigate('lead-preview', l.id)} style={{
                  padding: 14, borderRadius: S.radius, background: C.bg, cursor: 'pointer',
                  border: `1px solid ${C.hairline2}`, boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Avatar t={t} name={l.name} size={36}/>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontFamily: T.family, fontSize: 15, fontWeight: 600, color: C.ink, letterSpacing: -0.2 }}>{l.name}</span>
                        <Pill t={t} tone={scoreTone(l.score)} dot>{l.score}</Pill>
                      </div>
                      <div style={{ fontFamily: T.family, fontSize: 12, color: C.ink2, marginTop: 2 }}>
                        {l.type} · {l.city}
                      </div>
                    </div>
                    <Pill t={t} tone={sm.tone} dot>{l.stage}</Pill>
                  </div>

                  <div style={{
                    marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.hairline}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <div>
                      <div style={{ fontFamily: T.family, fontSize: 10, color: C.ink3, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>Budget</div>
                      <div style={{ fontFamily: T.num, fontSize: 14, fontWeight: 700, color: C.ink, ...T.tabular }}>{INRcompact(l.budget)}</div>
                    </div>
                    <div>
                      <div style={{ fontFamily: T.family, fontSize: 10, color: C.ink3, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>Source</div>
                      <div style={{ fontFamily: T.family, fontSize: 13, color: C.ink, fontWeight: 500 }}>{l.source}</div>
                    </div>
                    <div>
                      <div style={{ fontFamily: T.family, fontSize: 10, color: C.ink3, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>Created</div>
                      <div style={{ fontFamily: T.family, fontSize: 13, color: C.ink, fontWeight: 500 }}>{relDate(l.created)}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <IconButton t={t} icon="phone" size={32}/>
                      <IconButton t={t} icon="whatsapp" size={32}/>
                    </div>
                  </div>

                  {l.note && (
                    <div style={{
                      marginTop: 10, padding: 10, borderRadius: 6,
                      background: C.surface2, fontFamily: T.family, fontSize: 12, color: C.ink2, lineHeight: '17px',
                    }}>{l.note}</div>
                  )}
                </div>
              );
            })}
            <div style={{ height: 30 }}/>
          </div>
        </>
      )}

      {view === 'board' && (
        <div style={{ padding: 12, overflowX: 'auto' }} className="no-scrollbar">
          <div style={{ display: 'flex', gap: 10, minWidth: 'max-content' }}>
            {stages.map(s => {
              const items = LEADS.filter(l => l.stage === s);
              const total = items.reduce((a,b) => a + b.budget, 0);
              const sm = stageMeta[s];
              return (
                <div key={s} style={{ width: 220, flexShrink: 0 }}>
                  <div style={{
                    padding: '8px 10px', borderRadius: 8,
                    background: C.bg, border: `1px solid ${C.hairline2}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 4, background: sm.dot }}/>
                      <span style={{ fontFamily: T.family, fontSize: 12, fontWeight: 700, color: C.ink, letterSpacing: 0.2 }}>{s}</span>
                    </div>
                    <span style={{ fontFamily: T.family, fontSize: 11, color: C.ink3, fontWeight: 600 }}>{items.length}</span>
                  </div>
                  <div style={{ fontFamily: T.num, fontSize: 11, color: C.ink3, ...T.tabular, padding: '6px 4px 8px' }}>
                    {INRcompact(total)} pipeline
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {items.map(l => (
                      <div key={l.id} onClick={() => onNavigate('lead-preview', l.id)} style={{
                        padding: 10, borderRadius: 8, background: C.bg, cursor: 'pointer',
                        border: `1px solid ${C.hairline2}`, boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontFamily: T.family, fontSize: 13, fontWeight: 600, color: C.ink, letterSpacing: -0.1 }}>{l.name}</span>
                          <Pill t={t} tone={scoreTone(l.score)}>{l.score}</Pill>
                        </div>
                        <div style={{ fontFamily: T.family, fontSize: 11, color: C.ink2, marginTop: 2 }}>{l.type}</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                          <span style={{ fontFamily: T.num, fontSize: 12, color: C.ink, fontWeight: 700, ...T.tabular }}>{INRcompact(l.budget)}</span>
                          <span style={{ fontFamily: T.family, fontSize: 10, color: C.ink3 }}>{l.source}</span>
                        </div>
                      </div>
                    ))}
                    {items.length === 0 && (
                      <div style={{
                        padding: 14, textAlign: 'center', borderRadius: 8,
                        border: `1px dashed ${C.hairline2}`, fontFamily: T.family, fontSize: 11, color: C.ink3,
                      }}>Nothing here yet</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Appointments panel (inside CRMScreen)
function AppointmentsPanel({ t, onNavigate }) {
  const { C, T, S } = t;
  const [tab, setTab] = useSt_LA('upcoming'); // upcoming | calendar
  const [day, setDay] = useSt_LA(0); // 0..6 from today

  const today = new Date('2026-04-25T08:00:00');
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today); d.setDate(today.getDate() + i);
    return d;
  });

  const kindMeta = {
    Site:   { tone: 'success', dot: '#0F9D58' },
    Review: { tone: 'accent',  dot: '#2563EB' },
    Pitch:  { tone: 'warning', dot: '#D97706' },
    Vendor: { tone: 'default', dot: '#94A3B8' },
  };

  const sameDay = (a, b) => new Date(a).toDateString() === b.toDateString();
  const todayItems = APPOINTMENTS.filter(a => sameDay(a.start, days[day]))
    .sort((a, b) => new Date(a.start) - new Date(b.start));

  const fmtTime = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  const fmtRange = (s, e) => `${fmtTime(s)} → ${fmtTime(e)}`;

  return (
    <div style={{ background: C.surface, minHeight: '100%' }}>
      <div style={{ padding: `12px ${S.gutter}px`, background: C.bg, borderBottom: `1px solid ${C.hairline2}` }}>
        {/* 7-day strip */}
        <div style={{ display: 'flex', gap: 6 }}>
          {days.map((d, i) => {
            const active = i === day;
            const items = APPOINTMENTS.filter(a => sameDay(a.start, d));
            const dayName = d.toLocaleDateString('en-IN', { weekday: 'short' });
            return (
              <div key={i} onClick={() => setDay(i)} style={{
                flex: 1, padding: '8px 0', borderRadius: 10,
                background: active ? C.accent : C.bg,
                border: `1px solid ${active ? C.accent : C.hairline2}`,
                color: active ? '#fff' : C.ink, cursor: 'pointer', textAlign: 'center',
                position: 'relative',
              }}>
                <div style={{
                  fontFamily: T.family, fontSize: 9.5, fontWeight: 700,
                  letterSpacing: 0.6, textTransform: 'uppercase',
                  color: active ? 'rgba(255,255,255,0.85)' : C.ink3,
                }}>{dayName}</div>
                <div style={{
                  fontFamily: T.num, fontSize: 18, fontWeight: 700,
                  color: active ? '#fff' : C.ink, ...T.tabular, marginTop: 2,
                }}>{d.getDate()}</div>
                {items.length > 0 && (
                  <div style={{
                    position: 'absolute', bottom: 4, left: '50%', transform: 'translateX(-50%)',
                    display: 'flex', gap: 2,
                  }}>
                    {Array.from({ length: Math.min(items.length, 3) }).map((_, j) => (
                      <span key={j} style={{
                        width: 4, height: 4, borderRadius: 2,
                        background: active ? '#fff' : C.accent,
                      }}/>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Day header */}
      <div style={{
        padding: `12px ${S.gutter}px 8px`,
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontFamily: T.family, fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: -0.2 }}>
            {days[day].toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
          <div style={{ fontFamily: T.family, fontSize: 11, color: C.ink2, marginTop: 1 }}>
            {todayItems.length === 0 ? 'No appointments' : `${todayItems.length} appointment${todayItems.length === 1 ? '' : 's'}`}
          </div>
        </div>
        {todayItems.length > 0 && (
          <span style={{ fontFamily: T.family, fontSize: 11, color: C.ink3, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>
            Day plan
          </span>
        )}
      </div>

      {todayItems.length === 0 ? (
        <div style={{ padding: 12 }}>
          <div style={{ background: C.bg, border: `1px solid ${C.hairline2}`, borderRadius: S.radius }}>
            <EmptyState t={t} icon="calendar" title="Free day." sub="Use it to catch up with site teams or review BOQs."/>
          </div>
        </div>
      ) : (
        <div style={{ padding: `0 ${S.gutter}px 30px` }}>
          {todayItems.map((a, i) => {
            const km = kindMeta[a.kind];
            const tentative = a.stage === 'Tentative';
            return (
              <div key={a.id} style={{ display: 'flex', gap: 10 }}>
                {/* Time gutter */}
                <div style={{ width: 60, flexShrink: 0, paddingTop: 14 }}>
                  <div style={{ fontFamily: T.num, fontSize: 13, fontWeight: 700, color: C.ink, ...T.tabular, letterSpacing: -0.2 }}>
                    {fmtTime(a.start)}
                  </div>
                  <div style={{ fontFamily: T.num, fontSize: 10, color: C.ink3, ...T.tabular, marginTop: 1 }}>
                    {fmtTime(a.end)}
                  </div>
                </div>

                {/* Track */}
                <div style={{ width: 14, flexShrink: 0, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 18 }}>
                  <div style={{
                    width: 12, height: 12, borderRadius: 6,
                    background: tentative ? C.bg : km.dot,
                    border: `2px solid ${km.dot}`, flexShrink: 0,
                  }}/>
                  {i < todayItems.length - 1 && <div style={{ flex: 1, width: 1.5, background: C.hairline2, marginTop: 2 }}/>}
                </div>

                {/* Card */}
                <div style={{ flex: 1, padding: '10px 0 18px' }}>
                  <div onClick={() => onNavigate('appt-preview', a.id)} style={{
                    padding: 12, borderRadius: S.radius, background: C.bg, cursor: 'pointer',
                    border: `1px solid ${tentative ? C.warning : C.hairline2}`,
                    boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
                    borderLeft: `3px solid ${km.dot}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: T.family, fontSize: 14, fontWeight: 600, color: C.ink, letterSpacing: -0.2 }}>{a.title}</div>
                        <div style={{ fontFamily: T.family, fontSize: 12, color: C.ink2, marginTop: 2 }}>
                          With <span style={{ color: C.ink, fontWeight: 500 }}>{a.with}</span>
                        </div>
                      </div>
                      <Pill t={t} tone={km.tone}>{a.kind}</Pill>
                    </div>
                    <div style={{
                      marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.hairline}`,
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: T.family, fontSize: 12, color: C.ink2 }}>
                        <Icon name="pin" size={13} color={C.ink3}/>
                        {a.where}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {tentative ? <Pill t={t} tone="warning" dot>Tentative</Pill> : <Pill t={t} tone="success" dot>Confirmed</Pill>}
                      </div>
                    </div>
                    <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                      <SecondaryButton t={t} icon="phone" style={{ height: 36, fontSize: 13 }}>Call</SecondaryButton>
                      <SecondaryButton t={t} icon="pin" style={{ height: 36, fontSize: 13 }}>Directions</SecondaryButton>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Org switcher sheet — cross-org expense visibility
function OrgSwitcher({ t, currentOrgId, onPick, onClose, onSeeAll }) {
  const { C, T, S } = t;
  const totalSpent    = Object.values(ORG_FINANCE).reduce((a,b) => a + b.mtdSpent, 0);
  const totalReceived = Object.values(ORG_FINANCE).reduce((a,b) => a + b.mtdReceived, 0);

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 500, background: C.overlay, animation: 'fadeIn 180ms' }}
         onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        background: C.bg, borderBottomLeftRadius: 16, borderBottomRightRadius: 16,
        animation: 'slideInDown 240ms cubic-bezier(.2,.8,.2,1)',
        boxShadow: '0 10px 30px rgba(15,23,42,0.18)', overflow: 'hidden',
      }}>
        <div style={{
          padding: `12px ${S.gutter}px 14px`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontFamily: T.family, fontSize: 11, color: C.ink3, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>Workspace</div>
            <div style={{ fontFamily: T.family, fontSize: 17, fontWeight: 700, color: C.ink, letterSpacing: -0.3, marginTop: 2 }}>Switch organization</div>
          </div>
          <div onClick={onClose} style={{ cursor: 'pointer' }}><Icon name="close" size={20} color={C.ink2}/></div>
        </div>

        {/* Combined card — across-orgs view */}
        <div onClick={onSeeAll} style={{
          margin: `0 ${S.gutter}px 12px`, padding: 12, borderRadius: 12,
          background: 'linear-gradient(135deg, #2563EB 0%, #1E40AF 100%)',
          color: '#fff', cursor: 'pointer', position: 'relative', overflow: 'hidden',
        }}>
          {/* decorative grid */}
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.15 }} viewBox="0 0 200 100">
            <pattern id="g-grid" width="14" height="14" patternUnits="userSpaceOnUse">
              <path d="M14 0H0V14" stroke="#fff" strokeWidth="0.5" fill="none"/>
            </pattern>
            <rect width="200" height="100" fill="url(#g-grid)"/>
          </svg>
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: T.family, fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', opacity: 0.85 }}>
                All Workspaces
              </span>
              <Pill t={t} tone="default" size="sm">{ORGS.length} orgs</Pill>
            </div>
            <div style={{ display: 'flex', gap: 18, marginTop: 10 }}>
              <div>
                <div style={{ fontFamily: T.family, fontSize: 10, opacity: 0.8, fontWeight: 600, letterSpacing: 0.3 }}>RECEIVED · MTD</div>
                <div style={{ fontFamily: T.num, fontSize: 18, fontWeight: 700, ...T.tabular }}>{INRcompact(totalReceived)}</div>
              </div>
              <div>
                <div style={{ fontFamily: T.family, fontSize: 10, opacity: 0.8, fontWeight: 600, letterSpacing: 0.3 }}>SPENT · MTD</div>
                <div style={{ fontFamily: T.num, fontSize: 18, fontWeight: 700, ...T.tabular }}>{INRcompact(totalSpent)}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, fontFamily: T.family, fontSize: 12, fontWeight: 500 }}>
              See combined ledger across orgs <Icon name="chev_r" size={14} color="#fff"/>
            </div>
          </div>
        </div>

        <div style={{ padding: `0 ${S.gutter}px 6px`, fontFamily: T.family, fontSize: 11, color: C.ink3, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>
          Your organizations
        </div>

        <div style={{ padding: `0 ${S.gutter}px 12px`, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ORGS.map(o => {
            const fin = ORG_FINANCE[o.id];
            const active = o.id === currentOrgId;
            return (
              <div key={o.id} onClick={() => onPick(o.id)} style={{
                padding: 12, borderRadius: 10,
                background: active ? C.accentSoft : C.bg,
                border: `1.5px solid ${active ? C.accent : C.hairline2}`, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: o.color, color: '#fff', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: T.family, fontSize: 14, fontWeight: 700, letterSpacing: -0.3,
                }}>{o.short}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontFamily: T.family, fontSize: 14, fontWeight: 600, color: C.ink, letterSpacing: -0.2 }}>{o.name}</span>
                    {active && <Pill t={t} tone="accent">Current</Pill>}
                  </div>
                  <div style={{ fontFamily: T.family, fontSize: 12, color: C.ink2, marginTop: 1 }}>
                    {o.city} · {o.role} · {o.active} active
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: T.num, fontSize: 13, fontWeight: 700, color: C.ink, ...T.tabular, letterSpacing: -0.2 }}>
                    {INRcompact(fin.mtdSpent)}
                  </div>
                  <div style={{ fontFamily: T.family, fontSize: 10, color: C.ink3, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase' }}>SPENT MTD</div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{
          padding: `12px ${S.gutter}px`,
          borderTop: `1px solid ${C.hairline}`, display: 'flex', gap: 8,
        }}>
          <SecondaryButton t={t} icon="plus" style={{ height: 40, fontSize: 13 }}>Create org</SecondaryButton>
          <SecondaryButton t={t} icon="users" style={{ height: 40, fontSize: 13 }}>Join</SecondaryButton>
        </div>
      </div>
    </div>
  );
}

// ── Combined cross-org view
function AllOrgsScreen({ t, onBack, onPickOrg }) {
  const { C, T, S } = t;
  const totalSpent    = Object.values(ORG_FINANCE).reduce((a,b) => a + b.mtdSpent, 0);
  const totalReceived = Object.values(ORG_FINANCE).reduce((a,b) => a + b.mtdReceived, 0);
  const totalProjects = Object.values(ORG_FINANCE).reduce((a,b) => a + b.projects, 0);
  const totalPending  = Object.values(ORG_FINANCE).reduce((a,b) => a + b.pendingApprovals, 0);

  return (
    <div style={{ background: C.surface, minHeight: '100%' }}>
      <div style={{ padding: `4px ${S.gutter}px 12px`, background: C.bg, borderBottom: `1px solid ${C.hairline2}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div onClick={onBack} style={{ cursor: 'pointer' }}><Icon name="chev_l" size={20} color={C.ink2}/></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: T.family, fontSize: 12, color: C.ink2, fontWeight: 500 }}>Across {ORGS.length} workspaces</div>
            <div style={{ fontFamily: T.family, fontSize: 19, fontWeight: 700, color: C.ink, letterSpacing: -0.4 }}>All organizations</div>
          </div>
          <IconButton t={t} icon="filter"/>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
          <StatusCard t={t} label="Received MTD" value={INRcompact(totalReceived)} sub="across all orgs" tone="success" icon="upload"/>
          <StatusCard t={t} label="Spent MTD" value={INRcompact(totalSpent)} sub={`${totalProjects} active projects`} icon="download"/>
          <StatusCard t={t} label="Net" value={INRcompact(totalReceived - totalSpent)} sub="combined cash position" tone="default" icon="target"/>
          <StatusCard t={t} label="Pending" value={totalPending} sub="approvals across orgs" tone="warning" icon="clock"/>
        </div>
      </div>

      <div style={{ padding: 12 }}>
        <div style={{ fontFamily: T.family, fontSize: 11, color: C.ink3, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', padding: '4px 4px 8px' }}>
          Spend by workspace
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {ORGS.map(o => {
            const fin = ORG_FINANCE[o.id];
            const pct = (fin.mtdSpent / totalSpent) * 100;
            return (
              <div key={o.id} onClick={() => onPickOrg(o.id)} style={{
                padding: 12, borderRadius: S.radius, background: C.bg,
                border: `1px solid ${C.hairline2}`, cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 9, background: o.color, color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: T.family, fontSize: 13, fontWeight: 700, letterSpacing: -0.3, flexShrink: 0,
                  }}>{o.short}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontFamily: T.family, fontSize: 14, fontWeight: 600, color: C.ink, letterSpacing: -0.2 }}>{o.name}</span>
                      <Pill t={t} tone="default">{o.role}</Pill>
                    </div>
                    <div style={{ fontFamily: T.family, fontSize: 12, color: C.ink2, marginTop: 1 }}>
                      {o.city} · {fin.projects} projects · {o.members} members
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: T.num, fontSize: 14, fontWeight: 700, color: C.ink, ...T.tabular }}>{INRcompact(fin.mtdSpent)}</div>
                    <div style={{ fontFamily: T.family, fontSize: 10, color: C.ink3, fontWeight: 600 }}>spent MTD</div>
                  </div>
                </div>
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, height: 6, borderRadius: 3, background: C.hairline, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: o.color, borderRadius: 3 }}/>
                  </div>
                  <span style={{ fontFamily: T.num, fontSize: 11, color: C.ink2, fontWeight: 600, ...T.tabular, minWidth: 36, textAlign: 'right' }}>{Math.round(pct)}%</span>
                </div>
                <div style={{
                  marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.hairline}`,
                  display: 'flex', justifyContent: 'space-between',
                }}>
                  <div>
                    <div style={{ fontFamily: T.family, fontSize: 10, color: C.ink3, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase' }}>Received</div>
                    <div style={{ fontFamily: T.num, fontSize: 13, color: C.success, fontWeight: 700, ...T.tabular }}>+{INRcompact(fin.mtdReceived)}</div>
                  </div>
                  <div>
                    <div style={{ fontFamily: T.family, fontSize: 10, color: C.ink3, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase' }}>Net</div>
                    <div style={{ fontFamily: T.num, fontSize: 13, color: C.ink, fontWeight: 700, ...T.tabular }}>{INRcompact(fin.mtdReceived - fin.mtdSpent)}</div>
                  </div>
                  <div>
                    <div style={{ fontFamily: T.family, fontSize: 10, color: C.ink3, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase' }}>Pending</div>
                    <div style={{ fontFamily: T.num, fontSize: 13, color: C.warning, fontWeight: 700, ...T.tabular }}>{fin.pendingApprovals}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ height: 30 }}/>
      </div>
    </div>
  );
}

// ── CRM Screen — wraps Leads + Appointments tabs
function CRMScreen({ t, onNavigate, initialTab = 'leads' }) {
  const { C, T, S } = t;
  const [tab, setTab] = useSt_LA(initialTab);

  return (
    <div style={{ background: C.surface, minHeight: '100%' }}>
      <div style={{ padding: `4px ${S.gutter}px 0`, background: C.bg }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: T.family, fontSize: 12, color: C.ink2, fontWeight: 500 }}>Customer Relations</div>
            <div style={{ fontFamily: T.family, fontSize: 22, fontWeight: 700, color: C.ink, letterSpacing: -0.5 }}>CRM</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <IconButton t={t} icon="search"/>
            <IconButton t={t} icon="plus" tone="primary"
              onClick={() => onNavigate(tab === 'leads' ? 'lead-form' : 'appt-form')}/>
          </div>
        </div>

        {/* Segmented tabs */}
        <div style={{
          marginTop: 14, display: 'flex', gap: 4, padding: 4,
          background: C.surface2, borderRadius: 10, border: `1px solid ${C.hairline}`,
        }}>
          {[
            { k: 'leads',        label: 'Leads',        icon: 'target', count: LEADS.filter(l => !['Won','Lost'].includes(l.stage)).length },
            { k: 'appointments', label: 'Appointments', icon: 'calendar', count: APPOINTMENTS.length },
          ].map(it => {
            const active = tab === it.k;
            return (
              <div key={it.k} onClick={() => setTab(it.k)} style={{
                flex: 1, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                background: active ? C.bg : 'transparent', borderRadius: 7, cursor: 'pointer',
                boxShadow: active ? '0 1px 2px rgba(15,23,42,0.06)' : 'none',
              }}>
                <Icon name={it.icon} size={14} color={active ? C.accent : C.ink2}/>
                <span style={{
                  fontFamily: T.family, fontSize: 13, fontWeight: active ? 600 : 500,
                  color: active ? C.ink : C.ink2,
                }}>{it.label}</span>
                <span style={{
                  fontFamily: T.num, fontSize: 11, fontWeight: 700,
                  color: active ? C.accent : C.ink3, ...T.tabular,
                  background: active ? C.accentSoft : C.surface, padding: '2px 6px', borderRadius: 4,
                }}>{it.count}</span>
              </div>
            );
          })}
        </div>
        <div style={{ height: 12 }}/>
      </div>

      {tab === 'leads'        && <LeadsPanel t={t} onNavigate={onNavigate}/>}
      {tab === 'appointments' && <AppointmentsPanel t={t} onNavigate={onNavigate}/>}
    </div>
  );
}

// ── Lead Form — create / edit
function LeadFormScreen({ t, leadId, onCancel, onSave }) {
  const { C, T, S } = t;
  const existing = leadId ? LEADS.find(l => l.id === leadId) : null;
  const [name, setName]       = useSt_LA(existing?.name || '');
  const [phone, setPhone]     = useSt_LA(existing?.phone || '');
  const [type, setType]       = useSt_LA(existing?.type || '');
  const [city, setCity]       = useSt_LA(existing?.city || '');
  const [budget, setBudget]   = useSt_LA(existing ? String(existing.budget) : '');
  const [source, setSource]   = useSt_LA(existing?.source || 'Instagram');
  const [stage, setStage]     = useSt_LA(existing?.stage || 'New');
  const [score, setScore]     = useSt_LA(existing?.score || 'Warm');
  const [note, setNote]       = useSt_LA(existing?.note || '');

  const sources = ['Instagram','Referral','Website','Walk-in','Google Ads','LinkedIn','WhatsApp'];
  const stages  = ['New','Contacted','Qualified','Proposal','Negotiation','Won','Lost'];
  const scores  = ['Hot','Warm','Cold'];

  return (
    <div style={{ background: C.surface, minHeight: '100%' }}>
      <div style={{
        padding: `8px ${S.gutter}px 12px`, background: C.bg, borderBottom: `1px solid ${C.hairline2}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      }}>
        <div onClick={onCancel} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: C.ink2, fontFamily: T.family, fontSize: 14 }}>
          <Icon name="close" size={20} color={C.ink2}/>
        </div>
        <div style={{ flex: 1, textAlign: 'center', fontFamily: T.family, fontSize: 16, fontWeight: 600, color: C.ink }}>
          {existing ? 'Edit lead' : 'New lead'}
        </div>
        <div onClick={onSave} style={{
          cursor: 'pointer', padding: '6px 12px', borderRadius: 8, background: C.accent,
          color: '#fff', fontFamily: T.family, fontSize: 13, fontWeight: 600,
        }}>Save</div>
      </div>

      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Identity */}
        <div style={{ background: C.bg, borderRadius: S.radius, border: `1px solid ${C.hairline2}` }}>
          <div style={{ padding: `10px ${S.gutter}px 6px`, fontFamily: T.family, fontSize: 11, color: C.ink3, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>Identity</div>
          <InputRow t={t} label="Name"   value={name}  onChange={setName}  placeholder="Lead full name"/>
          <InputRow t={t} label="Phone"  value={phone} onChange={setPhone} placeholder="+91 …" mono/>
          <InputRow t={t} label="City"   value={city}  onChange={setCity}  placeholder="Hyderabad"/>
          <InputRow t={t} label="Type"   value={type}  onChange={setType}  placeholder="3BHK Apt., Café Fitout…" last/>
        </div>

        {/* Pipeline */}
        <div style={{ background: C.bg, borderRadius: S.radius, border: `1px solid ${C.hairline2}`, padding: `10px ${S.gutter}px 12px` }}>
          <div style={{ fontFamily: T.family, fontSize: 11, color: C.ink3, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', paddingBottom: 8 }}>Pipeline</div>
          <ChipPicker t={t} label="Stage"  value={stage}  options={stages}  onChange={setStage}/>
          <ChipPicker t={t} label="Score"  value={score}  options={scores}  onChange={setScore}/>
          <ChipPicker t={t} label="Source" value={source} options={sources} onChange={setSource}/>
        </div>

        {/* Budget */}
        <div style={{ background: C.bg, borderRadius: S.radius, border: `1px solid ${C.hairline2}` }}>
          <div style={{ padding: `10px ${S.gutter}px 6px`, fontFamily: T.family, fontSize: 11, color: C.ink3, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>Budget</div>
          <InputRow t={t} label="Amount ₹" value={budget} onChange={setBudget} placeholder="900000" mono last/>
        </div>

        {/* Notes */}
        <div style={{ background: C.bg, borderRadius: S.radius, border: `1px solid ${C.hairline2}`, padding: `10px ${S.gutter}px 14px` }}>
          <div style={{ fontFamily: T.family, fontSize: 11, color: C.ink3, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', paddingBottom: 8 }}>Notes</div>
          <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Context, expectations, next steps…"
            style={{
              width: '100%', minHeight: 80, padding: 10, borderRadius: 8, resize: 'vertical',
              border: `1px solid ${C.hairline}`, background: C.surface2,
              fontFamily: T.family, fontSize: 14, color: C.ink, outline: 'none',
            }}/>
        </div>

        {existing && (
          <SecondaryButton t={t} icon="trash" style={{ height: 44, color: C.danger, borderColor: C.hairline2 }}>
            Delete lead
          </SecondaryButton>
        )}
        <div style={{ height: 24 }}/>
      </div>
    </div>
  );
}

// ── Lead Preview — read-only detail
function LeadPreviewScreen({ t, leadId, onBack, onEdit, onSchedule }) {
  const { C, T, S } = t;
  const l = LEADS.find(x => x.id === leadId) || LEADS[0];
  const stageMeta = {
    'New': '#2563EB', 'Contacted': '#0EA5E9', 'Qualified': '#0D9488',
    'Proposal': '#D97706', 'Negotiation': '#F59E0B', 'Won': '#0F9D58', 'Lost': '#DC2626',
  };
  const scoreTone = (s) => s === 'Hot' ? 'danger' : s === 'Warm' ? 'warning' : 'default';
  const stages = ['New','Contacted','Qualified','Proposal','Negotiation','Won'];
  const stageIdx = stages.indexOf(l.stage);
  const linkedAppts = APPOINTMENTS.filter(a => a.leadId === l.id);

  return (
    <div style={{ background: C.surface, minHeight: '100%' }}>
      <div style={{
        padding: `8px ${S.gutter}px 12px`, background: C.bg, borderBottom: `1px solid ${C.hairline2}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      }}>
        <div onClick={onBack} style={{ cursor: 'pointer' }}><Icon name="chev_l" size={22} color={C.ink2}/></div>
        <div style={{ flex: 1, textAlign: 'center', fontFamily: T.family, fontSize: 14, fontWeight: 600, color: C.ink }}>Lead</div>
        <div onClick={onEdit} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: C.accent, fontFamily: T.family, fontSize: 13, fontWeight: 600 }}>
          <Icon name="edit" size={16} color={C.accent}/> Edit
        </div>
      </div>

      {/* Hero */}
      <div style={{ padding: `16px ${S.gutter}px 14px`, background: C.bg, borderBottom: `1px solid ${C.hairline2}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Avatar t={t} name={l.name} size={52}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: T.family, fontSize: 19, fontWeight: 700, color: C.ink, letterSpacing: -0.4 }}>{l.name}</span>
              <Pill t={t} tone={scoreTone(l.score)} dot>{l.score}</Pill>
            </div>
            <div style={{ fontFamily: T.family, fontSize: 13, color: C.ink2, marginTop: 2 }}>{l.type} · {l.city}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
          <SecondaryButton t={t} icon="phone" style={{ height: 40 }}>Call</SecondaryButton>
          <SecondaryButton t={t} icon="whatsapp" style={{ height: 40 }}>WhatsApp</SecondaryButton>
        </div>
      </div>

      {/* Stage progress */}
      <div style={{ padding: 12 }}>
        <div style={{ background: C.bg, borderRadius: S.radius, border: `1px solid ${C.hairline2}`, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: T.family, fontSize: 11, color: C.ink3, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>Stage</span>
            <span style={{ fontFamily: T.family, fontSize: 13, fontWeight: 600, color: stageMeta[l.stage] || C.ink }}>{l.stage}</span>
          </div>
          {l.stage !== 'Lost' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 12 }}>
              {stages.map((s, i) => {
                const done = i <= stageIdx;
                return (
                  <React.Fragment key={s}>
                    <div style={{
                      flex: 1, height: 4, borderRadius: 2,
                      background: done ? (stageMeta[l.stage] || C.accent) : C.hairline,
                    }}/>
                  </React.Fragment>
                );
              })}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            <span style={{ fontFamily: T.family, fontSize: 10, color: C.ink3 }}>{stages[0]}</span>
            <span style={{ fontFamily: T.family, fontSize: 10, color: C.ink3 }}>Won</span>
          </div>
        </div>

        {/* Details */}
        <div style={{ marginTop: 12, background: C.bg, borderRadius: S.radius, border: `1px solid ${C.hairline2}`, overflow: 'hidden' }}>
          <DetailRow t={t} label="Budget"  value={INRcompact(l.budget)} mono/>
          <DetailRow t={t} label="Source"  value={l.source}/>
          <DetailRow t={t} label="Phone"   value={l.phone} mono/>
          <DetailRow t={t} label="City"    value={l.city}/>
          <DetailRow t={t} label="Created" value={relDate(l.created)}/>
          <DetailRow t={t} label="ID"      value={l.id.toUpperCase()} mono last/>
        </div>

        {l.note && (
          <div style={{ marginTop: 12, background: C.bg, borderRadius: S.radius, border: `1px solid ${C.hairline2}`, padding: 14 }}>
            <div style={{ fontFamily: T.family, fontSize: 11, color: C.ink3, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 }}>Notes</div>
            <div style={{ fontFamily: T.family, fontSize: 14, color: C.ink, lineHeight: '20px' }}>{l.note}</div>
          </div>
        )}

        {/* Linked appointments */}
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 4px 8px' }}>
            <span style={{ fontFamily: T.family, fontSize: 11, color: C.ink3, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>Appointments ({linkedAppts.length})</span>
            <span onClick={onSchedule} style={{ cursor: 'pointer', fontFamily: T.family, fontSize: 12, fontWeight: 600, color: C.accent, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Icon name="plus" size={13} color={C.accent}/> Schedule
            </span>
          </div>
          {linkedAppts.length === 0 ? (
            <div style={{ background: C.bg, borderRadius: S.radius, border: `1px dashed ${C.hairline2}`, padding: 18, textAlign: 'center', fontFamily: T.family, fontSize: 13, color: C.ink3 }}>
              No appointments scheduled.
            </div>
          ) : linkedAppts.map(a => (
            <div key={a.id} style={{
              padding: 12, marginBottom: 8, borderRadius: S.radius, background: C.bg,
              border: `1px solid ${C.hairline2}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: T.family, fontSize: 13, fontWeight: 600, color: C.ink }}>{a.title}</span>
                <Pill t={t} tone={a.stage === 'Tentative' ? 'warning' : 'success'} dot>{a.stage}</Pill>
              </div>
              <div style={{ fontFamily: T.num, fontSize: 12, color: C.ink2, marginTop: 4, ...T.tabular }}>
                {new Date(a.start).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <SecondaryButton t={t} icon="calendar" style={{ height: 44 }} onClick={onSchedule}>Schedule</SecondaryButton>
          <PrimaryButton t={t} icon="check_circle" style={{ height: 44 }}>Convert</PrimaryButton>
        </div>
        <div style={{ height: 30 }}/>
      </div>
    </div>
  );
}

// ── Appointment Form — create / edit
function AppointmentFormScreen({ t, prefill = {}, onCancel, onSave }) {
  const { C, T, S } = t;
  const existing = prefill.id ? APPOINTMENTS.find(a => a.id === prefill.id) : null;
  const linkedLead = (prefill.leadId || existing?.leadId) ? LEADS.find(l => l.id === (prefill.leadId || existing.leadId)) : null;

  const [title, setTitle] = useSt_LA(existing?.title || (linkedLead ? `Lead pitch — ${linkedLead.name}` : ''));
  const [withWho, setWith] = useSt_LA(existing?.with || linkedLead?.name || '');
  const [where, setWhere] = useSt_LA(existing?.where || '');
  const [date, setDate]   = useSt_LA(existing?.start?.slice(0, 10) || '2026-04-26');
  const [start, setStart] = useSt_LA(existing?.start?.slice(11, 16) || '11:00');
  const [end, setEnd]     = useSt_LA(existing?.end?.slice(11, 16) || '12:00');
  const [kind, setKind]   = useSt_LA(existing?.kind || 'Site');
  const [stage, setStage] = useSt_LA(existing?.stage || 'Confirmed');
  const [notes, setNotes] = useSt_LA('');

  const kinds = ['Site','Review','Pitch','Vendor'];
  const stages = ['Confirmed','Tentative'];

  return (
    <div style={{ background: C.surface, minHeight: '100%' }}>
      <div style={{
        padding: `8px ${S.gutter}px 12px`, background: C.bg, borderBottom: `1px solid ${C.hairline2}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      }}>
        <div onClick={onCancel} style={{ cursor: 'pointer' }}><Icon name="close" size={20} color={C.ink2}/></div>
        <div style={{ flex: 1, textAlign: 'center', fontFamily: T.family, fontSize: 16, fontWeight: 600, color: C.ink }}>
          {existing ? 'Edit appointment' : 'New appointment'}
        </div>
        <div onClick={onSave} style={{
          cursor: 'pointer', padding: '6px 12px', borderRadius: 8, background: C.accent,
          color: '#fff', fontFamily: T.family, fontSize: 13, fontWeight: 600,
        }}>Save</div>
      </div>

      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {linkedLead && (
          <div style={{
            padding: 10, borderRadius: S.radius, background: C.accentSoft,
            border: `1px solid ${C.accent}`, display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <Icon name="target" size={18} color={C.accent}/>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: T.family, fontSize: 11, color: C.accent, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>Linked lead</div>
              <div style={{ fontFamily: T.family, fontSize: 14, fontWeight: 600, color: C.ink, marginTop: 1 }}>{linkedLead.name}</div>
            </div>
          </div>
        )}

        <div style={{ background: C.bg, borderRadius: S.radius, border: `1px solid ${C.hairline2}` }}>
          <div style={{ padding: `10px ${S.gutter}px 6px`, fontFamily: T.family, fontSize: 11, color: C.ink3, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>Details</div>
          <InputRow t={t} label="Title" value={title} onChange={setTitle} placeholder="What is this meeting?"/>
          <InputRow t={t} label="With"  value={withWho} onChange={setWith} placeholder="Person or company"/>
          <InputRow t={t} label="Where" value={where} onChange={setWhere} placeholder="Site, studio, video call…" last/>
        </div>

        <div style={{ background: C.bg, borderRadius: S.radius, border: `1px solid ${C.hairline2}` }}>
          <div style={{ padding: `10px ${S.gutter}px 6px`, fontFamily: T.family, fontSize: 11, color: C.ink3, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>When</div>
          <InputRow t={t} label="Date"  value={date}  onChange={setDate}  mono placeholder="2026-04-26"/>
          <InputRow t={t} label="Start" value={start} onChange={setStart} mono placeholder="11:00"/>
          <InputRow t={t} label="End"   value={end}   onChange={setEnd}   mono placeholder="12:00" last/>
        </div>

        <div style={{ background: C.bg, borderRadius: S.radius, border: `1px solid ${C.hairline2}`, padding: `10px ${S.gutter}px 12px` }}>
          <div style={{ fontFamily: T.family, fontSize: 11, color: C.ink3, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', paddingBottom: 8 }}>Type</div>
          <ChipPicker t={t} label="Kind"   value={kind}  options={kinds}  onChange={setKind}/>
          <ChipPicker t={t} label="Status" value={stage} options={stages} onChange={setStage}/>
        </div>

        <div style={{ background: C.bg, borderRadius: S.radius, border: `1px solid ${C.hairline2}`, padding: `10px ${S.gutter}px 14px` }}>
          <div style={{ fontFamily: T.family, fontSize: 11, color: C.ink3, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', paddingBottom: 8 }}>Notes</div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Agenda, prep, links…"
            style={{
              width: '100%', minHeight: 70, padding: 10, borderRadius: 8, resize: 'vertical',
              border: `1px solid ${C.hairline}`, background: C.surface2,
              fontFamily: T.family, fontSize: 14, color: C.ink, outline: 'none',
            }}/>
        </div>

        {existing && (
          <SecondaryButton t={t} icon="trash" style={{ height: 44, color: C.danger, borderColor: C.hairline2 }}>
            Cancel appointment
          </SecondaryButton>
        )}
        <div style={{ height: 24 }}/>
      </div>
    </div>
  );
}

// ── Appointment Preview
function AppointmentPreviewScreen({ t, apptId, onBack, onEdit }) {
  const { C, T, S } = t;
  const a = APPOINTMENTS.find(x => x.id === apptId) || APPOINTMENTS[0];
  const tentative = a.stage === 'Tentative';
  const kindMeta = {
    Site:   { tone: 'success', dot: '#0F9D58' },
    Review: { tone: 'accent',  dot: '#2563EB' },
    Pitch:  { tone: 'warning', dot: '#D97706' },
    Vendor: { tone: 'default', dot: '#94A3B8' },
  };
  const km = kindMeta[a.kind];
  const lead = a.leadId ? LEADS.find(l => l.id === a.leadId) : null;
  const project = a.projectId && typeof PROJECTS !== 'undefined' ? PROJECTS.find(p => p.id === a.projectId) : null;

  const fmtTime = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const durMin = Math.round((new Date(a.end) - new Date(a.start)) / 60000);

  return (
    <div style={{ background: C.surface, minHeight: '100%' }}>
      <div style={{
        padding: `8px ${S.gutter}px 12px`, background: C.bg, borderBottom: `1px solid ${C.hairline2}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      }}>
        <div onClick={onBack} style={{ cursor: 'pointer' }}><Icon name="chev_l" size={22} color={C.ink2}/></div>
        <div style={{ flex: 1, textAlign: 'center', fontFamily: T.family, fontSize: 14, fontWeight: 600, color: C.ink }}>Appointment</div>
        <div onClick={onEdit} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: C.accent, fontFamily: T.family, fontSize: 13, fontWeight: 600 }}>
          <Icon name="edit" size={16} color={C.accent}/> Edit
        </div>
      </div>

      {/* Hero */}
      <div style={{
        padding: `16px ${S.gutter}px 16px`, background: C.bg,
        borderBottom: `1px solid ${C.hairline2}`, borderLeft: `4px solid ${km.dot}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Pill t={t} tone={km.tone}>{a.kind}</Pill>
          <Pill t={t} tone={tentative ? 'warning' : 'success'} dot>{tentative ? 'Tentative' : 'Confirmed'}</Pill>
        </div>
        <div style={{ fontFamily: T.family, fontSize: 19, fontWeight: 700, color: C.ink, letterSpacing: -0.4, lineHeight: '24px' }}>{a.title}</div>
        <div style={{ fontFamily: T.family, fontSize: 13, color: C.ink2, marginTop: 6 }}>
          With <span style={{ color: C.ink, fontWeight: 600 }}>{a.with}</span>
        </div>
      </div>

      <div style={{ padding: 12 }}>
        {/* When */}
        <div style={{ background: C.bg, borderRadius: S.radius, border: `1px solid ${C.hairline2}`, padding: 14 }}>
          <div style={{ fontFamily: T.family, fontSize: 11, color: C.ink3, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>When</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 50, padding: '8px 0', borderRadius: 8, background: C.accentSoft,
              textAlign: 'center', flexShrink: 0,
            }}>
              <div style={{ fontFamily: T.family, fontSize: 9, fontWeight: 700, color: C.accent, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                {new Date(a.start).toLocaleDateString('en-IN', { month: 'short' })}
              </div>
              <div style={{ fontFamily: T.num, fontSize: 22, fontWeight: 700, color: C.accent, ...T.tabular, lineHeight: 1, marginTop: 2 }}>
                {new Date(a.start).getDate()}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: T.family, fontSize: 14, fontWeight: 600, color: C.ink }}>{fmtDate(a.start)}</div>
              <div style={{ fontFamily: T.num, fontSize: 13, color: C.ink2, marginTop: 2, ...T.tabular }}>
                {fmtTime(a.start)} → {fmtTime(a.end)}
                <span style={{ marginLeft: 6, color: C.ink3 }}>· {durMin} min</span>
              </div>
            </div>
          </div>
        </div>

        {/* Where */}
        <div style={{ marginTop: 12, background: C.bg, borderRadius: S.radius, border: `1px solid ${C.hairline2}`, padding: 14 }}>
          <div style={{ fontFamily: T.family, fontSize: 11, color: C.ink3, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>Location</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="pin" size={18} color={C.ink2}/>
            <span style={{ fontFamily: T.family, fontSize: 14, color: C.ink, fontWeight: 500 }}>{a.where}</span>
          </div>
        </div>

        {/* Linked */}
        {(lead || project) && (
          <div style={{ marginTop: 12, background: C.bg, borderRadius: S.radius, border: `1px solid ${C.hairline2}`, overflow: 'hidden' }}>
            <div style={{ padding: `10px ${S.gutter}px 6px`, fontFamily: T.family, fontSize: 11, color: C.ink3, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>Linked</div>
            {lead && <DetailRow t={t} label="Lead" value={lead.name} last={!project}/>}
            {project && <DetailRow t={t} label="Project" value={project.name} last/>}
          </div>
        )}

        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <SecondaryButton t={t} icon="phone" style={{ height: 44 }}>Call</SecondaryButton>
          <SecondaryButton t={t} icon="pin" style={{ height: 44 }}>Directions</SecondaryButton>
        </div>
        <div style={{ marginTop: 8 }}>
          <PrimaryButton t={t} icon="check_circle" style={{ height: 44, width: '100%' }}>
            {tentative ? 'Confirm' : 'Mark complete'}
          </PrimaryButton>
        </div>
        <div style={{ height: 30 }}/>
      </div>
    </div>
  );
}

// ── Small helpers used by forms / previews
function ChipPicker({ t, label, value, options, onChange }) {
  const { C, T } = t;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontFamily: T.family, fontSize: 12, color: C.ink2, fontWeight: 500, marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {options.map(o => {
          const active = o === value;
          return (
            <div key={o} onClick={() => onChange(o)} style={{
              padding: '6px 11px', borderRadius: 6, cursor: 'pointer',
              background: active ? C.accent : C.surface2,
              border: `1px solid ${active ? C.accent : C.hairline}`,
              color: active ? '#fff' : C.ink, fontFamily: T.family, fontSize: 12.5, fontWeight: active ? 600 : 500,
            }}>{o}</div>
          );
        })}
      </div>
    </div>
  );
}

function DetailRow({ t, label, value, mono = false, last = false }) {
  const { C, T, S } = t;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: `12px ${S.gutter}px`, position: 'relative',
    }}>
      <span style={{ fontFamily: T.family, fontSize: 13, color: C.ink2, fontWeight: 500 }}>{label}</span>
      <span style={{
        fontFamily: mono ? T.mono : T.family, fontSize: 14, color: C.ink, fontWeight: 600,
        ...(mono ? T.tabular : {}),
      }}>{value}</span>
      {!last && <div style={{ position: 'absolute', left: S.gutter, right: 0, bottom: 0, height: 1, background: C.hairline }}/>}
    </div>
  );
}

Object.assign(window, {
  LeadsScreen: CRMScreen, AppointmentsScreen: CRMScreen,
  CRMScreen, LeadFormScreen, LeadPreviewScreen,
  AppointmentFormScreen, AppointmentPreviewScreen,
  OrgSwitcher, AllOrgsScreen,
});
