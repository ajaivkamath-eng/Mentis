# Mentis Design System Blueprint

This document is a visual reconstruction blueprint for the current Mentis product design system. It is based on the live web implementation and component language used in the app, with emphasis on preserving zero-visual-regression behavior if the project is rebuilt from a clean repository.

The system is organized around a single semantic design contract:

- Deep Court visual language
- Dark-mode default with light-mode override
- Teal/iris brand accents plus muted navy surfaces
- Large geometric display typography paired with neutral interface sans-serif
- Dense, card-based data management UI with glass-like chrome and elevated panels
- Responsive app shell with a left rail, top header, and content cards

---

## 1. Global Styles & Theme Configuration

### 1.1 Source of Truth

The live design system is defined by:

- `packages/core/src/tokens.ts` — semantic token source of truth
- `apps/web/src/app.css` — CSS variables + Tailwind v4 theme map
- `apps/mobile/tailwind.config.js` + `apps/mobile/tailwind.tokens.js` — native parity export
- `apps/web/src/lib/theme.tsx` — class-based light/dark mode provider

The web implementation primarily uses Tailwind v4 with `@theme inline` and CSS custom properties rather than a classic `tailwind.config.js`. The app toggles the `.dark` class on the `html` element and sets `color-scheme` accordingly.

### 1.2 Core CSS Theme Contract

The applied root theme is:

```css
:root {
  --bg: #f4f7fc;
  --bg-subtle: #e9eef7;
  --surface: #ffffff;
  --surface-hover: #f7f9fc;
  --surface-raised: #ffffff;
  --surface-inset: #f1f5fa;
  --glass: rgba(255, 255, 255, 0.72);
  --border: rgba(15, 23, 42, 0.09);
  --border-strong: rgba(15, 23, 42, 0.18);

  --ink: #0b1220;
  --ink-muted: #54607a;
  --ink-faint: #7b869c;

  --brand: #0d9488;
  --brand-hover: #0f766e;
  --brand-press: #115e59;
  --brand-ink: #f0fdfa;
  --brand-soft: rgba(13, 148, 136, 0.1);
  --brand-text: #0f766e;
  --accent: #d97706;
  --accent-soft: rgba(217, 119, 6, 0.1);

  --success: #059669;
  --success-soft: rgba(5, 150, 105, 0.1);
  --warning: #b45309;
  --warning-soft: rgba(180, 83, 9, 0.1);
  --danger: #dc2626;
  --danger-soft: rgba(220, 38, 38, 0.09);
  --info: #2563eb;
  --info-soft: rgba(37, 99, 235, 0.09);

  --ring: rgba(13, 148, 136, 0.55);
  --scrim: rgba(11, 18, 32, 0.42);
  --sheen: rgba(255, 255, 255, 0.9);
  --shadow: 0 4px 10px -2px rgba(2, 6, 23, 0.1), 0 2px 6px -2px rgba(2, 6, 23, 0.08);
  --shadow-sm: 0 1px 2px rgba(2, 6, 23, 0.06), 0 1px 3px rgba(2, 6, 23, 0.08);
  --shadow-lg: 0 32px 64px -18px rgba(2, 6, 23, 0.45), 0 12px 28px -12px rgba(2, 6, 23, 0.28);
  --shadow-glow: 0 10px 30px -10px rgba(13, 148, 136, 0.45);
  --grad-brand: linear-gradient(135deg, var(--brand) 0%, #0ea5a4 45%, #6366f1 140%);
  --grad-sheen: linear-gradient(180deg, var(--sheen) 0%, transparent 100%);

  --content-max: 1360px;
  --sidebar-w: 272px;
  --header-h: 60px;

  --chart-1: #0d9488;
  --chart-2: #4f46e5;
  --chart-3: #d97706;
  --chart-4: #dc2626;
  --chart-5: #2563eb;

  color-scheme: light;
}

.dark {
  --bg: #060b16;
  --bg-subtle: #04070f;
  --surface: #0c1628;
  --surface-hover: #122036;
  --surface-raised: #132039;
  --surface-inset: #080e1c;
  --glass: rgba(12, 22, 40, 0.62);
  --border: rgba(148, 163, 184, 0.14);
  --border-strong: rgba(148, 163, 184, 0.26);

  --ink: #eef2f9;
  --ink-muted: #9aa8bd;
  --ink-faint: #6c7b93;

  --brand: #14b8a6;
  --brand-hover: #2dd4bf;
  --brand-press: #0d9488;
  --brand-ink: #04211d;
  --brand-soft: rgba(20, 184, 166, 0.14);
  --brand-text: #5eead4;
  --accent: #fbbf24;
  --accent-soft: rgba(251, 191, 36, 0.14);

  --success: #34d399;
  --success-soft: rgba(52, 211, 153, 0.14);
  --warning: #fbbf24;
  --warning-soft: rgba(251, 191, 36, 0.14);
  --danger: #f87171;
  --danger-soft: rgba(248, 113, 113, 0.15);
  --info: #60a5fa;
  --info-soft: rgba(96, 165, 250, 0.14);

  --ring: rgba(45, 212, 191, 0.65);
  --scrim: rgba(3, 6, 14, 0.72);
  --sheen: rgba(255, 255, 255, 0.06);
  --shadow: 0 4px 10px -2px rgba(2, 6, 23, 0.1), 0 2px 6px -2px rgba(2, 6, 23, 0.08);
  --shadow-sm: 0 1px 2px rgba(2, 6, 23, 0.06), 0 1px 3px rgba(2, 6, 23, 0.08);
  --shadow-lg: 0 32px 64px -18px rgba(2, 6, 23, 0.45), 0 12px 28px -12px rgba(2, 6, 23, 0.28);
  --shadow-glow: 0 10px 30px -10px rgba(20, 184, 166, 0.55);
  --grad-brand: linear-gradient(135deg, #14b8a6 0%, #0d9488 45%, #6366f1 150%);
  --grad-sheen: linear-gradient(180deg, var(--sheen) 0%, transparent 100%);

  --chart-1: #2dd4bf;
  --chart-2: #818cf8;
  --chart-3: #fbbf24;
  --chart-4: #f87171;
  --chart-5: #60a5fa;

  color-scheme: dark;
}
```

### 1.3 Tailwind v4 Theme Map and Typography Tokens

The design system exposes these tokens to Tailwind utilities via `@theme inline`:

```css
@theme inline {
  --color-bg: var(--bg);
  --color-bg-subtle: var(--bg-subtle);
  --color-surface: var(--surface);
  --color-surface-hover: var(--surface-hover);
  --color-surface-raised: var(--surface-raised);
  --color-surface-inset: var(--surface-inset);
  --color-glass: var(--glass);
  --color-line: var(--border);
  --color-line-strong: var(--border-strong);

  --color-background: var(--bg);
  --color-foreground: var(--ink);
  --color-card: var(--surface);
  --color-card-foreground: var(--ink);
  --color-popover: var(--surface-raised);
  --color-popover-foreground: var(--ink);
  --color-primary: var(--brand);
  --color-primary-foreground: var(--brand-ink);
  --color-secondary: var(--surface-hover);
  --color-secondary-foreground: var(--ink);
  --color-muted: var(--surface-hover);
  --color-muted-foreground: var(--ink-muted);
  --color-destructive: var(--danger);
  --color-input: var(--border);
  --color-border: var(--border);
  --color-ring: var(--ring);

  --color-ink: var(--ink);
  --color-ink-muted: var(--ink-muted);
  --color-ink-faint: var(--ink-faint);

  --color-brand: var(--brand);
  --color-brand-hover: var(--brand-hover);
  --color-brand-press: var(--brand-press);
  --color-brand-ink: var(--brand-ink);
  --color-brand-soft: var(--brand-soft);
  --color-brand-text: var(--brand-text);
  --color-accent: var(--accent);
  --color-accent-soft: var(--accent-soft);

  --color-success: var(--success);
  --color-success-soft: var(--success-soft);
  --color-warning: var(--warning);
  --color-warning-soft: var(--warning-soft);
  --color-danger: var(--danger);
  --color-danger-soft: var(--danger-soft);
  --color-info: var(--info);
  --color-info-soft: var(--info-soft);
  --color-scrim: var(--scrim);

  --font-sans: 'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif;
  --font-display: 'Plus Jakarta Sans Variable', 'Plus Jakarta Sans', 'Inter Variable', ui-sans-serif, system-ui, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, monospace;

  --text-2xs: 0.6875rem;
  --text-xs: 0.75rem;
  --text-sm: 0.8125rem;
  --text-base: 0.9375rem;
  --text-lg: 1.0625rem;
  --text-xl: 1.25rem;
  --text-2xl: 1.5rem;
  --text-3xl: 1.875rem;
  --text-4xl: clamp(2rem, 1.6rem + 1.6vw, 2.5rem);
  --text-display: clamp(2.25rem, 1.5rem + 2.6vw, 3.25rem);
}
```

### 1.4 Radius, Shadow, and Motion Tokens

Radii:

- `xs`: 6px
- `sm`: 9px
- `md`: 12px
- `lg`: 16px
- `xl`: 20px
- `2xl`: 26px
- `3xl`: 32px

Elevation:

- `--shadow-sm`: subtle card highlight
- `--shadow`: standard card drop shadow
- `--shadow-e3`: stronger panel shadow
- `--shadow-lg`: large modal/popover shadow
- `--shadow-glow`: brand glow

Motion:

- `ease-standard`: cubic-bezier(0.2, 0.8, 0.2, 1)
- `ease-decelerate`: cubic-bezier(0.16, 1, 0.3, 1)
- `ease-accelerate`: cubic-bezier(0.4, 0, 1, 1)
- `ease-emphasized`: cubic-bezier(0.22, 1, 0.36, 1)
- `ease-in-out-soft`: cubic-bezier(0.65, 0, 0.35, 1)

Animation patterns:

- `shimmer`: used for skeletal loaders
- `aurora-drift`: ambient background glow
- `pop`: inset reveal/appear
- `rise`: upward slide transition
- `sweep`: spinner ring motion

### 1.5 Global CSS and Base Layer Rules

The design system intentionally sets a highly constrained visual base:

```css
@import 'tailwindcss';
@import '@fontsource-variable/inter/index.css';
@import '@fontsource-variable/plus-jakarta-sans/index.css';
@custom-variant dark (&:where(.dark, .dark *));

html {
  -webkit-text-size-adjust: 100%;
  scroll-behavior: smooth;
  text-rendering: optimizeLegibility;
}

body {
  background-color: var(--bg);
  color: var(--ink);
  font-family: var(--font-sans);
  font-size: 0.9375rem;
  line-height: 1.5rem;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  transition: background-color 220ms var(--ease-standard), color 220ms var(--ease-standard);
}

h1, h2, h3, h4, h5 {
  font-family: var(--font-display);
  letter-spacing: -0.02em;
  font-weight: 700;
  color: var(--ink);
}

::selection {
  background: var(--brand-soft);
  color: var(--brand-text);
}

:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
  border-radius: var(--radius-xs);
}
```

### 1.6 Dark/Light Mode System

The app uses class-based theming instead of `prefers-color-scheme` only. The implementation is in `apps/web/src/lib/theme.tsx` and sets `html.dark` plus `document.documentElement.style.colorScheme`.

Behavior:

- Theme modes: `light`, `dark`, `system`
- Default mode: `system`
- Persists to `localStorage` under `mentis.theme`
- Applies theme before paint via inline script or runtime theme effect

### 1.7 Mobile Tailwind Config (Native parity)

Native app parity is preserved using the mobile Tailwind config:

```js
const { colors, radii, fonts } = require('./tailwind.tokens');

module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors,
      borderRadius: {
        xs: `${radii.xs}px`,
        sm: `${radii.sm}px`,
        md: `${radii.md}px`,
        lg: `${radii.lg}px`,
        xl: `${radii.xl}px`,
        '2xl': `${radii['2xl']}px`,
        '3xl': `${radii['3xl']}px`,
      },
      fontFamily: {
        sans: [fonts.sans],
        display: [fonts.display],
        mono: [fonts.mono],
      },
      spacing: { 4.5: '18px', 5.5: '22px', 18: '72px' },
    },
  },
  plugins: [],
};
```

This mobile config mirrors the same visual language on React Native while using numeric radii, spacing, and semantic color variables.

---

## 2. Component Inventory & UI Specs

### 2.1 Component Inventory Summary

Core components used across the product:

- Buttons
- Badges / status badges
- Cards / feature cards
- Inputs / form fields
- Selects / segmented controls
- Tables / DataTable
- Dialogs / modals / sheets
- Menus / dropdowns / tooltips
- Empty / error / permission states
- Progress bars / rings / capacity meters
- Avatar
- Stat cards / KPI tiles
- Shell navigation / app rail / header / user menu
- Page header and section header

### 2.2 Button

Visual behavior:

- Renders as a `motion.button` with hover lift and press-scale animation
- `primary`, `secondary`, `soft`, `ghost`, `danger`, `link` intents
- Sizes: `sm`, `md`, `lg`, `icon`
- Disabled and loading states share a consistent opacity and spinner treatment

Class strings:

```tsx
const buttonVariants = cva(
  'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors ' +
    'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--brand-soft)] ' +
    'disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      intent: {
        primary: 'bg-brand text-brand-ink shadow-[var(--shadow-sm),inset_0_1px_0_rgba(255,255,255,0.22)] hover:shadow-[var(--shadow-glow)]',
        secondary: 'bg-surface-raised text-ink border border-line hover:border-[var(--border-strong)] hover:bg-surface-hover',
        soft: 'bg-brand-soft text-brand-text hover:bg-[color-mix(in_oklab,var(--brand)_22%,transparent)]',
        ghost: 'text-ink-muted hover:bg-surface-hover hover:text-ink',
        danger: 'bg-danger-soft text-danger hover:bg-[color-mix(in_oklab,var(--danger)_24%,transparent)]',
        link: 'text-brand-text underline-offset-4 hover:underline px-0',
      },
      size: {
        sm: 'h-8 rounded-sm px-3 text-xs',
        md: 'h-9 rounded-md px-3.5 text-sm',
        lg: 'h-11 rounded-lg px-5 text-base',
        icon: 'h-9 w-9 rounded-md p-0',
      },
      block: { true: 'w-full', false: '' },
    },
    defaultVariants: { intent: 'secondary', size: 'md', block: false },
  },
);
```

Props:

- `intent`: `primary | secondary | soft | ghost | danger | link`
- `size`: `sm | md | lg | icon`
- `block`
- `loading`
- `disabled`
- `destructive`
- `iconLeft`, `iconRight`
- `asChild`

Visual states:

- Default: neutral or brand surface, text contrast maintained
- Hover: `translateY(-1px)` and stronger shadow for primary/secondary
- Active: `scale(0.97)`
- Loading: spinner with `aria-busy`
- Disabled: reduced opacity and no interaction

Dummy JSX:

```tsx
<Button intent="primary" size="lg" iconLeft={<Plus />}>
  Create session
</Button>
```

### 2.3 Badge

Visual behavior:

- Circular or pill-style status markers
- Small rounded capsules with a subtle currentColor dot or icon
- Domain status mapping is centralized via `toneForStatus()`

Class strings:

```tsx
const badgeVariants = cva(
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-semibold leading-4 tracking-[0.02em] transition-colors',
  {
    variants: {
      tone: {
        neutral: 'border-transparent bg-surface-hover text-ink-muted',
        brand: 'border-transparent bg-brand-soft text-brand-text',
        success: 'border-transparent bg-success-soft text-success',
        warning: 'border-transparent bg-warning-soft text-warning',
        danger: 'border-transparent bg-danger-soft text-danger',
        info: 'border-transparent bg-info-soft text-info',
        accent: 'border-transparent bg-accent-soft text-accent',
        outline: 'border-line-strong bg-transparent text-ink-muted',
      },
      size: {
        sm: 'px-2 py-0.5 text-2xs',
        md: 'px-2.5 py-[3px] text-xs',
      },
    },
    defaultVariants: { tone: 'neutral', size: 'sm' },
  },
);
```

Props:

- `tone`: `neutral | brand | success | warning | danger | info | accent | outline`
- `size`: `sm | md`
- `dot?: boolean`
- `icon?: ReactNode`

Visual states:

- Static items always have consistent contrast
- Dot indicator uses currentColor and a soft ring around it

Dummy JSX:

```tsx
<Badge tone="brand" dot>
  Live
</Badge>
```

### 2.4 StatusBadge

The status badge maps domain names to one of the core badge tones. This is an important part of preserving visual consistency.

Status map examples:

- `scheduled`, `open`, `submitted`: `info`
- `approved`, `paid`, `completed`: `success`
- `pending`, `requested`: `warning`
- `breached`, `overdue`, `failed`: `danger`
- `draft`, `paused`: `neutral`

Dummy JSX:

```tsx
<StatusBadge status="breached" />
<StatusBadge status="scheduled" />
```

### 2.5 Card

The card is the base surface for almost all UI blocks.

Main classes:

```css
.card {
  position: relative;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  transition: border-color 200ms var(--ease-standard), box-shadow 240ms var(--ease-standard),
    transform 200ms var(--ease-standard), background-color 200ms var(--ease-standard);
}

.card::before {
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 1px;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  background: linear-gradient(90deg, transparent, var(--sheen), transparent);
  opacity: 0.7;
}
```

Variants:

- `default`: standard card
- `raised`: increased shadow
- `glass`: `backdrop-blur` and translucent fill
- `flat`: no shadow
- `brand`: tinted brand background

Padding presets:

- `sm`: `p-3.5`
- `md`: `p-[1.125rem]`
- `lg`: `p-6`

Props:

- `variant`: `default | raised | glass | flat | brand`
- `interactive`
- `pad`: `none | sm | md | lg`

Dummy JSX:

```tsx
<Card variant="default" pad="md">
  <CardHeader>
    <CardTitle>Session summary</CardTitle>
  </CardHeader>
  <CardContent>
    <p>Overview content</p>
  </CardContent>
</Card>
```

### 2.6 PageHeader / SectionHeader

Page header pattern:

```tsx
<PageHeader
  eyebrow="Today · Tue 16 Sep"
  title="Today"
  subtitle="Session register, tasks, and member action queue."
  breadcrumbs={[{ label: 'Today' }]}
  actions={<Button intent="primary">Add session</Button>}
  tabs={<nav className="flex gap-1 overflow-x-auto">...</nav>}
/>
```

Core visual rules:

- top eyebrow uses `overline` styling
- title uses `font-display` and bold tracking
- subtitle in small muted text
- actions align right on desktop
- tab strip sits underneath with pill-like navigation
- thin divider line across the width of the header

SectionHeader:

```tsx
<SectionHeader
  title="Foundations"
  description="Radii, elevation and density."
  action={<Button intent="soft" size="sm">View token map</Button>}
/>
```

### 2.7 Input, Field, Select, SegmentedControl

Input base class:

```css
.input {
  width: 100%;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--ink);
  min-height: 2.5rem;
  padding: 0.625rem 0.75rem;
  font-size: 0.875rem;
}
```

Form rules:

- Label text is 12px / semibold / muted
- Hint text is faint and smaller
- Error is red and marked with `role="alert"`
- Inputs align to a standard 40–44px touch height

Segmented control:

```tsx
<SegmentedControl
  ariaLabel="Preview theme"
  value={mode}
  onChange={setMode}
  options={[
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'system', label: 'Auto' },
  ]}
/>
```

### 2.8 DataTable

The table is one of the most important layout primitives. It supports:

- real table rendering at `md` and up
- stacked row cards below `md`
- sorting by column header
- empty states and skeleton loading
- optional fixed sticky header
- row click/keyboard interaction

Desktop class pattern:

```tsx
<div className="card overflow-hidden">
  <table className="grid">
    <thead>
      <tr>...</tr>
    </thead>
    <tbody>
      <tr>...</tr>
    </tbody>
  </table>
</div>
```

Cell rules:

- header text uses uppercase small-caps style or lighter weight
- numeric columns are tabular numerics
- row hover uses subtle surface tint
- no nested card wrappers for normal tables

### 2.9 Dialogs, Sheets, and Menus

Dialog / modal frame:

- scrim background: `bg-scrim`
- content panel: `rounded-2xl border border-line bg-surface shadow-[var(--shadow-e4)]`
- supported sizes: `sm`, `md`, `lg`, `xl`
- close button is top-right in a soft square button

Sheet:

- anchored to right, left, or bottom edge
- same motion behavior and glass scrim as dialogs
- used for side details or quick edit panels

Dropdown menu style:

```tsx
<motion.div
  className={cn(
    'z-[60] min-w-52 origin-(--radix-dropdown-menu-content-transform-origin) overflow-hidden',
    'rounded-xl border border-line bg-surface-raised p-1 shadow-[var(--shadow-e3)] backdrop-blur-xl',
    className,
  )}
/>
```

Menu item classes:

```tsx
const itemClasses =
  'relative flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-ink-muted outline-none transition-colors ' +
  'data-[highlighted]:bg-surface-hover data-[highlighted]:text-ink data-[disabled]:pointer-events-none data-[disabled]:opacity-50 ' +
  '[&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-ink-faint data-[highlighted]:[&>svg]:text-brand-text';
```

### 2.10 Empty, Error, Permission, No Results States

All emptiness is intentionally designed to feel like a purposeful empty state, not a missing UI bug.

Visual structure:

```tsx
<EmptyState
  icon={Inbox}
  title="No sessions yet"
  description="Add one to kick off a new training plan."
  action={<Button intent="primary">Create session</Button>}
  tone="brand"
  variant="page"
/>
```

Tone system:

- neutral
- brand
- success
- warning
- danger

### 2.11 StatCard and KPI Grid

KPI cards are a fixed reading order: label → value → delta → sparkline.

Card rules:

- card wrapper `group relative block p-[1.125rem] card`
- value is large `font-display`, heavy, tracking-tight
- icon sits in a soft rounded square to the right
- optional delta chip is small and colored by direction
- optional sparkline is displayed at the bottom

Responsive grid:

```tsx
<div className="grid auto-rows-fr gap-4 sm:grid-cols-2 xl:grid-cols-4">
  <StatCard ... />
</div>
```

### 2.12 Progress, ProgressRing, CapacityMeter

Progress bars:

```tsx
<div className={cn('w-full overflow-hidden rounded-full bg-surface-inset', size === 'sm' ? 'h-1.5' : 'h-2')}>
  <motion.div className={cn('h-full rounded-full', toneFills[tone])} />
</div>
```

Tones:

- `brand`
- `success`
- `warning`
- `danger`
- `info`
- `accent`

Capacity meter logic:

- `ratio >= 0.8`: warning
- `ratio >= 1`: danger
- `ratio >= 0.4`: brand
- otherwise: info

### 2.13 Avatar

Avatar visual style:

- full circle
- consistent gradient from a hash of the person's name
- initials when no image exists
- optional ring for currently signed-in user

Classes:

```tsx
<span className={cn(
  'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-display font-bold text-white/95',
  sizes[size],
  ring && 'ring-2 ring-[var(--surface)] outline outline-1 outline-[var(--border-strong)]',
  className,
)} style={{ background: bg }} />
```

### 2.14 Navigation and Shell Primitives

Key shell pieces from `app-shell.tsx` and `nav-list.tsx`:

- `AppShell`: the entire authenticated app frame
- `NavList`: grouped navigation with collapsible sections
- `BrandMark`: teal/iris gradient monogram and wordmark
- `UserMenu`: account chip with role switch and sign-out action
- `ThemeControl`: toggles light/dark/system via radiogroup

Visual identity:

- left rail width: 272px collapsed to 84px
- route groups with names like Overview, Coaching, People, Money, Competition, Club, Admin
- active nav item uses a soft brand background and inset ring
- desktop rail is glassy and elevated; mobile uses a bottom bar

Dummy JSX:

```tsx
<AppShell>
  <main className="space-y-6">...</main>
</AppShell>
```

---

## 3. Page Layouts & View Structures

### 3.1 Global App Shell Layout

The app’s authenticated shell follows this structure:

```tsx
<div className="relative min-h-dvh bg-bg text-ink">
  <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[42vh]">
    <div className="absolute -left-24 -top-32 size-[38rem] ..." />
    <div className="absolute -right-32 -top-40 size-[34rem] ..." />
  </div>

  <div className="mx-auto flex max-w-[var(--content-max)]">
    <aside className="hidden lg:flex w-[var(--sidebar-w)] ..." />
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="h-[var(--header-h)] ..." />
      <main id="main" className="p-4 sm:p-5 lg:p-6">
        {children}
      </main>
    </div>
  </div>
</div>
```

Critical layout rules:

- full-height app canvas with subtle radial brand glows in background
- left sidebar is fixed width desktop rail
- `max-width` content area is 1360px
- header and shell use `bg-surface` / `glass` treatments with border and shadow
- app body layout collapses to a mobile app shell below desktop sizes

### 3.2 Responsive Behavior

The design system relies on Tailwind’s default breakpoints:

- `sm`: 640px
- `md`: 768px
- `lg`: 1024px
- `xl`: 1280px

Examples used across the app:

- `grid-cols-2` on small to medium screens
- `lg:grid-cols-3` and `xl:grid-cols-4` for KPI containers
- `hidden md:block` for table rendering
- `md:hidden` for mobile card stack rendering
- `overflow-x-auto` for tab strips and nav strips

### 3.3 Page Header Pattern

Every page uses a strong, consistent top section:

1. Breadcrumb row (optional)
2. Eyebrow label
3. H1 title
4. Subtitle line
5. Actions cluster on the right
6. Tab row (optional)
7. Divider line under header

Typical markup pattern:

```tsx
<PageHeader
  eyebrow="Mentis DS · v2.0.0"
  title="Design system"
  subtitle="Every token, primitive and motion preset the console is built from."
  breadcrumbs={[{ label: 'Design system' }]}
  actions={<SegmentedControl ... />}
  tabs={<nav className="flex gap-1 overflow-x-auto">...</nav>}
/>
```

### 3.4 Dashboard & KPI Layout

Dashboard compositions combine metric tiles and supporting cards.

Typical dashboard structure:

```tsx
<div className="flex flex-col gap-6">
  <PageHeader ... />
  <StatGrid>
    <StatCard label="Sessions" value={68} ... />
    <StatCard label="Members" value={328} ... />
    <StatCard label="Open tasks" value={19} ... />
    <StatCard label="Breach risk" value={3} ... />
  </StatGrid>

  <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
    <Card>
      <CardHeader>Attendance trend</CardHeader>
      <CardContent>...</CardContent>
    </Card>
    <Card>
      <CardHeader>Priority actions</CardHeader>
      <CardContent>...</CardContent>
    </Card>
  </div>
</div>
```

Rules:

- header area always top aligned
- KPI tile heights equalized via auto rows and `gap-4`
- key metric cards are `Card` surfaces with subtle separation
- the layout prioritizes compact density while retaining white space around major blocks

### 3.5 List and Table Views

Typical list layout:

```tsx
<Card>
  <CardToolbar>
    <div>Filters</div>
    <Button intent="primary">Add</Button>
  </CardToolbar>
  <DataTable data={rows} columns={columns} rowKey={(r) => r.id} />
</Card>
```

Rules:

- Toolbar sits as a header row within the card
- DataTable fills width with minimal internal padding
- In table view, columns are left-aligned by default
- Rows show status groups through badges and progress meters
- Empty screens slot into the table area, not below it

### 3.6 Detail / Modal / Side Sheet Views

Detail screens often use a `Dialog` or `SheetContent` frame:

```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent size="lg">
    <DialogHeader>
      <DialogTitle>Session details</DialogTitle>
      <DialogDescription>Review and edit session settings.</DialogDescription>
    </DialogHeader>
    <DialogBody> ... </DialogBody>
    <DialogFooter>
      <Button intent="ghost">Cancel</Button>
      <Button intent="primary">Save changes</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

Rules:

- center modal on desktop, slide-in sheet on smaller layouts or side panels
- `scrim` overlays with `backdrop-blur`
- footer area separated by a top border
- destructive actions are tonally red with consistent treatment

---

## 4. Icons & Assets

### 4.1 Primary Icon Package

The app relies on `lucide-react` as its primary icon system.

Examples used across the product:

- `Activity`, `Bell`, `CalendarDays`, `Check`, `ClipboardList`, `Command`, `Filter`, `Inbox`, `LayoutDashboard`, `Search`, `Settings`, `Sparkles`, `Target`, `Users`, `Wallet`, `Zap`, `Trophy`, `Plus`, `Trash2`, `Info`, `Layers`, `Sun`, `Moon`, `Monitor`

Distinctive visual traits:

- line icons, mostly 1.5px stroke weight
- consistent 16px to 20px icon size
- active icon color generally matches text color or brand text for accent states

### 4.2 Font Assets

Custom web fonts are imported from `@fontsource-variable`:

- `@fontsource-variable/inter`
- `@fontsource-variable/plus-jakarta-sans`

Typography usage:

- Interface text: Inter Variable
- Display headings and labels: Plus Jakarta Sans Variable
- Mono for small technical labels and code-like metadata

### 4.3 Custom Brand Mark / Logo

The brand mark is a custom SVG monogram, not a standard icon library image.

Design:

- 24x24 viewBox
- gradient mesh that transitions from teal to iridescent indigo
- rounded square container with gradient fill and subtle sheen
- wordmark “Mentis” in a bold display font with a trailing small caption line “Kingfisher TTC”

SVG structure:

```tsx
<span className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-[linear-gradient(135deg,var(--brand),#0d9488_55%,#4f46e5)] shadow-[var(--shadow-glow)]">
  <svg viewBox="0 0 24 24" className="size-5 text-[var(--brand-ink)]" aria-hidden>
    <path d="M5 19V5.5L12 12l7-6.5V19" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
</span>
```

### 4.4 Icon + Surface Conventions

Icon buttons and small controls usually follow a consistent pattern:

- square 32–40px hit area
- muted text color until hovered/active
- soft surface-hover background when interactive
- focus ring using `var(--brand-soft)`

Examples:

```tsx
<button className="flex size-9 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--brand-soft)]">
  <Sun className="size-4.5" />
</button>
```

### 4.5 Decorative Assets and Ambient Graphics

The layout also uses soft, non-UI assets:

- radial gradient blobs behind the main canvas
- top light band overlays on cards
- subtle translucent glass layers on raised surfaces
- ambient glow for brand moments and selected nav items

These are not separate image files; they are layered CSS gradients and box-shadow treatments.

---

## 5. Visual Rules Summary for Zero-Regression Recreation

To reconstruct the exact look without drift, preserve these rules:

1. Default dark theme is the product baseline; light mode is a class override.
2. Keep semantic tokens and CSS variables as the single source of truth.
3. Use the display font for headings and all feature titles; use inter for labels, body, forms, and tables.
4. Keep all cards using `border`, `surface`, `shadow-sm`, and a thin top sheen overlay.
5. Use brand teal as the product primary accent; use gold for secondary emphasis and warnings.
6. Keep all numeric values display with tabular-nums for alignment in tables and KPIs.
7. Maintain app-shell architecture: rail + header + content + cards.
8. Preserve the gradient brand wordmark and glass-like shell chrome.
9. Keep the status tone mapping consistent across the entire system.
10. Do not use arbitrary raw colors outside the semantic palette; match the CSS variable contract exactly.

---

## 6. Direct Design System Field Notes

The current product is intentionally built as a “single design language shared by both the web and mobile app” with the following design pillars:

- Structural navy surfaces with teal and indigo highlight accents
- Dense information architecture for club operations, coaching, finance, and attendance
- Crisp content hierarchy with large display headings and compact UI labels
- Cards and tables as the primary reading model
- Soft motion and floating shadows to provide depth without overdoing animation
- Theme-aware UI with `dark` default and strong contrast for accessibility

This blueprint is intentionally compiled from actual implementation tokens and class patterns so a clean rebuild can restore the original UI with near-perfect visual fidelity.
