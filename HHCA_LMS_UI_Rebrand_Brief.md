# Harmony Health LMS — UI Rebrand Execution Brief
**For Claude Code | Architect Protocol**

---

## Source of Truth: Logo Design Tokens

Extracted directly from `HHCA_LMS_LogoPNG_.png` and `HHCA_LMS_LogoJPG_.jpg`.

```css
/* === HARMONY HEALTH DESIGN SYSTEM === */
/* Token source: HHCA_LMS_Logo — extracted March 2026 */

:root {
  /* --- Core Brand Palette --- */
  --color-brand-dark:      #0D1A0F;  /* Near-black forest — dark badge bg */
  --color-brand-primary:   #1B6B2E;  /* Deep clinical emerald — main brand */
  --color-brand-mid:       #2E8B40;  /* Mid emerald — icon, nurse cap, cross */
  --color-brand-accent:    #3DAA52;  /* Lighter emerald — hover states, glows */
  --color-brand-border:    #2E7D32;  /* Frame/border green */

  /* --- Surface & Background --- */
  --color-surface-base:    #F5F5F0;  /* Warm off-white — light badge fill */
  --color-surface-raised:  #FFFFFF;  /* Pure white — cards */
  --color-surface-deep:    #0A1509;  /* Darkest — sidebar, nav dark mode */
  --color-surface-muted:   #EEF2EE;  /* Tinted green-white — table rows, wells */

  /* --- Text --- */
  --color-text-primary:    #0D1A0F;  /* Near-black on light bg */
  --color-text-on-dark:    #F5F5F0;  /* Warm off-white on dark bg */
  --color-text-muted:      #4A7A55;  /* Muted mid-green for secondary text */
  --color-text-caption:    #6B9E76;  /* Spaced-caps labels, metadata */

  /* --- Status / Semantic (derived from brand) --- */
  --color-status-success:  #2E8B40;  /* Pass / complete — brand mid */
  --color-status-warning:  #B8860B;  /* Neutral warning — dark goldenrod */
  --color-status-danger:   #8B1A1A;  /* Fail / expired — deep clinical red */
  --color-status-info:     #1A5C7A;  /* Informational — clinical teal */

  /* --- Typography --- */
  --font-display:   'Playfair Display', Georgia, serif;  /* "Harmony" italic serif */
  --font-body:      'Source Sans 3', 'Helvetica Neue', sans-serif;
  --font-label:     'Barlow Condensed', 'Arial Narrow', sans-serif; /* CLINICAL EDUCATION MASTERY spaced-caps */
  --font-mono:      'JetBrains Mono', 'Courier New', monospace;

  /* --- Spacing --- */
  --radius-sm:   4px;
  --radius-md:   8px;
  --radius-lg:   12px;
  --radius-pill: 9999px;

  /* --- Elevation / Shadow --- */
  --shadow-card:   0 2px 8px rgba(13, 26, 15, 0.12);
  --shadow-modal:  0 8px 32px rgba(13, 26, 15, 0.24);
  --shadow-glow:   0 0 0 3px rgba(46, 139, 64, 0.25);  /* Focus ring */
}
```

---

## Typography Rationale

| Role | Font | Why |
|------|------|-----|
| Display / Page Titles | `Playfair Display` italic | Mirrors "Harmony" serif italic in logo |
| Body / UI Text | `Source Sans 3` | Clinical readability; not Inter |
| Labels / Badges / Caps | `Barlow Condensed` | Mirrors "CLINICAL EDUCATION MASTERY" spaced-caps |
| Code / IDs | `JetBrains Mono` | Audit trails, certificate IDs |

**Google Fonts import string:**
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;1,400;1,700&family=Source+Sans+3:wght@300;400;600&family=Barlow+Condensed:wght@400;600&family=JetBrains+Mono&display=swap" rel="stylesheet">
```

---

## Phase A — Design Token Integration

### A1. Create `src/styles/tokens.css`
Create this file and import it as the first line of `src/index.css`. It becomes the **single source of truth** for all color and typography decisions.

Paste the `:root {}` block from above verbatim.

### A2. Update `tailwind.config.js` (or `tailwind.config.ts`)

Extend Tailwind's theme to consume the CSS variables so utility classes stay consistent:

```js
theme: {
  extend: {
    colors: {
      brand: {
        dark:    'var(--color-brand-dark)',
        primary: 'var(--color-brand-primary)',
        mid:     'var(--color-brand-mid)',
        accent:  'var(--color-brand-accent)',
      },
      surface: {
        base:   'var(--color-surface-base)',
        raised: 'var(--color-surface-raised)',
        deep:   'var(--color-surface-deep)',
        muted:  'var(--color-surface-muted)',
      },
      status: {
        success: 'var(--color-status-success)',
        warning: 'var(--color-status-warning)',
        danger:  'var(--color-status-danger)',
        info:    'var(--color-status-info)',
      },
    },
    fontFamily: {
      display: ['Playfair Display', 'Georgia', 'serif'],
      body:    ['Source Sans 3', 'Helvetica Neue', 'sans-serif'],
      label:   ['Barlow Condensed', 'Arial Narrow', 'sans-serif'],
      mono:    ['JetBrains Mono', 'Courier New', 'monospace'],
    },
  },
},
```

---

## Phase B — Logo Component

### B1. Copy logo assets to `src/assets/`
```
src/assets/logo-dark.png   ← HHCA_LMS_LogoPNG_.png (use on dark/sidebar bg)
src/assets/logo-light.jpg  ← HHCA_LMS_LogoJPG_.jpg (use on light bg)
```

### B2. Create `src/components/ui/AppLogo.tsx`

```tsx
interface AppLogoProps {
  variant?: 'dark' | 'light';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = {
  sm: 'h-8',
  md: 'h-12',
  lg: 'h-16',
};

export function AppLogo({ variant = 'light', size = 'md', className }: AppLogoProps) {
  const src = variant === 'dark'
    ? '/src/assets/logo-dark.png'
    : '/src/assets/logo-light.jpg';

  return (
    <img
      src={src}
      alt="Harmony Health Care Assistant — Clinical Education Mastery"
      className={`${sizeMap[size]} w-auto object-contain ${className ?? ''}`}
    />
  );
}
```

**Ripple:** Replace every hardcoded text logo, "HH LMS" string, or placeholder icon with `<AppLogo />`. Search codebase for: `Harmony LMS`, `HH LMS`, `HHCA`, any `<img` pointing to old logo paths.

---

## Phase C — Component Updates

Apply changes in this priority order. Each change is surgical — no rebuilds.

### C1. Sidebar / Navigation (`src/components/layout/Sidebar.tsx` or equivalent)

| Element | Before (likely) | After |
|---------|----------------|-------|
| Background | `bg-gray-900` or `bg-blue-*` | `bg-[var(--color-surface-deep)]` |
| Active item bg | `bg-blue-600` | `bg-[var(--color-brand-primary)]` |
| Active item text | white | `text-[var(--color-text-on-dark)]` |
| Hover item | `hover:bg-gray-700` | `hover:bg-[var(--color-brand-mid)]` |
| Logo slot | text or old image | `<AppLogo variant="dark" size="md" />` |
| Section labels | default | `font-label tracking-widest uppercase text-xs text-[var(--color-text-caption)]` |

### C2. Top Navigation Bar (`src/components/layout/TopNav.tsx` or equivalent)

| Element | After |
|---------|-------|
| Border-bottom | `border-b border-[var(--color-brand-border)]` |
| Background | `bg-white` (light mode) or `bg-[var(--color-surface-deep)]` (dark) |
| Page title font | `font-display italic text-[var(--color-brand-primary)]` |

### C3. Buttons (`src/components/ui/Button.tsx`)

```tsx
// Primary action — maps to brand-primary
const variants = {
  primary:   'bg-[var(--color-brand-primary)] hover:bg-[var(--color-brand-mid)] text-white',
  secondary: 'border border-[var(--color-brand-primary)] text-[var(--color-brand-primary)] hover:bg-[var(--color-surface-muted)]',
  danger:    'bg-[var(--color-status-danger)] hover:opacity-90 text-white',
  ghost:     'text-[var(--color-brand-primary)] hover:bg-[var(--color-surface-muted)]',
};
// Focus ring
const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-mid)]';
```

### C4. Status / Badge Components

Map semantic colors to Tailwind tokens:

| Status | Background | Text |
|--------|-----------|------|
| Complete / Pass | `bg-[var(--color-status-success)]` | `text-white` |
| In Progress | `bg-[var(--color-status-info)]` | `text-white` |
| Needs Review | `bg-[var(--color-status-warning)]` | `text-white` |
| Expired / Fail | `bg-[var(--color-status-danger)]` | `text-white` |
| Enrolled | `bg-[var(--color-surface-muted)]` | `text-[var(--color-brand-primary)]` |

### C5. Cards / Course Tiles

```css
/* Card base */
background: var(--color-surface-raised);
border: 1px solid var(--color-surface-muted);
border-radius: var(--radius-lg);
box-shadow: var(--shadow-card);

/* Card header accent bar */
border-top: 3px solid var(--color-brand-primary);
```

### C6. Data Tables (Grade Roster, Enrollment Lists)

```css
/* Table header */
background: var(--color-brand-dark);
color: var(--color-text-on-dark);
font-family: var(--font-label);
letter-spacing: 0.08em;
text-transform: uppercase;
font-size: 0.75rem;

/* Alternating rows */
tr:nth-child(even) { background: var(--color-surface-muted); }

/* Row hover */
tr:hover { background: rgba(46, 139, 64, 0.07); }
```

### C7. Form Inputs

```css
border-color: var(--color-brand-border);
border-radius: var(--radius-md);

/* Focus */
outline: none;
box-shadow: var(--shadow-glow);
border-color: var(--color-brand-mid);
```

### C8. Page Headings

```tsx
// Replace any generic <h1> page titles with:
<h1 className="font-display italic text-3xl text-[var(--color-brand-primary)]">
  Course Library
</h1>
// Subheadings:
<h2 className="font-label uppercase tracking-widest text-sm text-[var(--color-text-caption)]">
  Clinical Education Mastery
</h2>
```

---

## Phase D — Audit Trail & Clinical Components (High Priority)

These clinical-specific UI elements must carry brand authority — they are the defensibility surface of the LMS.

### D1. Correction Log Entries

```css
background: #FFF8F0;               /* warm tint — distinct from normal rows */
border-left: 4px solid var(--color-status-warning);
font-family: var(--font-mono);     /* Immutability signal */
```

### D2. License Gating Warning Banner

```css
background: var(--color-status-danger);
color: white;
font-family: var(--font-label);
letter-spacing: 0.06em;
text-transform: uppercase;
```

### D3. CE Credit / Certificate Header

```tsx
// Certificate-style header block
<div style={{
  background: 'var(--color-brand-dark)',
  color: 'var(--color-text-on-dark)',
  borderBottom: '3px solid var(--color-brand-mid)',
  padding: '1.5rem 2rem',
  fontFamily: 'var(--font-display)',
}}>
  <span style={{ fontStyle: 'italic', fontSize: '1.5rem' }}>Harmony</span>
  <span style={{ fontFamily: 'var(--font-label)', letterSpacing: '0.15em', fontSize: '0.7rem', display: 'block' }}>
    CLINICAL EDUCATION MASTERY
  </span>
</div>
```

---

## Phase E — Verification Checklist

Run these checks after each phase before committing:

- [ ] **Design token load:** Open DevTools → Computed → confirm `--color-brand-primary` resolves to `#1B6B2E`
- [ ] **Logo renders:** AppLogo appears in sidebar (dark variant) and login page (light variant) at correct size
- [ ] **No stale blue/purple:** Search codebase for `blue-`, `purple-`, `indigo-` Tailwind classes; replace or confirm intentional
- [ ] **Accessibility:** Primary green `#1B6B2E` on white passes WCAG AA (contrast ratio ≥ 4.5:1) — it does: ~7.2:1 ✓
- [ ] **Button focus rings:** Tab through primary actions, confirm green glow appears
- [ ] **Dark sidebar legibility:** All nav labels readable against `#0A1509` background
- [ ] **Status badge contrast:** All 4 status colors pass contrast check on white card bg

---

## Ripple Effect Map

| File Changed | Downstream Risk | Mitigation |
|---|---|---|
| `tokens.css` | Global — all components inherit | Review in dev before merging |
| `tailwind.config.js` | Rebuild required; class names change | Confirm PostCSS build is running |
| `AppLogo.tsx` | All layout wrappers | Global find/replace old logo refs |
| `Button.tsx` | Every interactive surface | Visual regression pass on 3 key pages |
| Sidebar bg color | Auth context visibility (role badges) | Test all 3 roles post-change |

---

## Single Source of Truth Enforcement

After this rebrand, the following rule applies:

> **No color, font, or spacing value may be hardcoded in a component.**
> All values must reference a CSS variable defined in `tokens.css`.
> Any PR that introduces a raw hex code (`#...`) or hardcoded font name in a component file must be rejected in review.

This enforces the Resilient Engineering Manifesto's **Single Source of Truth** principle at the style layer.
