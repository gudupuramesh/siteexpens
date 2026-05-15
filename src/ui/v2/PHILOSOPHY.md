# v2 Design Philosophy

> Captured from user feedback during the Projects List redesign.
> Apply to every screen we redesign going forward.

## Core principles

1. **Simple first.** Every element on the screen must justify its space. If a number doesn't change behavior, drop it.
2. **One row when possible.** Combine controls into a single header line — back · title · org switcher · bell. Don't waste vertical space on a second nav row.
3. **No subtitles under titles.** "12 active · ₹2.45 Cr in flight" is noise. The list shows what's active; the title says what page you're on.
4. **Small over big.** Replace large metric cards with small inline pills. The dashboard is the project list itself, not the strip above it.
5. **Plain language.** "Approvals" not "Material reqs · pending approval". "Open tasks" not "Open tasks · across studio". One word, one concept.
6. **Modern web/app feel.** Compact dashboards (Linear, Notion, Stripe) over native iOS chrome (Settings, Mail). Use space like a browser tab, not like a navigation controller.
7. **Don't add unnecessary things.** When in doubt, leave it out. The app should feel light.

## Component preferences (in v2)

| Don't use | Use instead |
|---|---|
| `MetricTile` (3-up large cards) | `MetricPill` (small inline indicators) |
| Filter chips inline above list | Single filter button → bottom sheet |
| Search puck in tab bar | Search bar at top of list (one search affordance) |
| Progress bar slivers | Progress as a number cell |
| Big title + subtitle stack | Single-line compact header |
| Long jargon labels | Short plain-English labels |

## Header pattern

Every list screen header = ONE row:

```
‹ {Title} {OrgSwitcher chip}              {Bell with badge}
```

- `‹` for back when pushed; omit on tab roots
- Title in `title3` weight (not `largeTitle`)
- OrgSwitcher chip immediately right of title
- Bell at the far right with a red dot badge when there are alerts
- No second row, no large title block, no subtitle below

## Metric strip pattern

Every list screen body starts with a row of `<MetricPill>`s — small, scrollable horizontally if needed:

```
[● 2 Approvals]   [● 5 Open tasks]
```

- 2-3 max per screen
- Tappable (jumps to filtered detail)
- Use status colors (purple, orange, blue) — never overload with 4+ hues

## Below the metric pills

Standard content order:

1. Search bar + Filter button (if applicable)
2. List or grouped sections
3. FAB (bottom-right) for primary creation
4. FloatingTabBar (no search puck)

## Colors (status semantic only)

Per `statusColors` in `src/theme/v2/colors.ts`:

- **blue** — active, primary CTA, links
- **green** — money in, completed, success
- **orange** — open tasks, warnings
- **yellow** — on hold
- **red** — overdue, money out, destructive
- **purple** — approvals, premium

A single screen uses **at most 3 status colors at once**. If you want a 4th, you're trying to communicate too much — split the screen.

## When in doubt

Open a similar screen in:
- Linear (mobile)
- Stripe Dashboard (web)
- Notion (mobile)
- Apple's Health app (compact summary cards)

Avoid copying:
- Loyalty / e-commerce apps (too busy)
- Banking apps (too dense, fearful UI)
- Old iOS settings screens (too much chrome)
