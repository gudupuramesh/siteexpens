// Project detail extras: AttendanceTab, TimelineTab (editable), NewProjectScreen, StatusEditSheet, ProgressEditSheet
const { useState: useSt_PX, useMemo: useMemo_PX, useEffect: useEf_PX } = React;

// ── Sample workers (per-project assignment is implicit in this prototype)
const WORKERS = [
  { id: 'w1', name: 'Mahesh Kumar',   role: 'Mason',         rate: 850, phone: '+91 90030 11122' },
  { id: 'w2', name: 'Salim Ansari',   role: 'Tile-layer',    rate: 950, phone: '+91 91003 22134' },
  { id: 'w3', name: 'Ravi Yadav',     role: 'Helper',        rate: 600, phone: '+91 98884 01234' },
  { id: 'w4', name: 'Prakash Singh',  role: 'Electrician',   rate: 1100, phone: '+91 90089 33215' },
  { id: 'w5', name: 'Joseph D\u2019Souza', role: 'Carpenter', rate: 1050, phone: '+91 99001 87766' },
  { id: 'w6', name: 'Imran Khan',     role: 'Plumber',       rate: 1000, phone: '+91 90040 23344' },
  { id: 'w7', name: 'Sharif Ahmed',   role: 'Painter',       rate: 900, phone: '+91 91002 99001' },
  { id: 'w8', name: 'Lakshmi Devi',   role: 'Helper',        rate: 600, phone: '+91 90043 22345' },
];

// 10 days of attendance, keyed by date
function genAttendance() {
  const out = {};
  const days = 10;
  const today = new Date('2026-04-25T08:00:00');
  for (let d = 0; d < days; d++) {
    const date = new Date(today); date.setDate(today.getDate() - d);
    const ds = date.toISOString().slice(0,10);
    out[ds] = WORKERS.map((w, i) => {
      const r = (d * 13 + i * 7) % 11;
      let status = 'Present', hours = 8, inT = '08:30', outT = '17:30';
      if (r === 0) { status = 'Absent'; hours = 0; inT = '—'; outT = '—'; }
      else if (r === 1) { status = 'Half-day'; hours = 4; inT = '08:30'; outT = '12:30'; }
      else if (r === 2) { status = 'Overtime'; hours = 10; inT = '08:00'; outT = '18:00'; }
      return { workerId: w.id, status, hours, inT, outT };
    });
  }
  return out;
}
const ATTENDANCE_SEED = genAttendance();

// ── ATTENDANCE TAB
function AttendanceTab({ t, projectId }) {
  const { C, T, S } = t;
  const dates = Object.keys(ATTENDANCE_SEED).sort().reverse(); // newest first
  const [activeDate, setActiveDate] = useSt_PX(dates[0]);
  const [data, setData] = useSt_PX(ATTENDANCE_SEED);
  const [editing, setEditing] = useSt_PX(null); // workerId
  const [showAdd, setShowAdd] = useSt_PX(false);

  const day = data[activeDate] || [];
  const present = day.filter(d => d.status === 'Present' || d.status === 'Overtime').length;
  const half = day.filter(d => d.status === 'Half-day').length;
  const absent = day.filter(d => d.status === 'Absent').length;
  const totalHours = day.reduce((a, b) => a + b.hours, 0);
  const totalPay = day.reduce((a, b) => {
    const w = WORKERS.find(w => w.id === b.workerId);
    return a + (b.hours / 8) * (w?.rate || 0);
  }, 0);

  const updateRow = (workerId, patch) => {
    setData(prev => ({
      ...prev,
      [activeDate]: prev[activeDate].map(r => r.workerId === workerId ? { ...r, ...patch } : r),
    }));
  };

  const tone = (s) => s === 'Absent' ? C.danger : s === 'Half-day' ? C.warning : s === 'Overtime' ? C.accent : C.success;
  const statusBg = (s) => s === 'Absent' ? 'rgba(220,38,38,0.10)'
                       : s === 'Half-day' ? 'rgba(217,119,6,0.10)'
                       : s === 'Overtime' ? C.accentSoft
                       : 'rgba(22,163,74,0.10)';

  const fmtDay = (ds) => {
    const d = new Date(ds + 'T00:00:00');
    return { day: d.toLocaleDateString('en-IN', { weekday: 'short' }), num: d.getDate() };
  };

  const STATUSES = ['Present', 'Half-day', 'Overtime', 'Absent'];

  return (
    <div style={{ padding: `12px 0 30px` }}>
      {/* Date strip */}
      <div style={{
        display: 'flex', gap: 8, overflowX: 'auto', padding: `0 ${S.gutter}px 12px`,
        scrollbarWidth: 'none',
      }} className="no-scrollbar">
        {dates.map(d => {
          const f = fmtDay(d);
          const active = d === activeDate;
          const dayData = data[d] || [];
          const presentCount = dayData.filter(x => x.status !== 'Absent').length;
          return (
            <div key={d} onClick={() => setActiveDate(d)} style={{
              minWidth: 56, padding: '8px 6px', textAlign: 'center', cursor: 'pointer',
              borderRadius: 10,
              background: active ? C.ink : C.bg,
              border: `1px solid ${active ? C.ink : C.hairline2}`,
              flexShrink: 0,
            }}>
              <div style={{
                fontFamily: T.family, fontSize: 10, fontWeight: 600,
                color: active ? 'rgba(255,255,255,0.7)' : C.ink3, letterSpacing: 0.4, textTransform: 'uppercase',
              }}>{f.day}</div>
              <div style={{
                fontFamily: T.num, fontSize: 18, fontWeight: 700,
                color: active ? '#fff' : C.ink, marginTop: 2, ...T.tabular,
              }}>{f.num}</div>
              <div style={{
                marginTop: 4,
                fontFamily: T.family, fontSize: 9.5,
                color: active ? 'rgba(255,255,255,0.7)' : C.ink2, fontWeight: 600,
              }}>{presentCount}/{WORKERS.length}</div>
            </div>
          );
        })}
      </div>

      {/* Day summary */}
      <div style={{ padding: `0 ${S.gutter}px 14px` }}>
        <div style={{
          padding: '12px 14px', background: C.surface2, border: `1px solid ${C.hairline2}`,
          borderRadius: 12, display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: T.family, fontSize: 11, color: C.ink3, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>
              Day total · payable
            </div>
            <div style={{ fontFamily: T.num, fontSize: 22, fontWeight: 700, color: C.ink, marginTop: 2, letterSpacing: -0.5, ...T.tabular }}>
              ₹{Math.round(totalPay).toLocaleString('en-IN')}
            </div>
            <div style={{ fontFamily: T.family, fontSize: 11, color: C.ink2, marginTop: 2 }}>
              {totalHours} hrs · {present} present · {half} half · {absent} absent
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ width: 36, height: 36, border: `1px solid ${C.hairline2}`, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <Icon name="calendar" size={15} color={C.ink}/>
            </div>
            <div onClick={() => setShowAdd(true)} style={{
              width: 36, height: 36, background: C.accent, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              boxShadow: '0 4px 10px rgba(37,99,235,0.30)',
            }}>
              <Icon name="plus" size={16} color="#fff"/>
            </div>
          </div>
        </div>
      </div>

      {/* Worker list */}
      <div style={{ padding: `0 ${S.gutter}px 4px`, display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: T.family, fontSize: 11, color: C.ink3, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>
          Workers · {WORKERS.length}
        </div>
        <div style={{ fontFamily: T.family, fontSize: 11, color: C.ink3, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>
          Tap to log
        </div>
      </div>

      <div style={{ padding: `8px ${S.gutter}px 0`, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {day.map(row => {
          const w = WORKERS.find(x => x.id === row.workerId);
          if (!w) return null;
          const isEditing = editing === row.workerId;
          const pay = (row.hours / 8) * w.rate;
          return (
            <div key={row.workerId} style={{
              border: `1px solid ${C.hairline2}`, borderRadius: 12, background: C.bg,
              padding: 12, boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Avatar t={t} name={w.name} size={36}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: T.family, fontSize: 14, fontWeight: 600, color: C.ink, letterSpacing: -0.1 }}>{w.name}</div>
                  <div style={{ fontFamily: T.family, fontSize: 11.5, color: C.ink2, marginTop: 1 }}>
                    {w.role} · ₹{w.rate}/day
                  </div>
                </div>
                <div onClick={() => setEditing(isEditing ? null : row.workerId)} style={{
                  padding: '5px 10px', borderRadius: 999,
                  background: statusBg(row.status), color: tone(row.status),
                  fontFamily: T.family, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: 3, background: tone(row.status) }}/>
                  {row.status}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${C.hairline}` }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: T.family, fontSize: 9.5, color: C.ink3, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>In</div>
                  <div style={{ fontFamily: T.num, fontSize: 13, color: C.ink, fontWeight: 600, ...T.tabular }}>{row.inT}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: T.family, fontSize: 9.5, color: C.ink3, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>Out</div>
                  <div style={{ fontFamily: T.num, fontSize: 13, color: C.ink, fontWeight: 600, ...T.tabular }}>{row.outT}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: T.family, fontSize: 9.5, color: C.ink3, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>Hrs</div>
                  <div style={{ fontFamily: T.num, fontSize: 13, color: C.ink, fontWeight: 600, ...T.tabular }}>{row.hours}</div>
                </div>
                <div style={{ flex: 1.2 }}>
                  <div style={{ fontFamily: T.family, fontSize: 9.5, color: C.ink3, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>Pay</div>
                  <div style={{ fontFamily: T.num, fontSize: 13, color: C.ink, fontWeight: 700, ...T.tabular }}>₹{Math.round(pay).toLocaleString('en-IN')}</div>
                </div>
              </div>

              {isEditing && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${C.hairline}` }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {STATUSES.map(s => {
                      const isCur = row.status === s;
                      return (
                        <button key={s} onClick={() => {
                          let patch = { status: s };
                          if (s === 'Absent') patch = { ...patch, hours: 0, inT: '—', outT: '—' };
                          else if (s === 'Half-day') patch = { ...patch, hours: 4, inT: '08:30', outT: '12:30' };
                          else if (s === 'Overtime') patch = { ...patch, hours: 10, inT: '08:00', outT: '18:00' };
                          else patch = { ...patch, hours: 8, inT: '08:30', outT: '17:30' };
                          updateRow(row.workerId, patch);
                          setEditing(null);
                        }} style={{
                          padding: '7px 12px', borderRadius: 999,
                          border: `1px solid ${isCur ? tone(s) : C.hairline2}`,
                          background: isCur ? statusBg(s) : C.bg,
                          color: isCur ? tone(s) : C.ink,
                          fontFamily: T.family, fontSize: 12, fontWeight: isCur ? 700 : 500, cursor: 'pointer',
                        }}>{s}</button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add worker sheet (placeholder) */}
      {showAdd && (
        <div onClick={() => setShowAdd(false)} style={{
          position: 'absolute', inset: 0, zIndex: 700, background: 'rgba(15,23,42,0.45)',
          animation: 'fadeIn 180ms',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            background: C.bg, borderTopLeftRadius: 18, borderTopRightRadius: 18,
            animation: 'sheetUp 280ms cubic-bezier(.2,.8,.2,1)',
            maxHeight: '80%', display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ display:'flex', justifyContent:'center', paddingTop: 8 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: C.hairline2 }}/>
            </div>
            <div style={{ padding: `10px ${S.gutter}px 12px`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${C.hairline}` }}>
              <div style={{ fontFamily: T.family, fontSize: 17, fontWeight: 700, color: C.ink, letterSpacing: -0.3 }}>
                Add worker to attendance
              </div>
              <button onClick={() => setShowAdd(false)} style={{ width: 32, height: 32, borderRadius: 16, border: 'none', background: C.surface2, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
                <Icon name="close" size={16} color={C.ink}/>
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: `8px ${S.gutter}px 14px` }}>
              {WORKERS.map(w => (
                <div key={w.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
                  borderBottom: `1px solid ${C.hairline}`,
                }}>
                  <Avatar t={t} name={w.name} size={32}/>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: T.family, fontSize: 13, color: C.ink, fontWeight: 600 }}>{w.name}</div>
                    <div style={{ fontFamily: T.family, fontSize: 11, color: C.ink2 }}>{w.role} · ₹{w.rate}/day</div>
                  </div>
                  <Pill t={t} tone="success">Added</Pill>
                </div>
              ))}
              <div style={{ paddingTop: 10 }}>
                <button style={{
                  width: '100%', height: 44, borderRadius: 10, border: `1.5px dashed ${C.hairline2}`,
                  background: C.bg, color: C.accent, fontFamily: T.family, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}>
                  <Icon name="plus" size={14} color={C.accent}/>
                  Add new worker to directory
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── EDITABLE TIMELINE TAB
function TimelineTab({ t, projectId, project }) {
  const { C, T, S } = t;
  const [milestones, setMilestones] = useSt_PX([
    { id: 't1', d: '2026-01-14', title: 'Project kickoff', done: true,  note: 'Contract signed. 30% advance received.' },
    { id: 't2', d: '2026-02-06', title: 'Demolition + civil', done: true, note: 'Wet areas stripped. False ceiling removed.' },
    { id: 't3', d: '2026-03-02', title: 'Electrical + plumbing rough-in', done: true, note: 'First inspection cleared.' },
    { id: 't4', d: '2026-04-12', title: 'Flooring — Italian marble', done: true, note: 'Living, dining, master suite.' },
    { id: 't5', d: '2026-05-05', title: 'Carpentry install', done: false, note: 'Wardrobes, kitchen, TV units.' },
    { id: 't6', d: '2026-06-18', title: 'Finishes + polishing', done: false, note: 'Paint, polish, handover prep.' },
    { id: 't7', d: '2026-07-30', title: 'Handover',           done: false, note: 'Snag list, keys, warranty docs.' },
  ]);
  const [editing, setEditing] = useSt_PX(null); // milestone object or {new:true}

  const toggle = (id) => setMilestones(ms => ms.map(m => m.id === id ? { ...m, done: !m.done } : m));
  const save = (m) => {
    setMilestones(ms => {
      if (m.id) return ms.map(x => x.id === m.id ? m : x).sort((a,b) => a.d.localeCompare(b.d));
      return [...ms, { ...m, id: 't' + Date.now() }].sort((a,b) => a.d.localeCompare(b.d));
    });
    setEditing(null);
  };
  const remove = (id) => { setMilestones(ms => ms.filter(m => m.id !== id)); setEditing(null); };

  const completed = milestones.filter(m => m.done).length;

  return (
    <div style={{ padding: `14px 0 30px` }}>
      <div style={{
        padding: `0 ${S.gutter}px 14px`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontFamily: T.family, fontSize: 11, color: C.ink3, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            Project timeline · {milestones.length} milestones
          </div>
          <div style={{ fontFamily: T.family, fontSize: 13, color: C.ink, marginTop: 2, fontWeight: 600 }}>
            {completed} done · {milestones.length - completed} upcoming
          </div>
        </div>
        <button onClick={() => setEditing({ new: true, d: new Date().toISOString().slice(0,10), title: '', note: '', done: false })} style={{
          height: 32, padding: '0 12px', border: 'none', background: C.accent, color: '#fff',
          fontFamily: T.family, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 5, borderRadius: 8,
          boxShadow: '0 4px 10px rgba(37,99,235,0.25)',
        }}>
          <Icon name="plus" size={13} color="#fff"/> Add
        </button>
      </div>

      <div style={{ padding: `0 ${S.gutter}px` }}>
        {milestones.map((m, i, arr) => (
          <div key={m.id} style={{ display: 'flex', gap: 14, paddingBottom: i === arr.length - 1 ? 0 : 18, position: 'relative' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div onClick={() => toggle(m.id)} style={{
                width: 18, height: 18, border: `2px solid ${m.done ? C.accent : C.hairline2}`,
                background: m.done ? C.accent : C.bg, borderRadius: 9, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                marginTop: 2,
              }}>
                {m.done && <Icon name="check" size={10} color="#fff" strokeWidth={2.5}/>}
              </div>
              {i < arr.length - 1 && <div style={{ flex: 1, width: 2, background: C.hairline2, marginTop: 4, borderRadius: 1 }}/>}
            </div>
            <div onClick={() => setEditing(m)} style={{
              flex: 1, cursor: 'pointer', paddingBottom: 4,
              opacity: m.done ? 0.62 : 1,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontFamily: T.family, fontSize: 11, color: C.ink3, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                  {new Date(m.d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </div>
                <Icon name="edit" size={13} color={C.ink3}/>
              </div>
              <div style={{
                fontFamily: T.family, fontSize: 14.5, fontWeight: 600,
                color: m.done ? C.ink2 : C.ink, marginTop: 2, letterSpacing: -0.1,
                textDecoration: m.done ? 'line-through' : 'none',
              }}>{m.title}</div>
              {m.note && (
                <div style={{ fontFamily: T.family, fontSize: 12.5, color: C.ink2, marginTop: 3, lineHeight: '17px' }}>{m.note}</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <MilestoneEditSheet t={t} milestone={editing}
          onSave={save} onClose={() => setEditing(null)}
          onDelete={editing.id ? () => remove(editing.id) : null}
        />
      )}
    </div>
  );
}

// ── Milestone edit sheet
function MilestoneEditSheet({ t, milestone, onSave, onClose, onDelete }) {
  const { C, T, S } = t;
  const [m, setM] = useSt_PX(milestone);
  const isNew = !m.id;
  return (
    <div onClick={onClose} style={{
      position: 'absolute', inset: 0, zIndex: 600, background: 'rgba(15,23,42,0.45)',
      animation: 'fadeIn 180ms',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        background: C.bg, borderTopLeftRadius: 18, borderTopRightRadius: 18,
        animation: 'sheetUp 280ms cubic-bezier(.2,.8,.2,1)',
        maxHeight: '88%', display: 'flex', flexDirection: 'column',
        boxShadow: '0 -10px 40px rgba(15,23,42,0.18)',
      }}>
        <div style={{ display:'flex', justifyContent:'center', paddingTop: 8 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: C.hairline2 }}/>
        </div>
        <div style={{ padding: `10px ${S.gutter}px 14px`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${C.hairline}` }}>
          <div style={{ fontFamily: T.family, fontSize: 17, fontWeight: 700, color: C.ink, letterSpacing: -0.3 }}>
            {isNew ? 'New milestone' : 'Edit milestone'}
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 16, border: 'none', background: C.surface2, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
            <Icon name="close" size={16} color={C.ink}/>
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: `14px ${S.gutter}px 4px` }}>
          <Field t={t} label="Title">
            <input value={m.title} onChange={e => setM({ ...m, title: e.target.value })}
              placeholder="e.g. Carpentry install"
              style={inputStyle(C, T)}/>
          </Field>
          <Field t={t} label="Date">
            <input type="date" value={m.d} onChange={e => setM({ ...m, d: e.target.value })}
              style={inputStyle(C, T)}/>
          </Field>
          <Field t={t} label="Note (optional)">
            <textarea value={m.note} onChange={e => setM({ ...m, note: e.target.value })}
              placeholder="What's happening on this milestone…"
              rows={3}
              style={{ ...inputStyle(C, T), resize: 'none', height: 'auto', padding: '10px 12px' }}/>
          </Field>
          <div style={{ paddingTop: 4 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '6px 0' }}>
              <div style={{
                width: 22, height: 22, border: `2px solid ${m.done ? C.accent : C.hairline2}`,
                background: m.done ? C.accent : C.bg, borderRadius: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {m.done && <Icon name="check" size={12} color="#fff" strokeWidth={2.5}/>}
              </div>
              <input type="checkbox" checked={m.done} onChange={e => setM({ ...m, done: e.target.checked })} style={{ display: 'none' }}/>
              <span style={{ fontFamily: T.family, fontSize: 14, color: C.ink, fontWeight: 500 }}>
                Mark as completed
              </span>
            </label>
          </div>
        </div>

        <div style={{ padding: `12px ${S.gutter}px 16px`, borderTop: `1px solid ${C.hairline2}`, display: 'flex', gap: 10 }}>
          {onDelete && (
            <button onClick={onDelete} style={{
              height: 46, padding: '0 14px', borderRadius: 10,
              border: `1px solid ${C.danger}`, background: 'rgba(220,38,38,0.06)', color: C.danger,
              fontFamily: T.family, fontSize: 14, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <Icon name="trash" size={15} color={C.danger}/>
            </button>
          )}
          <button onClick={onClose} style={{
            flex: 1, height: 46, borderRadius: 10,
            border: `1px solid ${C.hairline2}`, background: C.bg, color: C.ink,
            fontFamily: T.family, fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={() => onSave(m)} disabled={!m.title || !m.d} style={{
            flex: 2, height: 46, borderRadius: 10, border: 'none',
            background: (m.title && m.d) ? C.accent : C.hairline, color: '#fff',
            fontFamily: T.family, fontSize: 14, fontWeight: 600, cursor: (m.title && m.d) ? 'pointer' : 'default',
            boxShadow: (m.title && m.d) ? '0 4px 10px rgba(37,99,235,0.28)' : 'none',
          }}>{isNew ? 'Add milestone' : 'Save changes'}</button>
        </div>
      </div>
    </div>
  );
}

// ── helpers
const inputStyle = (C, T) => ({
  width: '100%', height: 44, border: `1px solid ${C.hairline2}`,
  borderRadius: 10, padding: '0 12px', background: C.bg,
  fontFamily: T.family, fontSize: 14, color: C.ink, outline: 'none',
  boxSizing: 'border-box',
});

function Field({ t, label, hint, children }) {
  const { C, T } = t;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontFamily: T.family, fontSize: 11, color: C.ink3, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6 }}>
        {label}
      </div>
      {children}
      {hint && <div style={{ fontFamily: T.family, fontSize: 11.5, color: C.ink3, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

// ── NEW PROJECT FORM
function NewProjectScreen({ t, onCreate, onCancel }) {
  const { C, T, S } = t;
  const [form, setForm] = useSt_PX({
    name: '', client: '', type: 'Residential — 3BHK', location: '',
    budget: '', start: new Date().toISOString().slice(0,10),
    end: '', team: 4, status: 'Active', progress: 0,
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const TYPES = [
    'Residential — 1BHK', 'Residential — 2BHK', 'Residential — 3BHK',
    'Residential — 4BHK Villa', 'Residential — Penthouse',
    'Commercial — Studio Office', 'Commercial — Retail', 'Hospitality — Café',
    'Hospitality — Restaurant', 'Hospitality — Hotel',
  ];
  const STATUSES = [
    { k: 'Active', tone: C.success },
    { k: 'On Hold', tone: C.warning },
    { k: 'Completed', tone: C.ink2 },
  ];
  const valid = form.name && form.client && form.location && form.budget && form.start && form.end;

  return (
    <div style={{ background: C.bg, position: 'relative', minHeight: '100%' }}>
      <div style={{
        padding: `4px ${S.gutter}px 14px`, display: 'flex', alignItems: 'center', gap: 10,
        borderBottom: `1px solid ${C.hairline}`,
      }}>
        <div onClick={onCancel} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', color: C.ink2 }}>
          <Icon name="chev_l" size={20} color={C.ink2}/>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: T.family, fontSize: 18, fontWeight: 700, color: C.ink, letterSpacing: -0.3 }}>
            New project
          </div>
          <div style={{ fontFamily: T.family, fontSize: 12, color: C.ink2 }}>
            Set up the basics. You can refine later.
          </div>
        </div>
      </div>

      <div style={{ padding: `18px ${S.gutter}px 120px` }}>
        <Field t={t} label="Project name">
          <input value={form.name} onChange={e => set('name', e.target.value)}
            placeholder="e.g. Koramandal Residence" style={inputStyle(C, T)}/>
        </Field>

        <Field t={t} label="Client">
          <input value={form.client} onChange={e => set('client', e.target.value)}
            placeholder="Owner / point of contact" style={inputStyle(C, T)}/>
        </Field>

        <Field t={t} label="Project type">
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 6,
          }}>
            {TYPES.map(ty => (
              <button key={ty} onClick={() => set('type', ty)} style={{
                padding: '8px 12px', borderRadius: 999,
                border: `1px solid ${form.type === ty ? C.accent : C.hairline2}`,
                background: form.type === ty ? C.accentSoft : C.bg,
                color: form.type === ty ? C.accent : C.ink,
                fontFamily: T.family, fontSize: 12, fontWeight: form.type === ty ? 600 : 500, cursor: 'pointer',
              }}>{ty}</button>
            ))}
          </div>
        </Field>

        <Field t={t} label="Location">
          <input value={form.location} onChange={e => set('location', e.target.value)}
            placeholder="Neighbourhood, city" style={inputStyle(C, T)}/>
        </Field>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <Field t={t} label="Start date">
              <input type="date" value={form.start} onChange={e => set('start', e.target.value)} style={inputStyle(C, T)}/>
            </Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field t={t} label="Target handover">
              <input type="date" value={form.end} onChange={e => set('end', e.target.value)} style={inputStyle(C, T)}/>
            </Field>
          </div>
        </div>

        <Field t={t} label="Budget" hint="Total budget for the project, in INR.">
          <div style={{ position: 'relative' }}>
            <span style={{
              position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
              fontFamily: T.family, fontSize: 14, color: C.ink3, fontWeight: 600,
            }}>₹</span>
            <input value={form.budget} onChange={e => set('budget', e.target.value.replace(/[^0-9]/g,''))}
              placeholder="0"
              style={{ ...inputStyle(C, T), paddingLeft: 26, fontFamily: T.num, ...T.tabular, fontWeight: 600 }}/>
            {form.budget && (
              <div style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                fontFamily: T.family, fontSize: 11, color: C.ink3, fontWeight: 600,
              }}>{INRcompact(parseInt(form.budget,10))}</div>
            )}
          </div>
        </Field>

        <Field t={t} label="Team size">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => set('team', Math.max(1, form.team - 1))} style={{
              width: 38, height: 38, borderRadius: 10, border: `1px solid ${C.hairline2}`,
              background: C.bg, fontFamily: T.family, fontSize: 18, color: C.ink, cursor: 'pointer', fontWeight: 600,
            }}>−</button>
            <div style={{
              flex: 1, height: 38, borderRadius: 10, border: `1px solid ${C.hairline2}`, background: C.surface2,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: T.num, fontSize: 16, color: C.ink, fontWeight: 700, ...T.tabular,
            }}>{form.team} people</div>
            <button onClick={() => set('team', form.team + 1)} style={{
              width: 38, height: 38, borderRadius: 10, border: `1px solid ${C.hairline2}`,
              background: C.bg, fontFamily: T.family, fontSize: 18, color: C.ink, cursor: 'pointer', fontWeight: 600,
            }}>+</button>
          </div>
        </Field>

        <Field t={t} label="Initial status">
          <div style={{ display: 'flex', gap: 6 }}>
            {STATUSES.map(s => (
              <button key={s.k} onClick={() => set('status', s.k)} style={{
                flex: 1, height: 40, borderRadius: 10,
                border: `1px solid ${form.status === s.k ? s.tone : C.hairline2}`,
                background: form.status === s.k ? `${s.tone}14` : C.bg,
                color: form.status === s.k ? s.tone : C.ink,
                fontFamily: T.family, fontSize: 13, fontWeight: form.status === s.k ? 700 : 500, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                <span style={{ width: 7, height: 7, borderRadius: 4, background: s.tone }}/>
                {s.k}
              </button>
            ))}
          </div>
        </Field>

        <Field t={t} label={`Initial progress · ${form.progress}%`}>
          <input type="range" min="0" max="100" step="5" value={form.progress}
            onChange={e => set('progress', parseInt(e.target.value, 10))}
            style={{ width: '100%', accentColor: C.accent }}/>
        </Field>
      </div>

      {/* Sticky footer */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        padding: `12px ${S.gutter}px 16px`,
        background: 'rgba(255,255,255,0.94)', backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        borderTop: `1px solid ${C.hairline2}`, display: 'flex', gap: 10,
      }}>
        <button onClick={onCancel} style={{
          flex: 1, height: 46, borderRadius: 10,
          border: `1px solid ${C.hairline2}`, background: C.bg, color: C.ink,
          fontFamily: T.family, fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}>Cancel</button>
        <button onClick={() => valid && onCreate(form)} disabled={!valid} style={{
          flex: 2, height: 46, borderRadius: 10, border: 'none',
          background: valid ? C.accent : C.hairline, color: '#fff',
          fontFamily: T.family, fontSize: 14, fontWeight: 600, cursor: valid ? 'pointer' : 'default',
          boxShadow: valid ? '0 6px 14px rgba(37,99,235,0.30)' : 'none',
        }}>Create project</button>
      </div>
    </div>
  );
}

// ── Status quick-edit sheet (for project list)
function StatusEditSheet({ t, project, onPick, onClose }) {
  const { C, T, S } = t;
  const STATUSES = [
    { k: 'Active', tone: C.success, desc: 'Work is on. Visible everywhere.' },
    { k: 'On Hold', tone: C.warning, desc: 'Paused. Stays in dashboards but flagged.' },
    { k: 'Completed', tone: C.ink2, desc: 'Closed out. Read-only.' },
  ];
  return (
    <div onClick={onClose} style={{
      position: 'absolute', inset: 0, zIndex: 700, background: 'rgba(15,23,42,0.45)',
      animation: 'fadeIn 180ms',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        background: C.bg, borderTopLeftRadius: 18, borderTopRightRadius: 18,
        animation: 'sheetUp 280ms cubic-bezier(.2,.8,.2,1)',
        boxShadow: '0 -10px 40px rgba(15,23,42,0.18)',
      }}>
        <div style={{ display:'flex', justifyContent:'center', paddingTop: 8 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: C.hairline2 }}/>
        </div>
        <div style={{ padding: `10px ${S.gutter}px 14px`, borderBottom: `1px solid ${C.hairline}` }}>
          <div style={{ fontFamily: T.family, fontSize: 17, fontWeight: 700, color: C.ink, letterSpacing: -0.3 }}>
            Update status
          </div>
          <div style={{ fontFamily: T.family, fontSize: 12.5, color: C.ink2, marginTop: 1 }}>
            {project.name}
          </div>
        </div>
        <div style={{ padding: `8px ${S.gutter}px 16px` }}>
          {STATUSES.map(s => {
            const cur = project.status === s.k;
            return (
              <button key={s.k} onClick={() => onPick(s.k)} style={{
                width: '100%', textAlign: 'left',
                padding: '14px 12px', marginBottom: 6, borderRadius: 12,
                border: `1px solid ${cur ? s.tone : C.hairline2}`,
                background: cur ? `${s.tone}14` : C.bg,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <span style={{ width: 10, height: 10, borderRadius: 5, background: s.tone }}/>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: T.family, fontSize: 14, color: C.ink, fontWeight: 700 }}>{s.k}</div>
                  <div style={{ fontFamily: T.family, fontSize: 12, color: C.ink2, marginTop: 1 }}>{s.desc}</div>
                </div>
                {cur && <Icon name="check" size={18} color={s.tone} strokeWidth={2.5}/>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Progress quick-edit sheet
function ProgressEditSheet({ t, value, onSave, onClose }) {
  const { C, T, S } = t;
  const [v, setV] = useSt_PX(value);
  const PRESETS = [0, 25, 50, 75, 100];
  return (
    <div onClick={onClose} style={{
      position: 'absolute', inset: 0, zIndex: 700, background: 'rgba(15,23,42,0.45)',
      animation: 'fadeIn 180ms',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        background: C.bg, borderTopLeftRadius: 18, borderTopRightRadius: 18,
        animation: 'sheetUp 280ms cubic-bezier(.2,.8,.2,1)',
        boxShadow: '0 -10px 40px rgba(15,23,42,0.18)',
      }}>
        <div style={{ display:'flex', justifyContent:'center', paddingTop: 8 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: C.hairline2 }}/>
        </div>
        <div style={{ padding: `10px ${S.gutter}px 14px`, borderBottom: `1px solid ${C.hairline}` }}>
          <div style={{ fontFamily: T.family, fontSize: 17, fontWeight: 700, color: C.ink, letterSpacing: -0.3 }}>
            Update progress
          </div>
          <div style={{ fontFamily: T.family, fontSize: 12.5, color: C.ink2, marginTop: 1 }}>
            How far along is the project right now?
          </div>
        </div>
        <div style={{ padding: `20px ${S.gutter}px 8px`, textAlign: 'center' }}>
          <div style={{
            fontFamily: T.num, fontSize: 56, fontWeight: 700, color: C.accent,
            letterSpacing: -2, ...T.tabular,
          }}>{v}<span style={{ fontSize: 28, color: C.ink2 }}>%</span></div>
        </div>
        <div style={{ padding: `0 ${S.gutter}px 12px` }}>
          <input type="range" min="0" max="100" step="5" value={v}
            onChange={e => setV(parseInt(e.target.value, 10))}
            style={{ width: '100%', accentColor: C.accent, height: 28 }}/>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            {PRESETS.map(p => (
              <button key={p} onClick={() => setV(p)} style={{
                flex: 1, height: 36, borderRadius: 8,
                border: `1px solid ${v === p ? C.accent : C.hairline2}`,
                background: v === p ? C.accentSoft : C.bg,
                color: v === p ? C.accent : C.ink,
                fontFamily: T.family, fontSize: 12, fontWeight: v === p ? 700 : 500, cursor: 'pointer',
              }}>{p}%</button>
            ))}
          </div>
        </div>
        <div style={{ padding: `12px ${S.gutter}px 16px`, borderTop: `1px solid ${C.hairline2}`, display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, height: 46, borderRadius: 10,
            border: `1px solid ${C.hairline2}`, background: C.bg, color: C.ink,
            fontFamily: T.family, fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={() => onSave(v)} style={{
            flex: 2, height: 46, borderRadius: 10, border: 'none',
            background: C.accent, color: '#fff',
            fontFamily: T.family, fontSize: 14, fontWeight: 600, cursor: 'pointer',
            boxShadow: '0 4px 10px rgba(37,99,235,0.28)',
          }}>Save · {v}%</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  AttendanceTab, TimelineTab, MilestoneEditSheet, NewProjectScreen,
  StatusEditSheet, ProgressEditSheet, WORKERS,
});
