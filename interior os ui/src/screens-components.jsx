// Components showcase — central reference of every primitive in the system
const { useState: useSt_C } = React;

function ComponentsScreen({ t, onBack }) {
  const { C, T, S } = t;
  const [section, setSection] = useSt_C('all');

  const sections = [
    { key: 'all',     label: 'All' },
    { key: 'cards',   label: 'Cards' },
    { key: 'forms',   label: 'Forms' },
    { key: 'status',  label: 'Status' },
    { key: 'buttons', label: 'Buttons' },
    { key: 'list',    label: 'Lists' },
    { key: 'data',    label: 'Data' },
  ];
  const show = (k) => section === 'all' || section === k;

  return (
    <div style={{ background: C.surface, minHeight: '100%' }}>
      {/* Header */}
      <div style={{
        padding: `4px ${S.gutter}px 12px`,
        background: C.bg, borderBottom: `1px solid ${C.hairline2}`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div onClick={onBack} style={{ cursor: 'pointer', color: C.ink2 }}>
          <Icon name="chev_l" size={20} color={C.ink2}/>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: T.family, fontSize: 17, fontWeight: 700, color: C.ink, letterSpacing: -0.3 }}>
            Components
          </div>
          <div style={{ fontFamily: T.family, fontSize: 12, color: C.ink2, marginTop: 1 }}>
            The blocks that build every screen.
          </div>
        </div>
        <Pill t={t} tone="accent">v1.0</Pill>
      </div>

      <div style={{ padding: '10px 0', background: C.bg, borderBottom: `1px solid ${C.hairline2}` }}>
        <FilterChips t={t} value={section} onChange={setSection}
          items={sections.map(s => ({ key: s.key, label: s.label }))}/>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 18 }}>

        {show('status') && (
          <Block t={t} title="Status cards" sub="Top-level metrics with sparkline">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <StatusCard t={t} label="Revenue" value="₹19.0L" sub="+12% this month" tone="default" icon="upload" sparkline={[3,5,4,7,6,9,8,11]}/>
              <StatusCard t={t} label="Spent" value="₹5.6L" sub="−8% vs target" tone="success" icon="download" sparkline={[8,7,9,5,6,4,5,4]}/>
              <StatusCard t={t} label="Pending" value="4" sub="awaiting approval" tone="warning" icon="clock"/>
              <StatusCard t={t} label="Overdue" value="2" sub="across 2 projects" tone="danger" icon="alert"/>
            </div>
          </Block>
        )}

        {show('status') && (
          <Block t={t} title="Pills & badges">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <Pill t={t} tone="default" dot>Draft</Pill>
              <Pill t={t} tone="accent"  dot>In Progress</Pill>
              <Pill t={t} tone="success" dot>Confirmed</Pill>
              <Pill t={t} tone="warning" dot>Pending</Pill>
              <Pill t={t} tone="danger"  dot>Overdue</Pill>
              <Pill t={t} tone="success">Paid</Pill>
              <Pill t={t} tone="default">Site</Pill>
              <Pill t={t} tone="accent">Hot Lead</Pill>
            </div>
            <div style={{ display: 'flex', gap: 14, marginTop: 12, alignItems: 'center' }}>
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <IconButton t={t} icon="bell"/>
                <div style={{ position: 'absolute', top: -4, right: -4 }}><BadgeDot t={t} count={3}/></div>
              </div>
              <BadgeDot t={t} count={12}/>
              <BadgeDot t={t} count={99} color={C.success}/>
              <BadgeDot t={t} count={4}  color={C.warning}/>
            </div>
          </Block>
        )}

        {show('buttons') && (
          <Block t={t} title="Buttons">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <PrimaryButton t={t} icon="plus">Primary action</PrimaryButton>
              <SecondaryButton t={t} icon="download">Secondary</SecondaryButton>
              <div style={{ display: 'flex', gap: 8 }}>
                <PrimaryButton t={t} style={{ height: 40, fontSize: 14 }}>Save</PrimaryButton>
                <SecondaryButton t={t} style={{ height: 40, fontSize: 14 }}>Cancel</SecondaryButton>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <IconButton t={t} icon="edit"/>
                <IconButton t={t} icon="phone"/>
                <IconButton t={t} icon="whatsapp"/>
                <IconButton t={t} icon="more"/>
                <IconButton t={t} icon="plus" tone="primary"/>
              </div>
              <GhostButton t={t}>Ghost / link button →</GhostButton>
            </div>
          </Block>
        )}

        {show('cards') && (
          <Block t={t} title="Project card">
            <div style={{
              padding: 14, borderRadius: S.radius, background: C.bg,
              border: `1px solid ${C.hairline2}`, boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
            }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <Thumb t={t} size={48} radius={10} label="KR"/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <div style={{ fontFamily: T.family, fontSize: 15, fontWeight: 600, color: C.ink, letterSpacing: -0.2 }}>
                      Koramandal Residence
                    </div>
                    <Pill t={t} tone="success" dot>Active</Pill>
                  </div>
                  <div style={{ fontFamily: T.family, fontSize: 12, color: C.ink2, marginTop: 2 }}>
                    Vikram Reddy · Jubilee Hills
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1 }}><ProgressBar t={t} value={68} max={100} height={4}/></div>
                <div style={{ fontFamily: T.num, fontSize: 12, color: C.ink2, ...T.tabular, fontWeight: 600 }}>68%</div>
              </div>
              <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ fontFamily: T.num, fontSize: 12, color: C.ink, ...T.tabular }}>
                  <span style={{ fontWeight: 600 }}>₹28.7L</span> <span style={{ color: C.ink3 }}>/ ₹42L</span>
                </div>
                <div style={{ fontFamily: T.family, fontSize: 11, color: C.ink3 }}>30 Jul · 2026</div>
              </div>
            </div>
          </Block>
        )}

        {show('cards') && (
          <Block t={t} title="Lead card">
            <div style={{
              padding: 14, borderRadius: S.radius, background: C.bg,
              border: `1px solid ${C.hairline2}`, boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar t={t} name="Aisha Verma" size={36}/>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: T.family, fontSize: 15, fontWeight: 600, color: C.ink }}>Aisha Verma</div>
                  <div style={{ fontFamily: T.family, fontSize: 12, color: C.ink2 }}>3BHK · Madhapur</div>
                </div>
                <Pill t={t} tone="danger" dot>Hot</Pill>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${C.hairline}`, paddingTop: 10 }}>
                <div>
                  <div style={{ fontFamily: T.family, fontSize: 11, color: C.ink3, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>Budget</div>
                  <div style={{ fontFamily: T.num, fontSize: 14, color: C.ink, fontWeight: 700, ...T.tabular }}>₹9.0L</div>
                </div>
                <div>
                  <div style={{ fontFamily: T.family, fontSize: 11, color: C.ink3, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>Source</div>
                  <div style={{ fontFamily: T.family, fontSize: 13, color: C.ink, fontWeight: 500 }}>Instagram</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <IconButton t={t} icon="phone" size={32}/>
                  <IconButton t={t} icon="whatsapp" size={32}/>
                </div>
              </div>
            </div>
          </Block>
        )}

        {show('forms') && (
          <Block t={t} title="Form fields">
            <Group t={t}>
              <InputRow t={t} label="Name" value="Aisha Verma" onChange={() => {}}/>
              <InputRow t={t} label="Phone" value="+91 99201 55812" onChange={() => {}} mono/>
              <PickerRow t={t} label="Source" value="Instagram"/>
              <PickerRow t={t} label="Stage" value="New"/>
              <ToggleRow t={t} label="Notify on call" value={true} onChange={() => {}}/>
              <ToggleRow t={t} label="WhatsApp updates" value={false} onChange={() => {}} last/>
            </Group>
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <TextField t={t} label="Email" placeholder="aisha@studio.com"/>
              <TextField t={t} label="Note" placeholder="Referred by Sanjana Rao…" multiline/>
              <SearchField t={t} placeholder="Search by name, phone, city"/>
            </div>
          </Block>
        )}

        {show('forms') && (
          <Block t={t} title="Chips & filters">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              <Chip t={t} label="All" active count={28}/>
              <Chip t={t} label="New" count={5}/>
              <Chip t={t} label="Qualified" count={8}/>
              <Chip t={t} label="Proposal" count={4}/>
              <Chip t={t} label="Won" count={3}/>
            </div>
            <Segmented t={t} value="day" onChange={() => {}} items={[
              { key: 'day', label: 'Day' }, { key: 'week', label: 'Week' },
              { key: 'month', label: 'Month' }, { key: 'year', label: 'Year' },
            ]}/>
          </Block>
        )}

        {show('list') && (
          <Block t={t} title="List rows">
            <Group t={t} header="Settings">
              <Row t={t} title="Profile" subtitle="Aarav Kapoor · Owner"
                left={<Avatar t={t} name="Aarav Kapoor" size={32}/>} chevron/>
              <Row t={t} title="Notifications" right={<Pill t={t} tone="accent">3 new</Pill>} chevron/>
              <Row t={t} title="Billing & invoices" chevron/>
              <Row t={t} title="Sign out" destructive last/>
            </Group>
          </Block>
        )}

        {show('list') && (
          <Block t={t} title="Avatars">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar t={t} name="Aarav Kapoor" size={48}/>
              <Avatar t={t} name="Sanjana Rao" size={40}/>
              <Avatar t={t} name="Vikram Reddy" size={32}/>
              <Avatar t={t} name="Meher Nair" size={26}/>
              {/* stack */}
              <div style={{ display: 'flex', marginLeft: 12 }}>
                {['Aarav', 'Sanjana', 'Vikram', 'Meher'].map((n, i) => (
                  <div key={n} style={{ marginLeft: i ? -8 : 0, border: `2px solid ${C.bg}`, borderRadius: 999 }}>
                    <Avatar t={t} name={n} size={28}/>
                  </div>
                ))}
                <div style={{
                  marginLeft: -8, width: 28, height: 28, borderRadius: 14,
                  background: C.surface, border: `2px solid ${C.bg}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: T.family, fontSize: 11, fontWeight: 600, color: C.ink2,
                }}>+4</div>
              </div>
            </div>
          </Block>
        )}

        {show('data') && (
          <Block t={t} title="Progress">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Labelled t={t} title="Civil work" sub="68% · 21d left">
                <ProgressBar t={t} value={68} max={100} height={6}/>
              </Labelled>
              <Labelled t={t} title="Carpentry" sub="40% · in progress">
                <ProgressBar t={t} value={40} max={100} height={6} color={C.warning}/>
              </Labelled>
              <Labelled t={t} title="Finishing" sub="not started">
                <ProgressBar t={t} value={4} max={100} height={6} color={C.ink3}/>
              </Labelled>
            </div>
          </Block>
        )}

        {show('data') && (
          <Block t={t} title="Sparkline & bars">
            <div style={{ padding: 14, borderRadius: S.radius, background: C.bg, border: `1px solid ${C.hairline2}` }}>
              <div style={{ fontFamily: T.family, fontSize: 11, fontWeight: 600, color: C.ink3, letterSpacing: 0.4, textTransform: 'uppercase' }}>Cash flow · 14d</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 56, marginTop: 8 }}>
                {[3,5,4,7,5,6,9,8,4,6,7,9,11,10].map((v, i) => (
                  <div key={i} style={{
                    flex: 1, height: `${v * 5}px`, background: i === 13 ? C.accent : C.accentSoft, borderRadius: 2,
                  }}/>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontFamily: T.family, fontSize: 10, color: C.ink3 }}>
                <span>12 Apr</span><span>25 Apr</span>
              </div>
            </div>
          </Block>
        )}

        {show('data') && (
          <Block t={t} title="Empty state">
            <div style={{ background: C.bg, border: `1px solid ${C.hairline2}`, borderRadius: S.radius }}>
              <EmptyState t={t} icon="inbox" title="No leads yet."
                sub="New enquiries will land here. Connect Instagram or WhatsApp to import."/>
            </div>
          </Block>
        )}

        {show('data') && (
          <Block t={t} title="Skeleton loader">
            <div style={{ background: C.bg, border: `1px solid ${C.hairline2}`, borderRadius: S.radius, overflow: 'hidden' }}>
              <SkeletonRow t={t}/>
              <SkeletonRow t={t}/>
              <SkeletonRow t={t}/>
            </div>
          </Block>
        )}

        <div style={{ height: 30 }}/>
      </div>
    </div>
  );
}

function Block({ t, title, sub, children }) {
  const { C, T } = t;
  return (
    <div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontFamily: T.family, fontSize: 13, fontWeight: 700, color: C.ink, letterSpacing: -0.1 }}>{title}</div>
        {sub && <div style={{ fontFamily: T.family, fontSize: 11, color: C.ink3, marginTop: 1 }}>{sub}</div>}
      </div>
      {children}
    </div>
  );
}

function TextField({ t, label, value, onChange, placeholder, multiline = false }) {
  const { C, T } = t;
  return (
    <div>
      {label && <div style={{
        fontFamily: T.family, fontSize: 11, fontWeight: 600, color: C.ink2,
        letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6,
      }}>{label}</div>}
      {multiline ? (
        <textarea value={value || ''} onChange={e => onChange && onChange(e.target.value)} placeholder={placeholder}
          style={{
            width: '100%', minHeight: 80, padding: 12, borderRadius: 8,
            border: `1px solid ${C.hairline2}`, background: C.bg, color: C.ink,
            fontFamily: T.family, fontSize: 14, outline: 'none', resize: 'vertical',
          }}/>
      ) : (
        <input value={value || ''} onChange={e => onChange && onChange(e.target.value)} placeholder={placeholder}
          style={{
            width: '100%', height: 42, padding: '0 12px', borderRadius: 8,
            border: `1px solid ${C.hairline2}`, background: C.bg, color: C.ink,
            fontFamily: T.family, fontSize: 14, outline: 'none',
          }}/>
      )}
    </div>
  );
}

function SearchField({ t, placeholder, value, onChange }) {
  const { C, T } = t;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', height: 42,
      padding: '0 12px', borderRadius: 8, background: C.surface2,
      border: `1px solid ${C.hairline}`, gap: 8,
    }}>
      <Icon name="search" size={16} color={C.ink3}/>
      <input value={value || ''} onChange={e => onChange && onChange(e.target.value)} placeholder={placeholder}
        style={{
          flex: 1, border: 'none', outline: 'none', background: 'transparent',
          fontFamily: T.family, fontSize: 14, color: C.ink,
        }}/>
    </div>
  );
}

function Labelled({ t, title, sub, children }) {
  const { C, T } = t;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontFamily: T.family, fontSize: 13, fontWeight: 500, color: C.ink }}>{title}</span>
        <span style={{ fontFamily: T.family, fontSize: 11, color: C.ink2 }}>{sub}</span>
      </div>
      {children}
    </div>
  );
}

Object.assign(window, { ComponentsScreen, Block, TextField, SearchField, Labelled });
