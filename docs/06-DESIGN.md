# CareerOS — Design System (`DESIGN.md`)

Extracted from the two reference dashboards (dark energy monitor + light "Spark Pixel" analytics)
and the design brainstorm. This is the build contract for the UI — Lovable scaffolds against it,
Claude Code wires it to live data. Where the two references differ, the rule is stated.

> **Aesthetic in one line:** *Calm, data-first enterprise UI.* Typography and spacing do the work;
> color is minimal and used as signal, not decoration. Sits in the Linear / Vercel / Notion / Arc
> family. Every screen is built from cards. For CareerOS, an **AI command layer** sits on top of this
> calm foundation (see §11).

---

## 1. Foundations

### 1.1 Spacing — 8px scale
| Token | px | Use |
|---|---|---|
| `space-xs` | 4 | icon gaps, tight inline |
| `space-sm` | 8 | chip padding, small gaps |
| `space-md` | 16 | default element gap |
| `space-lg` | 24 | **default card padding** |
| `space-xl` | 32 | large panel padding |
| `space-2xl` | 48 | section separation |
| `space-3xl` | 64 | page-level rhythm |

### 1.2 Radius
| Token | px | Use |
|---|---|---|
| `radius-sm` | 12 | inputs, buttons |
| `radius-md` | 16 | **cards**, tooltips |
| `radius-lg` | 20 | large widgets / hero panels |
| `radius-pill` | 999 | tabs, toggles, status pills, segmented controls |

### 1.3 Elevation
- **Light:** very subtle. `shadow-sm: 0 1px 2px rgba(0,0,0,.05)`; `shadow-md: 0 4px 20px rgba(0,0,0,.04)`. Cards mostly use a 1px border, not shadow.
- **Dark:** **border-only**, no shadows. Separation comes from surface-step contrast (`bg` → `surface` → `surface-elevated`).

### 1.4 Motion
- Hover lift: `transform: translateY(-2px)`.
- Duration 150–200ms, easing `cubic-bezier(0.4, 0, 0.2, 1)`.
- Reserve motion for hover/state changes and agent-status transitions; the UI is otherwise still.

---

## 2. Color

Two full themes. Tokens are semantic — components reference the token, never a raw hex.

### 2.1 Light theme
| Token | Hex | Notes |
|---|---|---|
| `bg` | `#F7F7F6` | warm off-white page |
| `surface` | `#FFFFFF` | cards |
| `surface-sunken` | `#F2F2F1` | chart wells, inset rows |
| `border` | `#E8E8E8` | hairlines, card outlines |
| `text` | `#111111` | primary |
| `text-muted` | `#6B7280` | labels, captions |
| `text-faint` | `#9CA3AF` | axis ticks, disabled |
| `success` | `#10B981` | positive deltas (+0.94) |
| `chart-ink` | `#111111` | bars / data marks |
| `chart-grid` | `rgba(17,17,17,.10)` | gridlines at 10% |

### 2.2 Dark theme
| Token | Hex | Notes |
|---|---|---|
| `bg` | `#0A0A0A` | near-black page |
| `surface` | `#121212` | cards |
| `surface-elevated` | `#1B1B1B` | raised panels |
| `border` | `#252525` | hairlines (does the work of shadows) |
| `text` | `#F5F5F5` | primary |
| `text-muted` | `#9CA3AF` | secondary |
| `chart-ink` | `#F5F5F5` | bars / data marks (white hairline bars) |
| `chart-grid` | `rgba(245,245,245,.10)` | gridlines at 10% |
| **`accent-cream`** | `#E9EDE3` | **emphasis cards** — the warm cream "spotlight" cards in the dark ref (Tracking, Green energy usage). Use to elevate ONE card per view, not as a fill everywhere. Text on it flips to dark (`#111`). |

### 2.3 Color discipline (the most important rule)
- **One accent at a time.** Green = positive signal. Cream = a single spotlighted card. Everything else is grayscale.
- **No gradients on data.** Bars and marks are solid ink. (See §6.)
- Status colors (added for CareerOS, kept muted): `info #3B82F6`, `warn #F59E0B`, `danger #EF4444`. Use only for pipeline/agent states; never decoratively.

---

## 3. Typography

**Family:** `Inter` (fallback: SF Pro Display, Geist, system-ui). One family throughout.

| Role | Size | Weight | Notes |
|---|---|---|---|
| Display / metric | 48 | 700 | the big numbers ($20,320 · 52–71 · 47%) |
| H1 | 40 | 600 | page hero ("Welcome back") |
| H2 | 28 | 600 | section / panel value |
| H3 | 20 | 600 | card titles |
| Body | 14 | 400 | default |
| Label (caps) | 12 | 500 | KPI labels — **uppercase, letter-spaced** (`TOTAL REVENUE`) |
| Caption | 12 | 500 | captions, axis ticks |

Rules: metrics are the loudest thing on the page; labels are quiet uppercase. Tabular figures for all numbers (`font-variant-numeric: tabular-nums`).

---

## 4. Layout & grid

```
┌────────────┬──────────────────────────────────────┐
│ Sidebar    │ Header (breadcrumb · search · time)   │
│ 240–280px  ├──────────────────────────────────────┤
│            │ KPI metric cards  (row of 3–4)        │
│            ├──────────────────────────────────────┤
│            │ Analytics / intelligence widgets      │
│            ├──────────────────────────────────────┤
│            │ Reports / feeds                       │
└────────────┴──────────────────────────────────────┘
```
- 12-column fluid grid, max content width **1440–1600px**.
- Sidebar fixed 240–280px, grouped sections with small caps headers ("Main Menu", "Customers", "Management") — see light ref.
- Content gutters use `space-lg` (24).

---

## 5. Components

### Sidebar
- Logo/workspace switcher block at top (rounded `radius-sm`, `surface`, subtle border — see "Agency / Spark Pixel Team").
- Grouped nav with caps section labels in `text-muted`.
- **Active item:** `surface` fill + `1px border`, icon + label in `text`. Inactive: transparent, `text-muted`.

### Metric (KPI) card
- Layout: caps **label** → big **metric (48/700)** → **trend** (`success` + arrow) and/or **mini sparkline** (hairline bars, right-aligned).
- Padding `space-lg`, radius `radius-md`, `surface` on `border`.

### Analytics card
- Header row: title (H3) + controls. Controls = **pill segmented tabs** (`Weekly · Monthly · Yearly`) and a `…` menu.
- Body: one visualization. Optional hover **tooltip** (`surface`, `radius-md`, shadow-md, label + values).

### Pills, tabs, toggles
- Segmented control: pill container, active segment = `surface`/white with subtle elevation, inactive = transparent `text-muted`.
- Toggle switch as in the dark "Green connections" card.
- Status pill: `radius-pill`, muted tinted bg, caps 12/500.

### Inputs / search
- Height 48, radius `radius-sm` (12), leading icon, `text-muted` placeholder.

### Spotlight card (dark only)
- `accent-cream` bg, dark text — reserved for the single most important widget in a view.

---

## 6. Data visualization

The strongest part of the reference — keep it austere.
- **Bars:** solid `chart-ink` hairlines (white in dark, near-black in light). No gradients, no rounded-cap rainbow.
- **Gridlines:** 10% opacity only; drop axes where the data reads without them.
- **Tooltip:** `surface`, `radius-md`, shadow-md, a date header + label/value rows (see "Jun 2025 · New User 38k · Existing User 18k").
- **Sparklines** in KPI cards: tiny hairline bars, no axis.
- Library: **Recharts** (already in stack) themed to these tokens — override default palette to grayscale + the single accent.

---

## 7. Theming implementation
- Ship both themes as CSS variables under `:root` (light) and `[data-theme="dark"]`.
- Tailwind: map tokens to `theme.extend.colors` semantic names (`bg`, `surface`, `border`, `text`, `muted`, `success`, `accent`) so components are theme-agnostic.
- Default theme for CareerOS: **light** (the cleaner Spark Pixel ref) with dark as a toggle.

---

## 8. Iconography
- Lucide (already in stack), 1.5px stroke, sized to text. Muted by default, `text` when active.

---

## 9. Accessibility
- Body text ≥ 14px; never rely on color alone for state (pair with icon/label — e.g. arrow + green, not just green).
- Check contrast on `accent-cream` (dark text only) and on `text-muted` over `surface`.

---

## 10. CareerOS screen application (from the brainstorm)
- **Nav:** Dashboard · Jobs · Applications · Companies · Projects (VVP) · Messages · AI Agents · Settings.
- **KPI row:** Applications Sent · Interview Rate · Response Rate · Offers · Outreach Activity.
- **Intelligence panels:** Application Funnel · Resume Performance · Outreach Analytics · Company Research Feed · Job Market Trends.

## 11. The AI command layer (the differentiator)
The references are pure analytics; CareerOS adds an agentic layer **on top of** this calm system. Every primary screen carries:
- **Agent task feed** — live status of running agents (queued / running / done / needs-approval), styled as quiet rows with a status pill; uses the WebSocket feed from the API.
- **AI recommendations** — surfaced as `accent-cream`/spotlight cards ("match 82% · missing SQL, Tableau · 1 Tailor resume").
- **Approval affordances** — anything an agent drafted that would send externally shows an explicit Approve/Edit control (ties to the approval-gate guardrail in `CLAUDE.md`).

Design principle for this layer: AI presence is **calm and legible**, never a chatbot bubble bolted on. Agent state reads like another well-designed data panel — status pills, hairline progress, tabular detail — consistent with everything else.

---

## 12. Design tokens (machine-readable)
```json
{
  "radius": { "sm": 12, "md": 16, "lg": 20, "pill": 999 },
  "space":  { "xs": 4, "sm": 8, "md": 16, "lg": 24, "xl": 32, "2xl": 48, "3xl": 64 },
  "font": {
    "family": "Inter",
    "size": { "caption": 12, "body": 14, "h3": 20, "h2": 28, "h1": 40, "metric": 48 },
    "weight": { "regular": 400, "medium": 500, "semibold": 600, "bold": 700 }
  },
  "motion": { "hoverLiftY": -2, "durationMs": [150, 200], "easing": "cubic-bezier(0.4,0,0.2,1)" },
  "color": {
    "light": {
      "bg": "#F7F7F6", "surface": "#FFFFFF", "surfaceSunken": "#F2F2F1",
      "border": "#E8E8E8", "text": "#111111", "muted": "#6B7280", "faint": "#9CA3AF",
      "success": "#10B981", "chartInk": "#111111", "chartGrid": "rgba(17,17,17,0.10)"
    },
    "dark": {
      "bg": "#0A0A0A", "surface": "#121212", "surfaceElevated": "#1B1B1B",
      "border": "#252525", "text": "#F5F5F5", "muted": "#9CA3AF",
      "accentCream": "#E9EDE3", "chartInk": "#F5F5F5", "chartGrid": "rgba(245,245,245,0.10)"
    },
    "status": { "info": "#3B82F6", "warn": "#F59E0B", "danger": "#EF4444" }
  }
}
```
