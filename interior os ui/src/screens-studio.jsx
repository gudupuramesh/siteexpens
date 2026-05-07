// Studio profile screen — view & edit studio details
const { useState: useSt_SP } = React;

const STUDIO_DEFAULT = {
  name: 'Studio Atelier',
  tagline: 'Residential & hospitality interiors · Hyderabad',
  ownerName: 'Meher Nair',
  ownerTitle: 'Principal Designer · Studio Owner',
  founded: 2018,
  email: 'hello@studioatelier.in',
  altEmail: 'accounts@studioatelier.in',
  phone: '+91 98480 11234',
  altPhone: '+91 40 2354 8800',
  website: 'studioatelier.in',
  instagram: '@studio.atelier',
  linkedin: 'studio-atelier',
  address1: '4-1-7, Gulistan House',
  address2: 'Road No. 12, Banjara Hills',
  city: 'Hyderabad',
  state: 'Telangana',
  pincode: '500034',
  country: 'India',
  gst: '36ABCDE1234F1Z5',
  pan: 'ABCDE1234F',
  rera: 'TS/A0287/2024',
  bankName: 'HDFC Bank',
  bankAccount: 'XXXX XXXX 5821',
  bankIFSC: 'HDFC0001045',
  bankBranch: 'Banjara Hills, Hyderabad',
  upi: 'studioatelier@hdfc',
  // KPIs (illustrative)
  liveProjects: 6,
  completedProjects: 41,
  teamSize: 12,
  cities: 3,
};

const STUDIO_TEAM = [
  { name: 'Meher Nair',     role: 'Principal Designer',   tag: 'Owner' },
  { name: 'Aarav Kapoor',   role: 'Senior Designer',      tag: 'Lead' },
  { name: 'Sunita Iyer',    role: 'Project Manager',      tag: 'PM' },
  { name: 'Ravi Prakash',   role: 'Site Supervisor',      tag: 'Site' },
  { name: 'Joseph D\u2019Souza', role: 'Carpenter Lead',  tag: 'Site' },
];

function StudioProfileScreen({ t, onBack }) {
  const { C, T, S } = t;
  const [editing, setEditing] = useSt_SP(false);
  const [data, setData] = useSt_SP(STUDIO_DEFAULT);
  const [draft, setDraft] = useSt_SP(STUDIO_DEFAULT);
  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));

  const startEdit = () => { setDraft(data); setEditing(true); };
  const save = () => { setData(draft); setEditing(false); };
  const cancel = () => { setDraft(data); setEditing(false); };

  const view = editing ? draft : data;

  return (
    <div style={{ background: C.bg, minHeight: '100%', position: 'relative', paddingBottom: editing ? 96 : 30 }}>
      {/* Header bar */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10, background: C.bg,
        padding: `4px ${S.gutter}px 12px`, display: 'flex', alignItems: 'center', gap: 8,
        borderBottom: `1px solid ${C.hairline}`,
      }}>
        <div onClick={onBack} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', color: C.ink2 }}>
          <Icon name="chev_l" size={20} color={C.ink2}/>
        </div>
        <div style={{ flex: 1, fontFamily: T.family, fontSize: 16, fontWeight: 700, color: C.ink, letterSpacing: -0.3 }}>
          Studio profile
        </div>
        {!editing ? (
          <button onClick={startEdit} style={{
            height: 32, padding: '0 12px', borderRadius: 8, border: `1px solid ${C.hairline2}`,
            background: C.bg, color: C.ink, fontFamily: T.family, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <Icon name="edit" size={13} color={C.ink}/> Edit
          </button>
        ) : (
          <button onClick={cancel} style={{
            height: 32, padding: '0 12px', borderRadius: 8, border: 'none',
            background: 'transparent', color: C.ink2, fontFamily: T.family, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
          }}>Cancel</button>
        )}
      </div>

      {/* Cover */}
      <div style={{ position: 'relative', height: 130 }}>
        {/* Architectural backdrop */}
        <div style={{
          position: 'absolute', inset: 0,
          background: `linear-gradient(135deg, ${C.accent} 0%, ${C.ink} 100%)`,
        }}/>
        <svg viewBox="0 0 400 130" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.18 }}>
          <defs>
            <pattern id="studioGrid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#fff" strokeWidth="0.6"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#studioGrid)"/>
          {/* Stylized skyline */}
          <g fill="rgba(255,255,255,0.18)">
            <rect x="20" y="80" width="34" height="50"/>
            <rect x="60" y="60" width="22" height="70"/>
            <rect x="86" y="72" width="40" height="58"/>
            <rect x="130" y="50" width="28" height="80"/>
            <rect x="162" y="68" width="36" height="62"/>
            <rect x="202" y="58" width="44" height="72"/>
            <rect x="250" y="78" width="30" height="52"/>
            <rect x="284" y="64" width="26" height="66"/>
            <rect x="314" y="72" width="38" height="58"/>
            <rect x="356" y="56" width="30" height="74"/>
          </g>
        </svg>
        {/* Edit cover button */}
        {editing && (
          <button style={{
            position: 'absolute', right: 14, top: 14, height: 30, padding: '0 10px',
            border: 'none', borderRadius: 8, background: 'rgba(255,255,255,0.95)',
            color: C.ink, fontFamily: T.family, fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <Icon name="image" size={12} color={C.ink}/> Change cover
          </button>
        )}
      </div>

      {/* Logo + name */}
      <div style={{
        padding: `0 ${S.gutter}px 0`, marginTop: -42,
        display: 'flex', alignItems: 'flex-end', gap: 14,
      }}>
        <div style={{ position: 'relative' }}>
          <div style={{
            width: 84, height: 84, borderRadius: 18,
            background: '#fff', border: `3px solid ${C.bg}`,
            boxShadow: '0 6px 18px rgba(15,23,42,0.18)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
          }}>
            <svg width="84" height="84" viewBox="0 0 84 84">
              <rect width="84" height="84" fill={C.surface2}/>
              <rect x="14" y="14" width="56" height="56" fill="none" stroke={C.ink} strokeWidth="1.5"/>
              <text x="42" y="50" textAnchor="middle"
                fontFamily={T.family} fontSize="22" fontWeight="700" fill={C.accent} letterSpacing="-0.5">
                SA
              </text>
            </svg>
          </div>
          {editing && (
            <button style={{
              position: 'absolute', bottom: -4, right: -4, width: 28, height: 28, borderRadius: 14,
              background: C.accent, border: `2px solid ${C.bg}`, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon name="camera" size={13} color="#fff"/>
            </button>
          )}
        </div>
        <div style={{ flex: 1, paddingBottom: 4 }}>
          <Pill t={t} tone="accent">{view.role || 'Owner workspace'}</Pill>
        </div>
      </div>

      {/* Identity */}
      <div style={{ padding: `12px ${S.gutter}px 0` }}>
        {editing ? (
          <input value={view.name} onChange={e => set('name', e.target.value)}
            style={{
              width: '100%', border: 'none', borderBottom: `1.5px solid ${C.hairline2}`,
              fontFamily: T.family, fontSize: 22, fontWeight: 700, color: C.ink, letterSpacing: -0.5,
              padding: '4px 0', background: 'transparent', outline: 'none',
            }}/>
        ) : (
          <div style={{ fontFamily: T.family, fontSize: 22, fontWeight: 700, color: C.ink, letterSpacing: -0.5 }}>
            {view.name}
          </div>
        )}
        {editing ? (
          <input value={view.tagline} onChange={e => set('tagline', e.target.value)}
            placeholder="Add a short tagline"
            style={{
              width: '100%', marginTop: 4, border: 'none',
              fontFamily: T.family, fontSize: 13, color: C.ink2, padding: '4px 0',
              background: 'transparent', outline: 'none',
              borderBottom: `1px solid ${C.hairline}`,
            }}/>
        ) : (
          <div style={{ fontFamily: T.family, fontSize: 13, color: C.ink2, marginTop: 4 }}>
            {view.tagline}
          </div>
        )}
        <div style={{
          marginTop: 8, display: 'flex', alignItems: 'center', gap: 6,
          fontFamily: T.family, fontSize: 11.5, color: C.ink3, fontWeight: 600, letterSpacing: 0.3,
        }}>
          <Icon name="pin" size={12} color={C.ink3}/>
          {view.city}, {view.state} · Founded {view.founded}
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ padding: `16px ${S.gutter}px 4px` }}>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
          border: `1px solid ${C.hairline2}`, borderRadius: 12, background: C.surface2, overflow: 'hidden',
        }}>
          {[
            { k: view.liveProjects,        label: 'Live projects' },
            { k: view.completedProjects,   label: 'Completed' },
            { k: view.teamSize,            label: 'Team' },
            { k: view.cities,              label: 'Cities' },
          ].map((kpi, i) => (
            <div key={i} style={{
              padding: '12px 8px', textAlign: 'center',
              borderRight: i < 3 ? `1px solid ${C.hairline2}` : 'none',
            }}>
              <div style={{ fontFamily: T.num, fontSize: 22, fontWeight: 700, color: C.ink, letterSpacing: -0.5, ...T.tabular }}>
                {kpi.k}
              </div>
              <div style={{
                fontFamily: T.family, fontSize: 10, color: C.ink3,
                fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase', marginTop: 2,
              }}>
                {kpi.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Contact */}
      <SPSection t={t} title="Contact">
        <SPField t={t} label="Primary email" icon="mail" value={view.email}
          editing={editing} onChange={v => set('email', v)} action={!editing ? 'Copy' : null}/>
        <SPField t={t} label="Accounts email" icon="mail" value={view.altEmail}
          editing={editing} onChange={v => set('altEmail', v)}/>
        <SPField t={t} label="Mobile" icon="phone" value={view.phone}
          editing={editing} onChange={v => set('phone', v)} action={!editing ? 'Call' : null}/>
        <SPField t={t} label="Studio line" icon="phone" value={view.altPhone}
          editing={editing} onChange={v => set('altPhone', v)}/>
        <SPField t={t} label="Website" icon="globe" value={view.website}
          editing={editing} onChange={v => set('website', v)} action={!editing ? 'Open' : null} last/>
      </SPSection>

      {/* Address */}
      <SPSection t={t} title="Studio address">
        {editing ? (
          <div style={{ padding: `12px ${S.gutter}px 14px`, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <SPInput t={t} label="Address line 1" value={view.address1} onChange={v => set('address1', v)}/>
            <SPInput t={t} label="Address line 2" value={view.address2} onChange={v => set('address2', v)}/>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}><SPInput t={t} label="City" value={view.city} onChange={v => set('city', v)}/></div>
              <div style={{ flex: 1 }}><SPInput t={t} label="State" value={view.state} onChange={v => set('state', v)}/></div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}><SPInput t={t} label="Pincode" value={view.pincode} onChange={v => set('pincode', v)}/></div>
              <div style={{ flex: 1 }}><SPInput t={t} label="Country" value={view.country} onChange={v => set('country', v)}/></div>
            </div>
          </div>
        ) : (
          <div style={{ padding: `14px ${S.gutter}px`, display: 'flex', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: C.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="pin" size={16} color={C.accent}/>
            </div>
            <div style={{ flex: 1, fontFamily: T.family, fontSize: 13.5, color: C.ink, lineHeight: '20px' }}>
              {view.address1}<br/>
              {view.address2}<br/>
              {view.city}, {view.state} {view.pincode}<br/>
              <span style={{ color: C.ink2 }}>{view.country}</span>
            </div>
            <button style={{
              alignSelf: 'flex-start', height: 30, padding: '0 10px', border: `1px solid ${C.hairline2}`,
              borderRadius: 8, background: C.bg, color: C.ink, fontFamily: T.family, fontSize: 11.5, fontWeight: 600,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <Icon name="pin" size={12} color={C.ink}/> Map
            </button>
          </div>
        )}
      </SPSection>

      {/* Compliance */}
      <SPSection t={t} title="Compliance & registration">
        <SPField t={t} label="GSTIN" icon="archive" value={view.gst} mono
          editing={editing} onChange={v => set('gst', v)}/>
        <SPField t={t} label="PAN" icon="shield" value={view.pan} mono
          editing={editing} onChange={v => set('pan', v)}/>
        <SPField t={t} label="RERA registration" icon="shield" value={view.rera} mono
          editing={editing} onChange={v => set('rera', v)} last/>
      </SPSection>

      {/* Banking */}
      <SPSection t={t} title="Banking">
        <SPField t={t} label="Bank" icon="archive" value={view.bankName}
          editing={editing} onChange={v => set('bankName', v)}/>
        <SPField t={t} label="Account" icon="archive" value={view.bankAccount} mono
          editing={editing} onChange={v => set('bankAccount', v)}/>
        <SPField t={t} label="IFSC" icon="archive" value={view.bankIFSC} mono
          editing={editing} onChange={v => set('bankIFSC', v)}/>
        <SPField t={t} label="Branch" icon="pin" value={view.bankBranch}
          editing={editing} onChange={v => set('bankBranch', v)}/>
        <SPField t={t} label="UPI" icon="zap" value={view.upi}
          editing={editing} onChange={v => set('upi', v)} mono last/>
      </SPSection>

      {/* Social */}
      <SPSection t={t} title="Social & links">
        <SPField t={t} label="Instagram" icon="image" value={view.instagram}
          editing={editing} onChange={v => set('instagram', v)}/>
        <SPField t={t} label="LinkedIn" icon="users" value={view.linkedin}
          editing={editing} onChange={v => set('linkedin', v)} last/>
      </SPSection>

      {/* Team preview */}
      {!editing && (
        <SPSection t={t} title={`Team \u00b7 ${STUDIO_TEAM.length}`} action="See all">
          <div style={{ padding: `4px ${S.gutter}px 12px`, display: 'flex', flexDirection: 'column' }}>
            {STUDIO_TEAM.map((m, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 0', borderBottom: i < STUDIO_TEAM.length - 1 ? `1px solid ${C.hairline}` : 'none',
              }}>
                <Avatar t={t} name={m.name} size={36}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: T.family, fontSize: 13.5, color: C.ink, fontWeight: 600 }}>{m.name}</div>
                  <div style={{ fontFamily: T.family, fontSize: 11.5, color: C.ink2 }}>{m.role}</div>
                </div>
                <Pill t={t} tone={m.tag === 'Owner' ? 'accent' : 'default'}>{m.tag}</Pill>
              </div>
            ))}
          </div>
        </SPSection>
      )}

      {/* Danger zone (edit mode) */}
      {editing && (
        <SPSection t={t} title="Danger zone">
          <div style={{ padding: `12px ${S.gutter}px 16px` }}>
            <button style={{
              width: '100%', height: 44, borderRadius: 10,
              border: `1px solid ${C.danger}`, background: 'rgba(220,38,38,0.06)', color: C.danger,
              fontFamily: T.family, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              <Icon name="trash" size={14} color={C.danger}/>
              Delete studio workspace
            </button>
          </div>
        </SPSection>
      )}

      <div style={{ padding: `12px ${S.gutter}px 24px`, textAlign: 'center', fontFamily: T.family, fontSize: 11, color: C.ink3, fontWeight: 600, letterSpacing: 1 }}>
        STUDIO ID · {view.gst.slice(0,8)} · v1.0
      </div>

      {/* Sticky save bar in edit mode */}
      {editing && (
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          padding: `12px ${S.gutter}px 16px`,
          background: 'rgba(255,255,255,0.94)', backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          borderTop: `1px solid ${C.hairline2}`, display: 'flex', gap: 10,
        }}>
          <button onClick={cancel} style={{
            flex: 1, height: 46, borderRadius: 10,
            border: `1px solid ${C.hairline2}`, background: C.bg, color: C.ink,
            fontFamily: T.family, fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>Discard</button>
          <button onClick={save} style={{
            flex: 2, height: 46, borderRadius: 10, border: 'none',
            background: C.accent, color: '#fff',
            fontFamily: T.family, fontSize: 14, fontWeight: 600, cursor: 'pointer',
            boxShadow: '0 6px 14px rgba(37,99,235,0.30)',
          }}>Save changes</button>
        </div>
      )}
    </div>
  );
}

// ── Section wrapper
function SPSection({ t, title, action, children }) {
  const { C, T, S } = t;
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: `0 ${S.gutter}px 8px`,
      }}>
        <div style={{
          fontFamily: T.family, fontSize: 11, color: C.ink3, fontWeight: 700,
          letterSpacing: 0.5, textTransform: 'uppercase',
        }}>{title}</div>
        {action && (
          <div style={{ fontFamily: T.family, fontSize: 12, color: C.accent, fontWeight: 600, cursor: 'pointer' }}>
            {action}
          </div>
        )}
      </div>
      <div style={{
        margin: `0 ${S.gutter}px`, border: `1px solid ${C.hairline2}`, borderRadius: 12,
        background: C.bg, overflow: 'hidden',
      }}>
        {children}
      </div>
    </div>
  );
}

// ── Field row (read or edit)
function SPField({ t, label, value, icon, action, mono, editing, onChange, last }) {
  const { C, T, S } = t;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
      borderBottom: last ? 'none' : `1px solid ${C.hairline}`,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8, background: C.surface2,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon name={icon} size={14} color={C.ink2}/>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: T.family, fontSize: 10.5, color: C.ink3, fontWeight: 700,
          letterSpacing: 0.4, textTransform: 'uppercase',
        }}>{label}</div>
        {editing ? (
          <input value={value} onChange={e => onChange(e.target.value)} style={{
            width: '100%', marginTop: 2, border: 'none', outline: 'none',
            background: 'transparent', padding: 0,
            fontFamily: mono ? T.mono : T.family, fontSize: 13.5, color: C.ink, fontWeight: 500,
            ...(mono ? T.tabular : {}),
          }}/>
        ) : (
          <div style={{
            fontFamily: mono ? T.mono : T.family, fontSize: 13.5, color: C.ink, fontWeight: 500, marginTop: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            ...(mono ? T.tabular : {}),
          }}>{value || '—'}</div>
        )}
      </div>
      {action && !editing && (
        <button style={{
          height: 28, padding: '0 10px', border: `1px solid ${C.hairline2}`,
          borderRadius: 7, background: C.bg, color: C.accent,
          fontFamily: T.family, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
        }}>{action}</button>
      )}
    </div>
  );
}

// ── Standalone label+input (for address block)
function SPInput({ t, label, value, onChange }) {
  const { C, T } = t;
  return (
    <div>
      <div style={{
        fontFamily: T.family, fontSize: 10.5, color: C.ink3, fontWeight: 700,
        letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 4,
      }}>{label}</div>
      <input value={value} onChange={e => onChange(e.target.value)} style={{
        width: '100%', height: 40, border: `1px solid ${C.hairline2}`, borderRadius: 9,
        padding: '0 12px', background: C.bg, fontFamily: T.family, fontSize: 13.5, color: C.ink,
        outline: 'none', boxSizing: 'border-box',
      }}/>
    </div>
  );
}

Object.assign(window, { StudioProfileScreen });
