// UI primitives for InteriorOS
// Sharp corners (4-8px), hairline dividers, iOS-Settings-esque grouped lists
// but denser and warmer.

const { useState: useSt_prim, useRef: useRef_prim, useEffect: useEf_prim } = React;

// ── Row: the workhorse. Left icon, title, subtitle, right accessory, chevron
function Row({ t, tokens, title, subtitle, left, right, chevron = false, onClick, meta, destructive = false, dense = false, first = false, last = false, noDivider = false }) {
  const { C, S, T } = t || tokens;
  const [pressed, setPressed] = useSt_prim(false);
  return (
    <div
      onMouseDown={() => onClick && setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center',
        minHeight: dense ? S.rowHtight : S.rowH,
        padding: `0 ${S.gutter}px`,
        background: pressed ? C.pressed : 'transparent',
        cursor: onClick ? 'pointer' : 'default',
        position: 'relative',
        transition: 'background 80ms',
      }}
    >
      {left && <div style={{ marginRight: 12, display: 'flex', alignItems: 'center', color: C.ink2 }}>{left}</div>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: T.family, fontSize: 15, fontWeight: 500,
          color: destructive ? C.danger : C.ink,
          letterSpacing: -0.1, lineHeight: '20px',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{title}</div>
        {subtitle && <div style={{
          fontFamily: T.family, fontSize: 13, fontWeight: 400,
          color: C.ink2, marginTop: 2, lineHeight: '16px',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{subtitle}</div>}
      </div>
      {meta && <div style={{
        fontFamily: T.family, fontSize: 13, color: C.ink2,
        marginRight: chevron ? 6 : 0, ...T.tabular,
      }}>{meta}</div>}
      {right && <div style={{ marginLeft: 8, display: 'flex', alignItems: 'center' }}>{right}</div>}
      {chevron && <Icon name="chev_r" size={14} color={C.ink3} style={{ marginLeft: 6 }}/>}
      {!noDivider && !last && <div style={{
        position: 'absolute', left: left ? S.gutter + 32 : S.gutter,
        right: 0, bottom: 0, height: 1, background: C.hairline,
      }}/>}
    </div>
  );
}

// ── Group: iOS Settings style, but flatter (no rounded card)
function Group({ t, header, children, footer, flush = false }) {
  const { C, S, T } = t;
  return (
    <div style={{ marginBottom: S.groupGap }}>
      {header && <div style={{
        fontFamily: T.family, fontSize: 11, fontWeight: 500,
        color: C.ink3, letterSpacing: 0.8, textTransform: 'uppercase',
        padding: `0 ${S.gutter}px 8px`,
      }}>{header}</div>}
      <div style={{
        background: C.bg,
        borderTop: `1px solid ${C.hairline}`,
        borderBottom: `1px solid ${C.hairline}`,
      }}>{children}</div>
      {footer && <div style={{
        fontFamily: T.family, fontSize: 12,
        color: C.ink3, padding: `8px ${S.gutter}px 0`,
      }}>{footer}</div>}
    </div>
  );
}

// ── StatCard: tight, single metric
function StatCard({ t, label, value, delta, accent, tone = 'default' }) {
  const { C, T } = t;
  const valueColor = tone === 'danger' ? C.danger : tone === 'success' ? C.success : accent ? C.accent : C.ink;
  return (
    <div style={{
      flex: 1, minWidth: 0,
      padding: '10px 12px',
      borderRight: `1px solid ${C.hairline}`,
    }}>
      <div style={{
        fontFamily: T.family, fontSize: 11, fontWeight: 500,
        color: C.ink3, letterSpacing: 0.6, textTransform: 'uppercase',
      }}>{label}</div>
      <div style={{
        fontFamily: T.num, fontSize: 20, fontWeight: 600,
        color: valueColor, marginTop: 4, ...T.tabular,
        letterSpacing: -0.4,
      }}>{value}</div>
      {delta && <div style={{
        fontFamily: T.family, fontSize: 11, color: C.ink2,
        marginTop: 2, ...T.tabular,
      }}>{delta}</div>}
    </div>
  );
}

// ── Chip / FilterChips
function Chip({ t, label, active, onClick, count }) {
  const { C, T } = t;
  return (
    <div onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      height: 28, padding: '0 12px',
      borderRadius: 4,
      border: `1px solid ${active ? C.accent : C.hairline}`,
      background: active ? C.accent : C.bg,
      color: active ? '#fff' : C.ink,
      fontFamily: T.family, fontSize: 13, fontWeight: 500,
      letterSpacing: -0.1, cursor: 'pointer', whiteSpace: 'nowrap',
      flexShrink: 0,
    }}>
      {label}
      {count !== undefined && <span style={{
        fontSize: 11, opacity: active ? 0.85 : 0.55,
        ...T.tabular,
      }}>{count}</span>}
    </div>
  );
}

function FilterChips({ t, items, value, onChange }) {
  const { S } = t;
  return (
    <div style={{
      display: 'flex', gap: 6, overflowX: 'auto',
      padding: `0 ${S.gutter}px`,
      scrollbarWidth: 'none', msOverflowStyle: 'none',
    }} className="no-scrollbar">
      {items.map(i => (
        <Chip key={i.key} t={t} label={i.label} count={i.count}
              active={value === i.key} onClick={() => onChange(i.key)} />
      ))}
    </div>
  );
}

// ── SegmentedControl
function Segmented({ t, items, value, onChange, small = false }) {
  const { C, T, S } = t;
  return (
    <div style={{
      display: 'flex',
      margin: `0 ${S.gutter}px`,
      borderTop: `1px solid ${C.hairline}`,
      borderBottom: `1px solid ${C.hairline}`,
      overflowX: 'auto', scrollbarWidth: 'none',
    }} className="no-scrollbar">
      {items.map(i => {
        const active = value === i.key;
        return (
          <div key={i.key} onClick={() => onChange(i.key)} style={{
            padding: small ? '8px 10px' : '10px 12px',
            fontFamily: T.family, fontSize: 13, fontWeight: active ? 600 : 500,
            color: active ? C.ink : C.ink2,
            cursor: 'pointer', whiteSpace: 'nowrap',
            borderBottom: `2px solid ${active ? C.accent : 'transparent'}`,
            marginBottom: -1,
          }}>{i.label}</div>
        );
      })}
    </div>
  );
}

// ── Buttons
function PrimaryButton({ t, children, onClick, style = {}, disabled = false, icon }) {
  const { C, T } = t;
  return (
    <button onClick={!disabled ? onClick : undefined} style={{
      height: 48, padding: '0 18px',
      width: '100%',
      borderRadius: 8, border: 'none',
      background: disabled ? C.hairline : C.accent,
      color: '#fff',
      fontFamily: T.family, fontSize: 15, fontWeight: 600,
      letterSpacing: -0.1, cursor: disabled ? 'default' : 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      ...style,
    }}>
      {icon && <Icon name={icon} size={18} color="#fff"/>}
      {children}
    </button>
  );
}

function SecondaryButton({ t, children, onClick, style = {}, icon }) {
  const { C, T } = t;
  return (
    <button onClick={onClick} style={{
      height: 48, padding: '0 18px', width: '100%',
      borderRadius: 8,
      border: `1px solid ${C.hairline2}`,
      background: C.bg, color: C.ink,
      fontFamily: T.family, fontSize: 15, fontWeight: 500,
      cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      ...style,
    }}>
      {icon && <Icon name={icon} size={18} color={C.ink}/>}
      {children}
    </button>
  );
}

function GhostButton({ t, children, onClick, style = {} }) {
  const { C, T } = t;
  return (
    <button onClick={onClick} style={{
      height: 36, padding: '0 10px',
      borderRadius: 4, border: 'none',
      background: 'transparent', color: C.accent,
      fontFamily: T.family, fontSize: 15, fontWeight: 500,
      cursor: 'pointer', ...style,
    }}>{children}</button>
  );
}

// ── BottomSheet
function BottomSheet({ t, open, onClose, title, children, height = 'auto', full = false }) {
  const { C, T, S } = t;
  if (!open) return null;
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 100,
      display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
    }}>
      <div onClick={onClose} style={{
        position: 'absolute', inset: 0, background: C.overlay,
        animation: 'fadeIn 180ms ease-out',
      }}/>
      <div style={{
        position: 'relative', background: C.sheet,
        borderTopLeftRadius: 14, borderTopRightRadius: 14,
        maxHeight: full ? '92%' : '80%', height,
        display: 'flex', flexDirection: 'column',
        animation: 'sheetUp 260ms cubic-bezier(.2,.8,.2,1)',
        boxShadow: '0 -6px 24px rgba(0,0,0,0.12)',
      }}>
        <div style={{ padding: '10px 0 4px', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: C.hairline2 }}/>
        </div>
        {title && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: `6px ${S.gutter}px 10px`,
            borderBottom: `1px solid ${C.hairline}`,
          }}>
            <div style={{ fontFamily: T.family, fontSize: 15, fontWeight: 600, color: C.ink }}>{title}</div>
            <div onClick={onClose} style={{ cursor: 'pointer', color: C.ink2 }}>
              <Icon name="close" size={20} color={C.ink2}/>
            </div>
          </div>
        )}
        <div style={{ flex: 1, overflowY: 'auto' }}>{children}</div>
      </div>
    </div>
  );
}

// ── EmptyState
function EmptyState({ t, icon = 'inbox', title, sub, action }) {
  const { C, T } = t;
  return (
    <div style={{
      padding: '48px 32px', display: 'flex', flexDirection: 'column',
      alignItems: 'center', textAlign: 'center',
    }}>
      <Icon name={icon} size={28} color={C.ink3} strokeWidth={1}/>
      <div style={{
        fontFamily: T.family, fontSize: 15, fontWeight: 600,
        color: C.ink, marginTop: 12, letterSpacing: -0.1,
      }}>{title}</div>
      {sub && <div style={{
        fontFamily: T.family, fontSize: 13, color: C.ink2,
        marginTop: 4, lineHeight: '18px',
      }}>{sub}</div>}
      {action}
    </div>
  );
}

// ── SkeletonRow
function SkeletonRow({ t }) {
  const { C, S } = t;
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      height: S.rowH, padding: `0 ${S.gutter}px`,
      borderBottom: `1px solid ${C.hairline}`,
    }}>
      <div style={{ width: 24, height: 24, background: C.surface, borderRadius: 4, marginRight: 12 }}/>
      <div style={{ flex: 1 }}>
        <div style={{ width: '40%', height: 10, background: C.surface, borderRadius: 2 }}/>
        <div style={{ width: '25%', height: 8, background: C.surface, borderRadius: 2, marginTop: 6 }}/>
      </div>
      <div style={{ width: 60, height: 10, background: C.surface, borderRadius: 2 }}/>
    </div>
  );
}

// ── ProgressBar 2px
function ProgressBar({ t, value, max = 100, color, height = 2 }) {
  const { C } = t;
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div style={{ height, background: C.hairline, borderRadius: height / 2, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color || C.accent }}/>
    </div>
  );
}

// ── InputRow (grouped form)
function InputRow({ t, label, value, onChange, placeholder, dense = false, mono = false, last = false, right }) {
  const { C, T, S } = t;
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      minHeight: dense ? 40 : S.rowH,
      padding: `0 ${S.gutter}px`, position: 'relative',
    }}>
      {label && <div style={{
        fontFamily: T.family, fontSize: 15, color: C.ink, fontWeight: 500,
        width: 100, flexShrink: 0,
      }}>{label}</div>}
      <input value={value} onChange={e => onChange && onChange(e.target.value)}
             placeholder={placeholder}
             style={{
               flex: 1, border: 'none', outline: 'none', background: 'transparent',
               fontFamily: mono ? T.mono : T.family, fontSize: 15, color: C.ink,
               padding: '8px 0',
               ...(mono ? T.tabular : {}),
             }}/>
      {right}
      {!last && <div style={{
        position: 'absolute', left: S.gutter, right: 0, bottom: 0,
        height: 1, background: C.hairline,
      }}/>}
    </div>
  );
}

// ── PickerRow (grouped form; shows value + chevron)
function PickerRow({ t, label, value, placeholder, onClick, last = false, icon }) {
  const { C, T, S } = t;
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center',
      minHeight: S.rowH,
      padding: `0 ${S.gutter}px`, position: 'relative',
      cursor: 'pointer',
    }}>
      {icon && <div style={{ marginRight: 10, color: C.ink2 }}>{icon}</div>}
      <div style={{
        fontFamily: T.family, fontSize: 15, color: C.ink, fontWeight: 500,
      }}>{label}</div>
      <div style={{ flex: 1 }}/>
      <div style={{
        fontFamily: T.family, fontSize: 15,
        color: value ? C.ink : C.ink3, marginRight: 6,
        maxWidth: 160, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
      }}>{value || placeholder}</div>
      <Icon name="chev_r" size={14} color={C.ink3}/>
      {!last && <div style={{
        position: 'absolute', left: S.gutter, right: 0, bottom: 0,
        height: 1, background: C.hairline,
      }}/>}
    </div>
  );
}

// ── ToggleRow
function ToggleRow({ t, label, value, onChange, last = false, sub }) {
  const { C, T, S } = t;
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      minHeight: S.rowH,
      padding: `0 ${S.gutter}px`, position: 'relative',
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: T.family, fontSize: 15, color: C.ink, fontWeight: 500 }}>{label}</div>
        {sub && <div style={{ fontFamily: T.family, fontSize: 12, color: C.ink2, marginTop: 2 }}>{sub}</div>}
      </div>
      <div onClick={() => onChange(!value)} style={{
        width: 44, height: 26, borderRadius: 13,
        background: value ? C.accent : C.hairline2,
        position: 'relative', cursor: 'pointer',
        transition: 'background 200ms',
      }}>
        <div style={{
          position: 'absolute', top: 2, left: value ? 20 : 2,
          width: 22, height: 22, borderRadius: 11, background: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
          transition: 'left 180ms cubic-bezier(.2,.8,.2,1)',
        }}/>
      </div>
      {!last && <div style={{
        position: 'absolute', left: S.gutter, right: 0, bottom: 0,
        height: 1, background: C.hairline,
      }}/>}
    </div>
  );
}

// ── Thumbnail (placeholder with hatching)
function Thumb({ t, size = 48, radius = 4, label, color, style = {} }) {
  const { C, T } = t;
  const bg = color || C.surface;
  const id = `hatch-${(label||'x').charCodeAt(0) % 40}-${size}`;
  return (
    <div style={{
      width: size, height: size, borderRadius: radius, flexShrink: 0,
      background: bg, border: `1px solid ${C.hairline}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: C.ink2, fontFamily: T.mono, fontSize: 11, fontWeight: 500,
      letterSpacing: 0.5, overflow: 'hidden', position: 'relative',
      ...style,
    }}>
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.6 }}>
        <defs>
          <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke={C.hairline2} strokeWidth="1"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${id})`}/>
      </svg>
      <span style={{ position: 'relative', zIndex: 1 }}>{label}</span>
    </div>
  );
}

// ── Avatar (initials circle)
function Avatar({ t, name, size = 28, bg }) {
  const { C, T } = t;
  const initials = (name || '?').split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase();
  const palette = ['#2563EB', '#0D9488', '#9333EA', '#DB2777', '#EA580C', '#0891B2', '#65A30D'];
  const color = bg || palette[(name || '').charCodeAt(0) % palette.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: size / 2,
      background: color, color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: T.family, fontSize: size * 0.38, fontWeight: 600,
      flexShrink: 0, letterSpacing: -0.2,
    }}>{initials}</div>
  );
}

// ── Tag / Pill
function Pill({ t, children, tone = 'default', size = 'sm', dot = false }) {
  const { C, T } = t;
  const tones = {
    default: { bg: C.surface,    fg: C.ink2,    bd: C.hairline2 },
    accent:  { bg: C.accentSoft, fg: C.accentInk, bd: 'transparent' },
    success: { bg: C.successSoft || 'rgba(15,157,88,0.10)', fg: C.success, bd: 'transparent' },
    warning: { bg: C.warningSoft || 'rgba(217,119,6,0.10)',  fg: C.warning, bd: 'transparent' },
    danger:  { bg: C.dangerSoft  || 'rgba(220,38,38,0.10)',  fg: C.danger,  bd: 'transparent' },
  }[tone];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: size === 'sm' ? '2px 8px' : '3px 11px',
      borderRadius: 999, background: tones.bg, color: tones.fg,
      border: `1px solid ${tones.bd}`,
      fontFamily: T.family, fontSize: 11, fontWeight: 600,
      letterSpacing: 0.1,
    }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: 3, background: tones.fg }}/>}
      {children}
    </span>
  );
}

// ── StatusCard — modern white card with metric + delta + sparkline
function StatusCard({ t, label, value, sub, tone = 'default', icon, sparkline, onClick }) {
  const { C, T, S } = t;
  const accent = tone === 'success' ? C.success : tone === 'danger' ? C.danger : tone === 'warning' ? C.warning : C.accent;
  return (
    <div onClick={onClick} style={{
      flex: 1, minWidth: 0,
      padding: 14,
      borderRadius: S.radius,
      background: C.bg,
      border: `1px solid ${C.hairline2}`,
      cursor: onClick ? 'pointer' : 'default',
      boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontFamily: T.family, fontSize: 11, fontWeight: 600,
          color: C.ink3, letterSpacing: 0.4, textTransform: 'uppercase',
        }}>{label}</span>
        {icon && (
          <div style={{
            width: 24, height: 24, borderRadius: 6,
            background: tone === 'default' ? C.accentSoft : (tone === 'success' ? C.successSoft : tone === 'warning' ? C.warningSoft : C.dangerSoft),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name={icon} size={13} color={accent} strokeWidth={2}/>
          </div>
        )}
      </div>
      <div style={{
        fontFamily: T.num, fontSize: 22, fontWeight: 700,
        color: C.ink, ...T.tabular, letterSpacing: -0.6,
      }}>{value}</div>
      {sub && <div style={{
        fontFamily: T.family, fontSize: 12, color: C.ink2,
      }}>{sub}</div>}
      {sparkline && (
        <svg viewBox="0 0 100 24" style={{ width: '100%', height: 24, marginTop: 4 }}>
          <polyline fill="none" stroke={accent} strokeWidth="1.6" strokeLinejoin="round"
            points={sparkline.map((v, i) => `${(i/(sparkline.length-1))*100},${24 - (v/Math.max(...sparkline))*22}`).join(' ')}/>
        </svg>
      )}
    </div>
  );
}

// ── IconButton (square, modern)
function IconButton({ t, icon, onClick, tone = 'default', size = 36 }) {
  const { C } = t;
  const bg  = tone === 'primary' ? C.accent : C.bg;
  const fg  = tone === 'primary' ? '#fff' : C.ink;
  const bd  = tone === 'primary' ? 'transparent' : C.hairline2;
  return (
    <button onClick={onClick} style={{
      width: size, height: size, borderRadius: 8,
      background: bg, border: `1px solid ${bd}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer', boxShadow: tone === 'primary' ? '0 2px 6px rgba(37,99,235,0.25)' : 'none',
    }}>
      <Icon name={icon} size={size * 0.46} color={fg}/>
    </button>
  );
}

// ── Badge dot count
function BadgeDot({ t, count, color }) {
  const { C, T } = t;
  if (!count) return null;
  return (
    <span style={{
      minWidth: 18, height: 18, borderRadius: 9,
      padding: '0 5px',
      background: color || C.danger, color: '#fff',
      fontFamily: T.family, fontSize: 10, fontWeight: 700,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      ...T.tabular,
    }}>{count}</span>
  );
}

Object.assign(window, {
  Row, Group, StatCard, StatusCard, Chip, FilterChips, Segmented,
  PrimaryButton, SecondaryButton, GhostButton, IconButton, BadgeDot,
  BottomSheet, EmptyState, SkeletonRow, ProgressBar,
  InputRow, PickerRow, ToggleRow, Thumb, Avatar, Pill,
});
