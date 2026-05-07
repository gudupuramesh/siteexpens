// Dashboard (Home) + Bottom Tab Bar
const { useMemo: useMemo_H } = React;

// ── Bottom Tab Bar
function TabBar({ t, active, onChange }) {
  const { C, T } = t;
  const items = [
    { key: 'home',     label: STR.tabs.home,     icon: 'home' },
    { key: 'projects', label: STR.tabs.projects, icon: 'projects' },
    { key: 'add',      label: STR.tabs.add,      icon: 'plus', special: true },
    { key: 'crm',      label: 'CRM',             icon: 'users' },
    { key: 'more',     label: STR.tabs.more,     icon: 'more' },
  ];
  return (
    <div style={{
      display: 'flex', background: C.tab, borderTop: `1px solid ${C.hairline}`,
      paddingBottom: 18, paddingTop: 6,
    }}>
      {items.map(it => {
        const isActive = active === it.key;
        if (it.special) {
          return (
            <div key={it.key} onClick={() => onChange(it.key)} style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              cursor: 'pointer', padding: '4px 0 2px',
            }}>
              <div style={{
                width: 44, height: 44, background: C.accent, borderRadius: 22,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 6px 14px rgba(37,99,235,0.35)',
              }}>
                <Icon name="plus" size={22} color="#fff" strokeWidth={2}/>
              </div>
            </div>
          );
        }
        return (
          <div key={it.key} onClick={() => onChange(it.key)} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            cursor: 'pointer', padding: '6px 0 2px',
          }}>
            <Icon name={it.icon} size={22} color={isActive ? C.accent : C.ink3}
                  strokeWidth={isActive ? 1.5 : 1.25}/>
            <span style={{
              fontFamily: T.family, fontSize: 10, fontWeight: isActive ? 600 : 500,
              color: isActive ? C.accent : C.ink3, letterSpacing: 0.2,
            }}>{it.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Dashboard
function HomeScreen({ t, onNavigate, onOrgPicker, orgId = 'o1' }) {
  const { C, T, S } = t;
  const org = ORGS.find(o => o.id === orgId) || ORGS[0];
  const orgFin = ORG_FINANCE[org.id] || ORG_FINANCE.o1;

  const activeProjects = PROJECTS.filter(p => p.status === 'Active');
  const todayExpenses = EXPENSES.filter(e => e.date.startsWith('2026-04-19'));
  const todaySpent = todayExpenses.reduce((a, b) => a + b.amount, 0);
  const weekSpent = EXPENSES.filter(e => new Date(e.date) >= new Date('2026-04-13')).reduce((a,b) => a+b.amount, 0);
  const totalOut = EXPENSES.reduce((a,b) => a+b.amount, 0);
  const totalIn = INCOME.reduce((a,b) => a+b.amount, 0);
  const pending = APPROVALS.length;
  const tasksToday = TASKS.filter(t => t.tag === 'Today' && !t.done);

  return (
    <div style={{ background: C.bg }}>
      {/* Header */}
      <div style={{ padding: `8px ${S.gutter}px 14px`, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div onClick={onOrgPicker} style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
          padding: '6px 10px 6px 6px', borderRadius: 999,
          background: C.surface2, border: `1px solid ${C.hairline2}`,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, background: org.color, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: T.family, fontSize: 12, fontWeight: 700, letterSpacing: -0.2,
          }}>{org.short}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontFamily: T.family, fontSize: 13, fontWeight: 700, color: C.ink, letterSpacing: -0.2,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>{org.name}</span>
              <Icon name="chev_r" size={12} color={C.ink3} style={{ transform: 'rotate(90deg)' }}/>
            </div>
            <div style={{ fontFamily: T.family, fontSize: 11, color: C.ink2 }}>
              Sun · 25 Apr · {org.role}
            </div>
          </div>
        </div>
        <div onClick={() => onNavigate('appointments')} style={{
          width: 38, height: 38, borderRadius: 10, border: `1px solid ${C.hairline2}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: C.bg,
        }}>
          <Icon name="calendar" size={17} color={C.ink}/>
        </div>
        <div onClick={() => onNavigate('notifications')} style={{
          width: 38, height: 38, borderRadius: 10, border: `1px solid ${C.hairline2}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative', background: C.bg,
        }}>
          <Icon name="bell" size={17} color={C.ink}/>
          <div style={{ position: 'absolute', top: 6, right: 7, width: 7, height: 7, borderRadius: 4, background: C.danger, border: `1.5px solid ${C.bg}` }}/>
        </div>
      </div>

      {/* Top summary — numbers at scale */}
      <div style={{ padding: `0 ${S.gutter}px 16px` }}>
        <div style={{
          padding: '14px 16px 14px',
          background: C.bg,
          borderRadius: S.radiusCard,
          border: `1px solid ${C.hairline2}`,
          boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: T.family, fontSize: 11, color: C.ink3, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>
              Net balance · April
            </span>
            <Pill t={t} tone="success" dot>+12.4%</Pill>
          </div>
          <div style={{
            fontFamily: T.num, fontSize: 30, fontWeight: 700, color: C.ink,
            marginTop: 6, letterSpacing: -1, ...T.tabular,
          }}>{INR(totalIn - totalOut)}</div>
          <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
            <div>
              <span style={{ fontFamily: T.family, fontSize: 10, color: C.ink3, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>In</span>
              <div style={{ fontFamily: T.num, fontSize: 13, color: C.success, fontWeight: 700, ...T.tabular }}>+{INRcompact(totalIn)}</div>
            </div>
            <div>
              <span style={{ fontFamily: T.family, fontSize: 10, color: C.ink3, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>Out</span>
              <div style={{ fontFamily: T.num, fontSize: 13, color: C.ink, fontWeight: 700, ...T.tabular }}>−{INRcompact(totalOut)}</div>
            </div>
            <div>
              <span style={{ fontFamily: T.family, fontSize: 10, color: C.ink3, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>Active</span>
              <div style={{ fontFamily: T.num, fontSize: 13, color: C.ink, fontWeight: 700, ...T.tabular }}>{activeProjects.length} projects</div>
            </div>
          </div>
          {/* inline bar chart, 7d */}
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'flex-end', gap: 4, height: 32 }}>
            {[18, 32, 12, 48, 26, 40, 22].map((v, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <div style={{
                  width: '100%', height: `${v}%`, minHeight: 3, borderRadius: 2,
                  background: i === 6 ? C.accent : C.accentSoft,
                }}/>
              </div>
            ))}
          </div>
          <div style={{
            display: 'flex', justifyContent: 'space-between', marginTop: 4,
            fontFamily: T.family, fontSize: 9.5, color: C.ink3, letterSpacing: 0.6, fontWeight: 600,
          }}>
            {['M','T','W','T','F','S','S'].map((d,i) => <span key={i}>{d}</span>)}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div style={{
        padding: `0 ${S.gutter}px 22px`, display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
      }}>
        {[
          { k: 'add',      label: 'Add expense',  icon: 'plus',     onClick: () => onNavigate('add') },
          { k: 'approv',   label: 'Approvals',    icon: 'check_circle', badge: pending, onClick: () => onNavigate('approvals') },
          { k: 'leads',    label: 'Leads',        icon: 'target',   badge: LEADS.filter(l => l.score === 'Hot' && !['Won','Lost'].includes(l.stage)).length, onClick: () => onNavigate('crm') },
          { k: 'sched',    label: 'Schedule',     icon: 'calendar', onClick: () => onNavigate('appointments') },
        ].map(a => (
          <div key={a.k} onClick={a.onClick} style={{
            border: `1px solid ${C.hairline2}`, padding: '12px 6px 10px', borderRadius: 10,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            cursor: 'pointer', position: 'relative', background: C.bg,
            boxShadow: '0 1px 2px rgba(15,23,42,0.03)',
          }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8, background: C.accentSoft,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon name={a.icon} size={15} color={C.accent} strokeWidth={2}/>
            </div>
            <span style={{
              fontFamily: T.family, fontSize: 11, color: C.ink, fontWeight: 600, textAlign: 'center', letterSpacing: -0.1,
            }}>{a.label}</span>
            {a.badge ? <div style={{
              position: 'absolute', top: 6, right: 6,
              minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8,
              background: C.danger, color: '#fff',
              fontFamily: T.family, fontSize: 10, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: `1.5px solid ${C.bg}`,
            }}>{a.badge}</div> : null}
          </div>
        ))}
      </div>

      {/* Appointments today */}
      {(() => {
        const today = APPOINTMENTS.filter(a => a.start.startsWith('2026-04-25'))
          .sort((a,b) => new Date(a.start) - new Date(b.start));
        if (today.length === 0) return null;
        const fmt = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
        const kindColor = { Site: C.success, Review: C.accent, Pitch: C.warning, Vendor: C.ink2 };
        return (
          <div style={{ padding: `0 0 22px` }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
              padding: `0 ${S.gutter}px 8px`,
            }}>
              <div style={{ fontFamily: T.family, fontSize: 11, color: C.ink3, letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: 700 }}>
                Today &middot; {today.length} appointment{today.length === 1 ? '' : 's'}
              </div>
              <span onClick={() => onNavigate('appointments')} style={{ fontFamily: T.family, fontSize: 13, color: C.accent, cursor: 'pointer', fontWeight: 600 }}>
                See schedule
              </span>
            </div>
            <div style={{
              display: 'flex', gap: 10, overflowX: 'auto', padding: `0 ${S.gutter}px 4px`,
              scrollbarWidth: 'none',
            }} className="no-scrollbar">
              {today.map(a => (
                <div key={a.id} onClick={() => onNavigate('appointments')} style={{
                  width: 220, flexShrink: 0, padding: 12, borderRadius: 10,
                  background: C.bg, border: `1px solid ${C.hairline2}`,
                  borderLeft: `3px solid ${kindColor[a.kind] || C.accent}`,
                  cursor: 'pointer', boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontFamily: T.num, fontSize: 13, fontWeight: 700, color: C.ink, ...T.tabular }}>
                        {fmt(a.start)}
                      </div>
                      <div style={{ fontFamily: T.family, fontSize: 10, color: C.ink3, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>{a.kind}</div>
                    </div>
                    {a.stage === 'Tentative' && <Pill t={t} tone="warning" dot>Tent.</Pill>}
                  </div>
                  <div style={{ fontFamily: T.family, fontSize: 13, fontWeight: 600, color: C.ink, marginTop: 8, letterSpacing: -0.1, lineHeight: '17px' }}>
                    {a.title}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5 }}>
                    <Icon name="pin" size={11} color={C.ink3}/>
                    <span style={{ fontFamily: T.family, fontSize: 11, color: C.ink2,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {a.where}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Projects rail */}
      <div style={{ padding: `0 0 22px` }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          padding: `0 ${S.gutter}px 10px`,
        }}>
          <div style={{ fontFamily: T.mono, fontSize: 11, color: C.ink3, letterSpacing: 1.5, textTransform: 'uppercase' }}>
            Active projects · {activeProjects.length}
          </div>
          <span onClick={() => onNavigate('projects')} style={{
            fontFamily: T.family, fontSize: 13, color: C.accent, cursor: 'pointer',
          }}>See all</span>
        </div>
        <div style={{
          display: 'flex', gap: 10, overflowX: 'auto', padding: `0 ${S.gutter}px 2px`,
          scrollbarWidth: 'none',
        }} className="no-scrollbar">
          {activeProjects.map(p => (
            <div key={p.id} onClick={() => onNavigate('project', p.id)} style={{
              width: 240, flexShrink: 0, borderRadius: 12, border: `1px solid ${C.hairline2}`,
              padding: 14, background: C.bg, cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Thumb t={t} size={40} radius={9} label={p.name.slice(0,2).toUpperCase()}/>
                <Pill t={t} tone={p.progress >= 80 ? 'warning' : 'accent'}>{p.progress}%</Pill>
              </div>
              <div style={{
                fontFamily: T.family, fontSize: 14, fontWeight: 600, color: C.ink,
                marginTop: 10, letterSpacing: -0.2,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{p.name}</div>
              <div style={{
                fontFamily: T.family, fontSize: 11, color: C.ink2, marginTop: 2,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{p.client} · {p.location}</div>
              <div style={{ marginTop: 12 }}>
                <ProgressBar t={t} value={p.spent} max={p.budget} height={4}/>
              </div>
              <div style={{
                display: 'flex', justifyContent: 'space-between', marginTop: 6,
                fontFamily: T.num, fontSize: 11, ...T.tabular,
              }}>
                <span style={{ color: C.ink, fontWeight: 700 }}>{INRcompact(p.spent)}</span>
                <span style={{ color: C.ink3 }}>/ {INRcompact(p.budget)}</span>
              </div>
            </div>
          ))}
          {/* add new */}
          <div onClick={() => onNavigate('new-project')} style={{
            width: 160, flexShrink: 0, border: `1px dashed ${C.hairline2}`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: C.ink3,
          }}>
            <Icon name="plus" size={22} color={C.ink3}/>
            <div style={{ fontFamily: T.family, fontSize: 12, marginTop: 6 }}>New project</div>
          </div>
        </div>
      </div>

      {/* Today's tasks */}
      {tasksToday.length > 0 && (
        <div style={{ padding: `0 0 22px` }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            padding: `0 ${S.gutter}px 8px`,
          }}>
            <div style={{ fontFamily: T.mono, fontSize: 11, color: C.ink3, letterSpacing: 1.5, textTransform: 'uppercase' }}>
              Today · {tasksToday.length}
            </div>
            <span onClick={() => onNavigate('tasks')} style={{ fontFamily: T.family, fontSize: 13, color: C.accent, cursor: 'pointer' }}>
              All tasks
            </span>
          </div>
          <div style={{ borderTop: `1px solid ${C.hairline}`, borderBottom: `1px solid ${C.hairline}` }}>
            {tasksToday.map((task, i) => {
              const proj = PROJECTS.find(p => p.id === task.project);
              return (
                <Row key={task.id} t={t}
                  title={task.title}
                  subtitle={`${proj?.name || ''} · ${timeOf(task.due)}`}
                  left={<div style={{
                    width: 18, height: 18, border: `1.5px solid ${task.done ? C.accent : C.hairline2}`,
                    background: task.done ? C.accent : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{task.done && <Icon name="check" size={12} color="#fff"/>}</div>}
                  chevron
                  last={i === tasksToday.length - 1}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Recent transactions */}
      <div style={{ padding: `0 0 20px` }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          padding: `0 ${S.gutter}px 8px`,
        }}>
          <div style={{ fontFamily: T.mono, fontSize: 11, color: C.ink3, letterSpacing: 1.5, textTransform: 'uppercase' }}>
            Recent · ledger
          </div>
          <span onClick={() => onNavigate('ledger')} style={{ fontFamily: T.family, fontSize: 13, color: C.accent, cursor: 'pointer' }}>
            View all
          </span>
        </div>
        <div style={{ borderTop: `1px solid ${C.hairline}`, borderBottom: `1px solid ${C.hairline}` }}>
          {EXPENSES.slice(0, 4).map((e, i, arr) => {
            const proj = PROJECTS.find(p => p.id === e.project);
            const cat = CATEGORIES.find(c => c.key === e.category);
            return (
              <Row key={e.id} t={t}
                onClick={() => onNavigate('expense', e.id)}
                title={e.note}
                subtitle={`${proj?.name} · ${cat?.label} · ${relDate(e.date)}`}
                left={<div style={{
                  width: 32, height: 32, background: C.surface, border: `1px solid ${C.hairline}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon name={cat?.icon || 'folder'} size={16} color={C.ink2}/>
                </div>}
                meta={
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: T.num, fontSize: 14, fontWeight: 600, color: C.ink, ...T.tabular }}>
                      −{INR(e.amount)}
                    </div>
                    <div style={{ fontFamily: T.mono, fontSize: 10, color: e.status === 'Pending' ? C.warning : C.ink3, letterSpacing: 0.5 }}>
                      {e.status.toUpperCase()}
                    </div>
                  </div>
                }
                last={i === arr.length - 1}
              />
            );
          })}
        </div>
      </div>

      <div style={{ height: 40 }}/>
    </div>
  );
}

Object.assign(window, { TabBar, HomeScreen });
