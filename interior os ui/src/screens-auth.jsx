// Splash, Onboarding, OTP
const { useState: useSt_auth, useEffect: useEf_auth } = React;

function SplashScreen({ t, onContinue }) {
  const { C, T } = t;
  useEf_auth(() => {
    const id = setTimeout(() => onContinue && onContinue(), 1400);
    return () => clearTimeout(id);
  }, []);
  return (
    <div style={{
      width: '100%', height: '100%', background: C.bg,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      position: 'relative', overflow: 'hidden',
      animation: 'fadeIn 220ms ease-out',
    }}>
      {/* soft radial backdrop tinted with the accent */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(110% 70% at 50% 30%, ${C.accentSoft} 0%, ${C.bg} 60%)`,
        opacity: 0.7,
      }}/>
      {/* faint architectural grid */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.18 }}>
        <defs>
          <pattern id="splashgrid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M 32 0 L 0 0 0 32" fill="none" stroke={C.hairline2} strokeWidth="1"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#splashgrid)"/>
      </svg>

      {/* Logo */}
      <div style={{
        position: 'relative',
        animation: 'splashLogoIn 520ms cubic-bezier(.2,.8,.2,1) both',
      }}>
        <svg width="92" height="92" viewBox="0 0 92 92" style={{ display: 'block' }}>
          {/* outer ring (drawn) */}
          <circle cx="46" cy="46" r="35"
            fill="none" stroke={C.accent} strokeWidth="2"
            strokeDasharray="220" strokeDashoffset="220"
            style={{ animation: 'splashRingDraw 800ms cubic-bezier(.2,.8,.2,1) 120ms forwards' }}
            strokeLinecap="round"
          />
          {/* inner solid disc with monogram */}
          <circle cx="46" cy="46" r="26" fill={C.accent}/>
          <text x="46" y="55" textAnchor="middle"
            fontFamily={T.family} fontSize="22" fontWeight="700" fill="#fff" letterSpacing="-0.5">
            iO
          </text>
        </svg>
      </div>

      {/* Wordmark */}
      <div style={{
        marginTop: 22,
        fontFamily: T.family, fontSize: 24, fontWeight: 700, color: C.ink, letterSpacing: -0.6,
        animation: 'splashWordIn 480ms cubic-bezier(.2,.8,.2,1) 360ms both',
      }}>InteriorOS</div>
      <div style={{
        marginTop: 6,
        fontFamily: T.family, fontSize: 12, color: C.ink2, letterSpacing: 0.2,
        animation: 'splashWordIn 480ms cubic-bezier(.2,.8,.2,1) 460ms both',
      }}>Studio · Projects · Ledger</div>

      {/* Progress bar */}
      <div style={{
        position: 'absolute', bottom: 76, left: '50%', transform: 'translateX(-50%)',
        width: 120, height: 3, background: C.hairline2, borderRadius: 2, overflow: 'hidden',
      }}>
        <div style={{
          width: '100%', height: '100%', background: C.accent,
          transformOrigin: 'left center',
          animation: 'splashBarGrow 1100ms cubic-bezier(.4,.0,.2,1) 200ms forwards',
        }}/>
      </div>

      <div style={{
        position: 'absolute', bottom: 44, left: 0, right: 0, textAlign: 'center',
        fontFamily: T.family, fontSize: 11, color: C.ink3, letterSpacing: 1.2, fontWeight: 600,
      }}>HYDERABAD &middot; 2026</div>
    </div>
  );
}

function OnboardingScreen({ t, onContinue }) {
  const { C, T, S } = t;
  const [page, setPage] = useSt_auth(0);
  const pages = [
    { k: 'L', title: 'A ledger for the practice.',   body: 'Log expenses, income, and labour against each project. Tabular, honest, fast.' },
    { k: 'P', title: 'Projects in plan.',             body: 'Every site in one place: budget vs spent, team, timeline, photos.' },
    { k: 'A', title: 'Approvals that move.',          body: 'Supervisors submit, you approve — in one tap. No more WhatsApp receipts.' },
  ];
  const p = pages[page];
  return (
    <div style={{ width: '100%', height: '100%', background: C.bg, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '80px 28px 20px' }}>
        {/* illustration region — architectural placeholder */}
        <div style={{
          aspectRatio: '4/3', background: C.surface, border: `1px solid ${C.hairline}`,
          position: 'relative', overflow: 'hidden',
        }}>
          <svg viewBox="0 0 400 300" style={{ width: '100%', height: '100%' }}>
            <defs>
              <pattern id={`hatch-${page}`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="8" stroke={C.hairline2} strokeWidth="1"/>
              </pattern>
            </defs>
            {/* draft lines representing a floor plan */}
            <rect x="40" y="40" width="320" height="220" fill="none" stroke={C.ink2} strokeWidth="1.2"/>
            <line x1="40" y1="140" x2="220" y2="140" stroke={C.ink2} strokeWidth="1"/>
            <line x1="220" y1="40" x2="220" y2="260" stroke={C.ink2} strokeWidth="1"/>
            <rect x="40" y="40" width="180" height="100" fill={`url(#hatch-${page})`} opacity="0.4"/>
            <rect x="220" y="140" width="140" height="120" fill={C.accentSoft} opacity="0.6"/>
            {/* mark */}
            <text x="360" y="280" fill={C.ink3} fontFamily={T.mono} fontSize="10" textAnchor="end" letterSpacing="1">PLATE · 0{page+1}</text>
            <text x="50" y="55" fill={C.ink2} fontFamily={T.mono} fontSize="10" letterSpacing="1">{p.k}</text>
            {/* dimension arrow */}
            <line x1="40" y1="280" x2="360" y2="280" stroke={C.accent} strokeWidth="1"/>
            <line x1="40" y1="276" x2="40" y2="284" stroke={C.accent} strokeWidth="1"/>
            <line x1="360" y1="276" x2="360" y2="284" stroke={C.accent} strokeWidth="1"/>
          </svg>
        </div>
        <div style={{ marginTop: 40 }}>
          <div style={{ fontFamily: T.mono, fontSize: 10, color: C.accent, letterSpacing: 2, textTransform: 'uppercase' }}>
            0{page+1} / 03
          </div>
          <div style={{
            fontFamily: T.family, fontSize: 26, fontWeight: 600, color: C.ink,
            marginTop: 10, letterSpacing: -0.6, lineHeight: '32px',
          }}>{p.title}</div>
          <div style={{
            fontFamily: T.family, fontSize: 15, color: C.ink2, marginTop: 8, lineHeight: '22px',
          }}>{p.body}</div>
        </div>
      </div>
      {/* dots + cta */}
      <div style={{ padding: `0 ${S.gutter}px ${20}px` }}>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 22 }}>
          {pages.map((_, i) => (
            <div key={i} style={{
              width: i === page ? 18 : 6, height: 3,
              background: i === page ? C.accent : C.hairline2,
              transition: 'width 160ms',
            }}/>
          ))}
        </div>
        <PrimaryButton t={t} onClick={() => page < 2 ? setPage(page + 1) : onContinue()}>
          {page < 2 ? 'Next' : 'Get started'}
        </PrimaryButton>
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <span onClick={onContinue} style={{
            fontFamily: T.family, fontSize: 14, color: C.ink2, cursor: 'pointer',
          }}>Skip</span>
        </div>
      </div>
    </div>
  );
}

function SignInScreen({ t, onContinue }) {
  const { C, T, S } = t;
  const [phone, setPhone] = useSt_auth('');
  return (
    <div style={{ width: '100%', height: '100%', background: C.bg, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: `72px ${S.gutter}px 20px` }}>
        <div style={{ fontFamily: T.mono, fontSize: 10, color: C.accent, letterSpacing: 2 }}>SIGN IN · STUDIO</div>
        <div style={{ fontFamily: T.family, fontSize: 28, fontWeight: 600, color: C.ink, marginTop: 8, letterSpacing: -0.6 }}>
          Open your studio.
        </div>
        <div style={{ fontFamily: T.family, fontSize: 14, color: C.ink2, marginTop: 6, lineHeight: '20px' }}>
          Enter your mobile number. We'll send a one-time code.
        </div>
      </div>
      <div style={{ padding: `20px ${S.gutter}px 0` }}>
        <div style={{
          display: 'flex', alignItems: 'center', border: `1px solid ${C.hairline2}`, height: 56,
        }}>
          <div style={{
            padding: '0 14px', fontFamily: T.mono, fontSize: 15, color: C.ink, borderRight: `1px solid ${C.hairline2}`,
            height: '100%', display: 'flex', alignItems: 'center',
          }}>+91</div>
          <input
            value={phone}
            onChange={e => setPhone(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))}
            placeholder="10-digit mobile"
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              fontFamily: T.num, fontSize: 17, letterSpacing: 1, padding: '0 14px',
              color: C.ink, height: '100%',
            }}
          />
        </div>
        <div style={{ marginTop: 24 }}>
          <PrimaryButton t={t} disabled={phone.length < 10} onClick={onContinue}>
            Send code
          </PrimaryButton>
        </div>
        <div style={{
          marginTop: 18, fontFamily: T.family, fontSize: 12, color: C.ink3, textAlign: 'center', lineHeight: '18px',
        }}>
          By continuing, you agree to the Terms & Privacy Policy.
        </div>
      </div>
      <div style={{ flex: 1 }}/>
      <div style={{
        padding: `0 ${S.gutter}px 40px`,
        fontFamily: T.mono, fontSize: 10, color: C.ink3, letterSpacing: 1.5, textAlign: 'center',
      }}>INTERIOROS · v1.0 · HYD</div>
    </div>
  );
}

function OTPScreen({ t, onContinue, onBack }) {
  const { C, T, S } = t;
  const [digits, setDigits] = useSt_auth(['', '', '', '', '', '']);
  const [resendIn, setResendIn] = useSt_auth(28);
  useEf_auth(() => {
    const id = setInterval(() => setResendIn(v => Math.max(0, v - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  const setDigit = (i, v) => {
    v = v.replace(/[^0-9]/g, '').slice(-1);
    const next = [...digits];
    next[i] = v;
    setDigits(next);
    if (v && i < 5) {
      const el = document.getElementById(`otp-${i+1}`);
      el && el.focus();
    }
  };

  const complete = digits.every(d => d !== '');

  return (
    <div style={{ width: '100%', height: '100%', background: C.bg, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: `60px ${S.gutter}px 20px` }}>
        <div onClick={onBack} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, color: C.ink2, marginBottom: 24 }}>
          <Icon name="chev_l" size={16} color={C.ink2}/>
          <span style={{ fontFamily: T.family, fontSize: 14 }}>Back</span>
        </div>
        <div style={{ fontFamily: T.mono, fontSize: 10, color: C.accent, letterSpacing: 2 }}>VERIFY</div>
        <div style={{ fontFamily: T.family, fontSize: 26, fontWeight: 600, color: C.ink, marginTop: 8, letterSpacing: -0.6 }}>
          Enter the 6-digit code
        </div>
        <div style={{ fontFamily: T.family, fontSize: 14, color: C.ink2, marginTop: 6 }}>
          Sent to +91 98480 12234
        </div>
      </div>
      <div style={{ padding: `20px ${S.gutter}px 0`, display: 'flex', gap: 8, justifyContent: 'space-between' }}>
        {digits.map((d, i) => (
          <input key={i} id={`otp-${i}`} value={d} onChange={e => setDigit(i, e.target.value)}
            inputMode="numeric"
            style={{
              flex: 1, height: 64, border: `1px solid ${d ? C.accent : C.hairline2}`,
              textAlign: 'center', fontFamily: T.mono, fontSize: 24, fontWeight: 600,
              color: C.ink, background: d ? C.accentSoft : C.bg,
              outline: 'none',
            }}
          />
        ))}
      </div>
      <div style={{
        padding: `18px ${S.gutter}px`, display: 'flex', justifyContent: 'space-between',
        fontFamily: T.family, fontSize: 13,
      }}>
        <span style={{ color: C.ink3 }}>
          {resendIn > 0 ? `Resend in 00:${resendIn.toString().padStart(2, '0')}` : 'Resend available'}
        </span>
        <span style={{ color: resendIn === 0 ? C.accent : C.ink3, cursor: resendIn === 0 ? 'pointer' : 'default' }}
              onClick={() => resendIn === 0 && setResendIn(28)}>
          Resend code
        </span>
      </div>
      <div style={{ padding: `20px ${S.gutter}px 0` }}>
        <PrimaryButton t={t} disabled={!complete} onClick={onContinue}>Verify & continue</PrimaryButton>
      </div>
      <div style={{ flex: 1 }}/>
    </div>
  );
}

Object.assign(window, { SplashScreen, OnboardingScreen, SignInScreen, OTPScreen });
