# Repo Restart Task List

This is the strict engineering checklist for rebuilding the Mentis UI from a clean repository while preserving the current design system, visual behavior, and layout fidelity.

## 1. Objective

Recreate the current product UI with zero visual regressions relative to the existing design language, while keeping the architecture clean and rebuildable.

The rebuild must preserve:
- product look and feel
- dark-first design system
- layout density and spacing rhythm
- typography hierarchy
- card-based data surfaces and shell layout
- motion and interaction states
- visual parity across desktop and mobile surfaces

Definition of done:
- the app matches the current design system visually
- the design tokens are centralized and reusable
- all pages can be built from the same base primitives
- no hardcoded one-off styling survives in feature pages

---

## 2. Execution Order

Use this exact order. Do not move ahead until the current phase is accepted.

1. Design token foundation
2. Base primitives
3. Shell and layout scaffolding
4. Page patterns
5. Feature page rebuild
6. Cross-device QA
7. Acceptance signoff

---

## 3. Phase-by-Phase Checklist

## Phase 1 — Design Token Foundation

### Task 1.1 — Lock the semantic palette
Files:
- `packages/core/src/tokens.ts`
- `apps/web/src/app.css`
- `apps/mobile/tailwind.tokens.js`

Checklist:
- [ ] Confirm the source-of-truth dark/light theme values match the current design
- [ ] Keep semantic names instead of raw hex values in app code
- [ ] Preserve the teal brand, navy canvas, muted text hierarchy, and gold accent usage
- [ ] Ensure all functional colors are mapped correctly:
  - brand
  - success
  - warning
  - danger
  - info
  - border
  - surface
  - scrim

Acceptance gate:
- [ ] Theme values can be swapped by toggling `.dark` without breaking components
- [ ] No component references raw hex codes directly
- [ ] Light and dark surfaces maintain readable contrast and match the live system

### Task 1.2 — Define typography scale
Files:
- `apps/web/src/app.css`
- `packages/core/src/tokens.ts`

Checklist:
- [ ] Implement Inter Variable for body/interface text
- [ ] Implement Plus Jakarta Sans Variable for display and strong headings
- [ ] Define base type scale:
  - 2xs, xs, sm, base, lg, xl, 2xl, 3xl, display
- [ ] Apply tabular numerals to metrics and tables

Acceptance gate:
- [ ] Headings feel geometric and high-contrast
- [ ] Body text is compact and readable
- [ ] KPI and table numbers align cleanly

### Task 1.3 — Define spacing, radii, and shadows
Files:
- `packages/core/src/tokens.ts`
- `apps/web/src/app.css`

Checklist:
- [ ] Add radius tokens: xs, sm, md, lg, xl, 2xl, 3xl
- [ ] Add shadow tokens: subtle, standard, raised, large, glow
- [ ] Define consistent spacing rhythm for cards, rows, inputs, and content blocks
- [ ] Maintain the thin top-sheen treatment on cards

Acceptance gate:
- [ ] Cards, inputs, and buttons share the same visual rhythm
- [ ] There are no inconsistent corners or oversized shadows

### Task 1.4 — Theme system and persistence
Files:
- `apps/web/src/lib/theme.tsx`
- `apps/web/src/main.tsx`
- `apps/web/index.html`

Checklist:
- [ ] Implement theme modes: `light`, `dark`, `system`
- [ ] Persist mode in localStorage
- [ ] Apply both class and `color-scheme` changes to the `html` root
- [ ] Ensure theme is applied before first paint to avoid flash

Acceptance gate:
- [ ] Theme toggle works without full page refresh
- [ ] App remains stable with system preference and persisted override

### Task 1.5 — Mobile parity export
Files:
- `apps/mobile/tailwind.config.js`
- `apps/mobile/tailwind.tokens.js`
- `apps/mobile/global.css`

Checklist:
- [ ] Mirror the same semantic tokens into native/mobile utilities
- [ ] Preserve font family mapping
- [ ] Preserve radius and spacing mapping
- [ ] Support dark-mode class toggling on the native app

Acceptance gate:
- [ ] Mobile and web share the same design contract
- [ ] No design drift between platforms

---

## Phase 2 — Base UI Primitives

### Task 2.1 — Button primitive
Files:
- `apps/web/src/components/ui/button.tsx`

Checklist:
- [ ] Implement button intents:
  - primary
  - secondary
  - soft
  - ghost
  - danger
  - link
- [ ] Implement sizes:
  - sm
  - md
  - lg
  - icon
- [ ] Add `loading` spinner behavior
- [ ] Add `disabled` treatment
- [ ] Add hover lift and press-scale animation
- [ ] Add focus-visible ring using brand-soft

Acceptance gate:
- [ ] Buttons feel consistent across all screen contexts
- [ ] Primary CTA is clearly dominant without overwhelming the UI
- [ ] Loading states do not cause layout jumps

### Task 2.2 — Badge and status mapping
Files:
- `apps/web/src/components/ui/badge.tsx`
- `apps/web/src/components/ui/status-badge.tsx`

Checklist:
- [ ] Implement tone variants for neutral, brand, success, warning, danger, info, accent, outline
- [ ] Add dot indicator and optional icon support
- [ ] Centralize the status-to-tone mapping
- [ ] Preserve humanized status strings for labels

Acceptance gate:
- [ ] Same status words render the same tone everywhere
- [ ] No random ad hoc badge colors survive in feature pages

### Task 2.3 — Card system
Files:
- `apps/web/src/components/ui/card.tsx`

Checklist:
- [ ] Implement default card, raised, glass, flat, and brand variants
- [ ] Add top sheen overlay
- [ ] Add consistent padding presets
- [ ] Add interactive lift on clickable cards

Acceptance gate:
- [ ] All key panels feel uniform
- [ ] Card surfaces do not look like disconnected page elements

### Task 2.4 — Form controls
Files:
- `apps/web/src/components/ui/input.tsx`

Checklist:
- [ ] Define standard input, textarea, and select treatment
- [ ] Implement label + hint + error pattern via `Field`
- [ ] Keep 40–44px form heights consistently
- [ ] Add trailing/leading icon patterns
- [ ] Ensure controlled focus ring and error state remain visible

Acceptance gate:
- [ ] Inputs are visually consistent with dashboard app patterns
- [ ] Errors and helper text follow the same rhythm

### Task 2.5 — Segmented controls and filter pills
Files:
- `apps/web/src/components/ui/input.tsx`

Checklist:
- [ ] Implement segmented pill switcher
- [ ] Use selected brand fill with soft ring treatment
- [ ] Add small count badges when needed

Acceptance gate:
- [ ] Filters and mode switches read as intentional UI control groups

### Task 2.6 — Empty and error states
Files:
- `apps/web/src/components/ui/empty-state.tsx`

Checklist:
- [ ] Implement neutral, brand, success, warning, danger variants
- [ ] Add icon, title, description, action, secondary action, footnote support
- [ ] Add reusable `NoResultsState`, `NoDataState`, `ErrorState`, `PermissionState`, `InboxZeroState`

Acceptance gate:
- [ ] Empty states feel designed and not broken
- [ ] All no-data states share consistent treatment

### Task 2.7 — Progress and data visuals
Files:
- `apps/web/src/components/ui/progress.tsx`
- `apps/web/src/components/ui/stat-card.tsx`

Checklist:
- [ ] Implement progress bar and circular progress ring
- [ ] Implement KPI cards with label/value/delta/sparkline pattern
- [ ] Map tone classes for progress and stat cards
- [ ] Add compact capacity meter behavior

Acceptance gate:
- [ ] KPI tiles feel visually like the product dashboard
- [ ] Progress colors remain semantically meaningful

### Task 2.8 — Avatar and user identity chips
Files:
- `apps/web/src/components/ui/avatar.tsx`

Checklist:
- [ ] Add deterministic gradient avatar backgrounds
- [ ] Add initials fallback behavior
- [ ] Add ring treatment for signed-in user identity

Acceptance gate:
- [ ] All user pills and avatars remain visually coherent

---

## Phase 3 — Layout and Shell Systems

### Task 3.1 — App shell and root structure
Files:
- `apps/web/src/components/layout/app-shell.tsx`

Checklist:
- [ ] Build full app frame with content canvas and background glow
- [ ] Add header bar with context and actions
- [ ] Add main content sheet with max-width constraints
- [ ] Add desktop shell separation from mobile shell

Acceptance gate:
- [ ] The app feels like the same measured product shell across pages

### Task 3.2 — Navigation model and sidebar
Files:
- `apps/web/src/lib/nav.ts`
- `apps/web/src/components/layout/nav-list.tsx`
- `apps/web/src/components/layout/app-shell.tsx`

Checklist:
- [ ] Implement grouped navigation segments
- [ ] Keep one navigation model for sidebar, drawer, and search palette
- [ ] Add active matching logic and active pill indicator
- [ ] Support collapsed rail mode and expanded mode
- [ ] Support role/permission filtering

Acceptance gate:
- [ ] Navigation reads as one coherent system
- [ ] Active route highlight matches the product pattern

### Task 3.3 — Brand and user controls
Files:
- `apps/web/src/components/layout/nav-list.tsx`
- `apps/web/src/components/layout/app-shell.tsx`

Checklist:
- [ ] Implement custom brand mark monogram
- [ ] Add user chip + role switch menu
- [ ] Add compact theme switch control
- [ ] Add user sign-out and account actions

Acceptance gate:
- [ ] Header chrome matches the product identity and spacing pattern

### Task 3.4 — Page header and section headers
Files:
- `apps/web/src/components/patterns/page-header.tsx`

Checklist:
- [ ] Implement breadcrumb row
- [ ] Implement eyebrow, title, subtitle, action cluster, tabs
- [ ] Use divider line below the header

Acceptance gate:
- [ ] All page titles and section headings have consistent structure and spacing

---

## Phase 4 — Data and Composite Components

### Task 4.1 — Data table
Files:
- `apps/web/src/components/ui/data-table.tsx`

Checklist:
- [ ] Implement real table at md and above
- [ ] Implement stacked mobile card fallback below md
- [ ] Add sorting UI and `aria-sort` states
- [ ] Add loading skeleton and empty state handling
- [ ] Support row click and keyboard actions

Acceptance gate:
- [ ] Lists remain readable and controlled across screen widths
- [ ] Table interactions feel native and consistent

### Task 4.2 — Dialog and sheet system
Files:
- `apps/web/src/components/ui/dialog.tsx`

Checklist:
- [ ] Add scrim/overlay behavior
- [ ] Add `DialogContent` sizes: sm, md, lg, xl
- [ ] Add header/title/description/footer layout
- [ ] Add side sheet variants
- [ ] Ensure destructive confirmation patterns are consistent

Acceptance gate:
- [ ] Global modal behavior feels like the same system across the app

### Task 4.3 — Dropdown and tooltip system
Files:
- `apps/web/src/components/ui/menu.tsx`

Checklist:
- [ ] Implement dropdown menu with proper alignment and highlight states
- [ ] Implement tooltip provider and content styling
- [ ] Keep menu item spacing consistent with product UI

Acceptance gate:
- [ ] Menus feel lightweight and polished, never heavy or mismatched

---

## Phase 5 — Shared Page Patterns

### Task 5.1 — Dashboard pattern
Files:
- `apps/web/src/pages/dashboards.tsx`
- `apps/web/src/pages/design-system.tsx`

Checklist:
- [ ] Rebuild stat grid layout
- [ ] Rebuild support cards and chart regions
- [ ] Preserve whitespace and section separation
- [ ] Keep KPI card heights equal and balanced

Acceptance gate:
- [ ] Dashboard feels like a dense, trusted operations surface, not a generic grid

### Task 5.2 — List/detail page pattern
Files:
- feature page files under `apps/web/src/pages/`

Checklist:
- [ ] Build list/grid pages with header, filters, toolbar, and table
- [ ] Build detail/edit page patterns with side panels or modals
- [ ] Keep table and action row spacing aligned with the app shell

Acceptance gate:
- [ ] The same layout rhythm is preserved across every page type

### Task 5.3 — Empty and permission-aware states
Files:
- `apps/web/src/pages/**/*.tsx`

Checklist:
- [ ] Add consistent empty, permission, and error state patterns in the page shell
- [ ] Avoid page-specific ad hoc empty states unless necessary

Acceptance gate:
- [ ] Empty screens are intentional and consistent with the design system

---

## Phase 6 — Visual Regression QA

### Task 6.1 — Global visual checks
Checklist:
- [ ] Confirm canvas/background colors match the reference system
- [ ] Confirm borders and backgrounds have consistent contrast
- [ ] Confirm all major surfaces use the same card treatment
- [ ] Confirm text hierarchy matches heading/body label relationships

Acceptance gate:
- [ ] No surface reads like it belongs to a different design era

### Task 6.2 — Component regression checks
Checklist:
- [ ] Button states
- [ ] Badge colors and status mapping
- [ ] Input states and focus treatment
- [ ] Modal/dialog spacing and motion
- [ ] Dropdown and tooltip styling
- [ ] Empty state tone and messaging
- [ ] Progress bars and KPI tiles

Acceptance gate:
- [ ] Every component matches the live product pattern

### Task 6.3 — Responsive checks
Checklist:
- [ ] Desktop shell quality
- [ ] Tablet density and list logic
- [ ] Mobile shell and drawer behavior
- [ ] Tables collapse correctly to stacked list cards

Acceptance gate:
- [ ] Responsive layouts feel stable and intentional at every breakpoint

---

## 7. File Priority List

If you want the shortest path to a correct rebuild, build these files in this order:

1. `packages/core/src/tokens.ts`
2. `apps/web/src/app.css`
3. `apps/web/src/lib/theme.tsx`
4. `apps/web/src/components/ui/button.tsx`
5. `apps/web/src/components/ui/badge.tsx`
6. `apps/web/src/components/ui/card.tsx`
7. `apps/web/src/components/ui/input.tsx`
8. `apps/web/src/components/ui/progress.tsx`
9. `apps/web/src/components/ui/stat-card.tsx`
10. `apps/web/src/components/ui/status-badge.tsx`
11. `apps/web/src/components/ui/empty-state.tsx`
12. `apps/web/src/components/ui/data-table.tsx`
13. `apps/web/src/components/ui/dialog.tsx`
14. `apps/web/src/components/ui/menu.tsx`
15. `apps/web/src/components/patterns/page-header.tsx`
16. `apps/web/src/components/layout/nav-list.tsx`
17. `apps/web/src/components/layout/app-shell.tsx`
18. `apps/web/src/lib/nav.ts`
19. `apps/web/src/pages/design-system.tsx`
20. remaining feature pages under `apps/web/src/pages/`

---

## 8. Hard Stop Rules

The rebuild is not done until all of the following are true:
- [ ] No raw color values are repeated outside the token system
- [ ] No page escapes the shared component system without a documented reason
- [ ] No component is built without checking its hover, active, disabled, and focus states
- [ ] No page-level visual identity diverges from the shared shell and token system
- [ ] The app can be rebuilt from a clean repository without losing the current design language

---

## 9. Release Signoff

Final approval requires all of these:
- [ ] Theme system accepted
- [ ] Base primitives accepted
- [ ] Navigation shell accepted
- [ ] Data tables accepted
- [ ] Modal/sheet system accepted
- [ ] Responsive QA accepted
- [ ] Scope and visual parity accepted

If any gate fails, revert to the last accepted phase and fix before continuing.
