// Design tokens for InteriorOS
// Architectural, muted, paper-like. Sharp corners. Hairline dividers.

const ACCENTS = {
  // Default: modern clean blue
  blue: {
    base: '#2563EB',
    soft: '#E8EFFE',
    ink:  '#1D4ED8',
  },
  indigo: {
    base: '#4F46E5',
    soft: '#EAE9FB',
    ink:  '#3730A3',
  },
  teal: {
    base: '#0D9488',
    soft: '#DEF1EF',
    ink:  '#0F766E',
  },
  slate: {
    base: '#334155',
    soft: '#E2E8F0',
    ink:  '#1E293B',
  },
  // Kept for back-compat — UI no longer surfaces these as defaults
  terracotta: { base: '#C8654A', soft: '#EFE1DC', ink: '#8A4030' },
  forest:     { base: '#2D5D4F', soft: '#DDE6E2', ink: '#1E3F36' },
};

function makeTokens({ dark = false, accent = 'blue', density = 'compact' } = {}) {
  const a = ACCENTS[accent] || ACCENTS.blue;
  const light = {
    bg:        '#FFFFFF',
    surface:   '#F8FAFC',
    surface2:  '#F1F5F9',
    ink:       '#0F172A',
    ink2:      '#475569',
    ink3:      '#94A3B8',
    hairline:  '#EEF2F7',
    hairline2: '#E2E8F0',
    accent:    a.base,
    accentSoft:a.soft,
    accentInk: a.ink,
    success:   '#0F9D58',
    successSoft: '#E3F5EB',
    warning:   '#D97706',
    warningSoft:'#FEF3C7',
    danger:    '#DC2626',
    dangerSoft:'#FEE2E2',
    overlay:   'rgba(15,23,42,0.45)',
    tab:       '#FFFFFF',
    statusInk: '#000',
    sheet:     '#FFFFFF',
    pressed:   '#F1F5F9',
  };
  const darkT = {
    bg:        '#0B0B0C',
    surface:   '#141416',
    surface2:  '#17171A',
    ink:       '#F1F1ED',
    ink2:      '#8E8E94',
    ink3:      '#5A5A60',
    hairline:  '#24242A',
    hairline2: '#2C2C33',
    accent:    a.base,
    accentSoft:'rgba(200,101,74,0.18)',
    accentInk: '#E9B9A9',
    success:   '#34D399',
    successSoft: 'rgba(52,211,153,0.15)',
    warning:   '#FBBF24',
    warningSoft:'rgba(251,191,36,0.15)',
    danger:    '#F87171',
    dangerSoft:'rgba(248,113,113,0.15)',
    overlay:   'rgba(0,0,0,0.6)',
    tab:       '#0F0F11',
    statusInk: '#fff',
    sheet:     '#141416',
    pressed:   '#1C1C20',
  };
  const C = dark ? darkT : light;

  // density scales row heights and paddings
  const d = density === 'comfortable' ? 1.1 : 1;
  const S = {
    rowH:        Math.round(52 * d),
    rowHtight:   Math.round(44 * d),
    rowHtall:    Math.round(60 * d),
    gutter:      16,
    groupGap:    Math.round(22 * d),
    radius:      10,
    radiusLg:    14,
    radiusCard:  12,
  };

  const T = {
    family: "-apple-system, 'SF Pro Text', 'Inter', 'Helvetica Neue', system-ui, sans-serif",
    mono:   "'JetBrains Mono', 'SF Mono', ui-monospace, Menlo, monospace",
    num:    "-apple-system, 'SF Pro Text', 'Inter', system-ui",
    tabular: { fontVariantNumeric: 'tabular-nums', fontFeatureSettings: "'tnum' 1, 'cv11' 1" },
  };

  return { C, S, T, accentName: accent, dark };
}

window.makeTokens = makeTokens;
window.ACCENTS = ACCENTS;
