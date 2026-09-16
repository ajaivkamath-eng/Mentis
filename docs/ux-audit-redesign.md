# UX/UI Audit & Redesign Breakdown — Mentis DS v2 “Deep Court”

**Scope:** the web console (`apps/web`, 18 page modules), the coach app (`apps/mobile`, 8 screens), and the
shared domain package (`packages/core`).
**Method:** every route module and screen was read, then the interface was measured with a static census
(class usage, inline style values, icon/emoji usage, loading and feedback patterns). Every number quoted below
comes from that census, and every fix links to the file that carries it.

---

## 1. Executive summary

| Pillar | Before | After |
| --- | --- | --- |
| **1. Visual hierarchy & layout** | Fixed 220 px sidebar, 18 flat links, no collapse, no page context, one flat card style, ad-hoc spacing | Three-tier shell (rail 272↔88, glass header, mobile drawer), 8 grouped nav sections (~40 items) filtered by permission, page headers with breadcrumbs/eyebrow/actions/tabs, 6 card variants with a 4-level elevation ladder, 4 pt spacing scale |
| **2. Design system & aesthetics** | 2 brand colours + 5 hardcoded hexes in pages, system fonts, no status vocabulary, 3 undefined CSS variables in use | 130-token contract in `packages/core/src/tokens.ts` — 32 semantic colours per theme, 9 palette ramps, 10-step type scale, radii/elevation/motion tokens — consumed by **both** platforms; Inter + Plus Jakarta Sans self-hosted |
| **3. Micro-interactions & motion** | No transitions, `Loading…` text instead of loading states, no press feedback, no haptics | Press-scale 0.97, hover lift, page transitions, staggered entrances, shimmer skeletons, menu/sheet motion, undo toasts — all gated on `prefers-reduced-motion` / `ReduceMotion.System`; 68 haptic call-sites on mobile |
| **4. Cross-platform consistency** | Web CSS variables and mobile hex literals drifted independently; status labels duplicated | One token module drives web (`app.css` + Tailwind `@theme`) and native (`lib/theme.tsx`, generated `tokens.json`, NativeWind bridge); a CI parity test fails if either platform's stylesheet drifts |
| **5. UX enhancements** | 28 hand-rolled tables, 2 bare `Loading…`, 8 `prompt()` + 14 `alert()` prompts, one-line empty states, unlabelled inputs | Responsive sortable `DataTable` with skeleton rows and card fallback, `EmptyState` + 5 presets, Radix dialogs with focus handling, `Input/Field/SegmentedControl`, ⌘K command palette, swipe actions with accessibility escape |

Everything is verified by the repo's own gates: `apps/web` typecheck + build + 30 component tests, `apps/mobile`
typecheck, root typecheck + 125 domain tests, and a design-token parity suite that re-runs the native code
generator. See §6.

---

## 2. Pillar 1 — Visual hierarchy & layout

**What was wrong**

- `apps/web/src/lib/ui.tsx` hardcoded a 220 px sidebar with 18 links in one flat list: no grouping, no
  collapse, no persistence, no search, no mobile treatment (the `<aside>` was `hidden md:flex`, so phones had no
  navigation at all).
- The header carried no context: no page title, no breadcrumb, no actions region. Orientation came from the page
  body only, which was often a bare `<h1>`.
- Surfaces were one-note: a single `.card` style (border + shadow), a single `.btn` style. There was no way to
  express “raised”, “inset”, “glass” or “brand” without inline styles — and inline styles are exactly what the
  pages used: 101 `.card` usages, 90 `btn` usages and 140 raw `<input>` elements.
- Spacing was improvised per file (`p-4` vs `p-6` vs `style={{ padding: 12 }}`), so vertical rhythm changed
  between screens.

**How the redesign resolves it**

| Fix | Where |
| --- | --- |
| Collapsible rail (272 px ↔ 88 px) with tooltip labels, persisted to `mentis.railCollapsed` | `src/components/layout/app-shell.tsx` |
| Grouped navigation model — 8 sections, ~40 items, each with permission, icon, keywords and a `primary` flag for mobile | `src/lib/nav.ts` |
| Sliding active indicator (`layoutId` pill), collapsible groups remembered in `mentis.navGroups`, auto-open of the active group | `src/components/layout/nav-list.tsx` |
| Page header with breadcrumbs, eyebrow (date/context), wrapping action cluster and optional tab strip | `src/components/patterns/page-header.tsx` |
| Card variants: `default`, `raised`, `glass`, `flat`, `brand` + `e1–e4` elevation tokens, on a 4 pt spacing scale | `src/components/ui/card.tsx`, `packages/core/src/tokens.ts` |
| Mobile: glass bottom bar with the four primary destinations, “More” opens a drawer with the full tree | `app-shell.tsx`, `nav-list.tsx` |

---

## 3. Pillar 2 — Design system & aesthetics

**What was wrong**

- The palette was two colours (navy, teal) with no tint ramps, so every “soft” surface had to be faked with
  `rgba()` literals; 32 usages of `var(--muted)`, 12 of `var(--line)` and 4 of `var(--red)` were left behind when
  the token layer moved on — three variables that no longer existed, silently rendering inherited colours.
- Typography was the system stack; numbers, headings and body text all shared one rhythm, and KPI values were
  handwritten `text-2xl font-black`.
- Statuses had no shared vocabulary: each page invented its own label and colour, and the mobile app duplicated
  the mapping a third time.

**How the redesign resolves it**

- `packages/core/src/tokens.ts` is the contract: raw ramps (court/slate/teal/gold/iris/emerald/amber/red/sky) →
  **32 semantic colours** per theme (`bg`, `surface`, `surfaceRaised`, `ink`, `brand`, `brandSoft`, `brandText`,
  `success/warning/danger/info` + `*Soft`, `ring`, `scrim`, `sheen`, chart series), 8 radii, 13 spacing steps,
  6 elevation presets, z-index ladder, 10-step type scale, 6 durations, 5 easings, 4 springs.
- Typography: **Inter** for interface text, **Plus Jakarta Sans** for display/KPI, self-hosted via Fontsource
  (no third-party font request), with per-step tracking and tabular numerals for figures.
- Icons: Lucide on both platforms, one size ladder (12/14/16/20 px), decorative icons marked `aria-hidden`.
- Colour usage rules: gradients are reserved for brand moments (aurora backdrop, brand pill); semantic colours
  are only ever applied through tokens, never hex literals.
- Legacy compatibility: the old variable names are aliased in `app.css` (`--muted → --ink-muted`,
  `--line → --border`, `--red → --danger`, `--mentis-*`), and every page that used them was migrated — zero
  undefined variables remain.

---

## 4. Pillar 3 — Micro-interactions & motion

**What was wrong**

- No transitions anywhere; state changes appeared instantly with no direction or causality.
- Loading was a text string (`Loading…` in two places, and a bare blank table otherwise), so pages “jumped”
  when data arrived.
- Buttons and rows had no press feedback; there were no hover affordances beyond the cursor.
- The mobile app had literally no haptics, despite being the tool a coach holds while marking a register one-handed.

**How the redesign resolves it**

- **Web:** `press` (0.97 scale, spring `swift`), `hoverLift` (2 px rise + shadow bloom), `enterUp` (8 px rise +
  fade, 35 ms stagger capped at 8 children), `page` transitions with scroll reset, popover/menu scale-in,
  shimmer skeletons that match final row height, and `animate-shimmer / aurora / pulse-ring / stagger / rise /
  spin-slow / sweep` utilities. Framer Motion’s `useReducedMotion()` short-circuits every transform.
- **Mobile:** Reanimated worklets for press/entrance/sheets (`lib/motion.ts`), skeletons for every list
  (`Skeleton`, `SkeletonList`, `SkeletonStatGrid`), swipe-to-act rows with rubber-banding and threshold haptics,
  and `lib/haptics.ts` wrappers (`select`, `tap`, `press`, `heavy`, `success`, `warning`, `error`) that no-op on
  web — 68 call-sites across the six screens.
- **Feedback:** web toasts (success/error/info/warning/loading + `toast.undoable`), mobile success check
  animation, offline banners on both platforms.

---

## 5. Pillar 4 — Cross-platform consistency

**What was wrong**

- Web expressed its design as CSS variables; mobile expressed it as hex literals inside `StyleSheet.create`.
  Nothing tied the two together, so “the same teal” was three different teals depending on which file you opened.
- Domain vocabulary (attendance/task/invoice statuses) was re-derived per screen on both platforms.

**How the redesign resolves it**

- One token module feeds both: web mirrors it into CSS custom properties + Tailwind v4 `@theme`; native imports
  it directly (`lib/theme.tsx`) and additionally consumes a **generated** `apps/mobile/tokens.json`
  (`scripts/gen-tokens.mjs`, with `--check` mode for CI) that drives `tailwind.tokens.js` → `tailwind.config.js`.
- `packages/core/src/status.ts` owns `toneForStatus()` / `humanStatus()`, consumed by the web `StatusBadge`, the
  native `StatusPill`, and the badge kit — one status, one colour, one label, everywhere.
- `tests/design_tokens.test.ts` asserts core ↔ web `:root`/`.dark`/`@theme` ↔ native `:root`/`.dark` ↔ generated
  JSON, plus scale parity (radii, type scale, spacing rhythm, elevation shapes). CI runs the same check through
  `npm run tokens:check` in the mobile job.

**Platform mapping (same component, two implementations)**

| Concept | Web | Native |
| --- | --- | --- |
| Surface | `Card` (`default/raised/glass/flat/brand`) | `Card` / `Surface` (`plain/glass/raised/brand/inset`) |
| Button | `Button` (6 intents × 4 sizes) | `Button` (5 intents × 3 sizes, 34/42/50 dp) |
| List | `DataTable` (sort, paginate, card fallback) | `ListRow` + `SwipeRow` + `Segmented` |
| Loading | `Skeleton*` family | `Skeleton*` family |
| Empty | `EmptyState` + 5 presets | `EmptyState` + 5 presets |
| Status | `StatusBadge` | `StatusPill` |
| Overlay | Radix `Dialog` / `AlertDialog` | Modal route + action sheet |
| Motion | Framer Motion presets (`lib/motion.ts`) | Reanimated presets (`lib/motion.ts`) |

---

## 6. Pillar 5 — UX enhancement checklist

The brief called out four areas specifically. Audit and outcome for each:

**Input controls**
*Before:* 140 raw `<input>` elements, unlabelled in most cases, no error or hint affordances, validation left to
`alert()`.
*After:* `Input`, `Textarea`, `Select`, `Label`, `Field` (label + hint + error + required + inline action),
`InputWithIcon` (search with clear button), `SegmentedControl`. Native gets the same contract inline on the login
and register screens, with `AlertFallback` guidance for lock failures.

**Empty states**
*Before:* one-line grey text (`No sessions today.`, `All clear.`), which tells the user nothing about what to do.
*After:* `EmptyState` with icon, tone, description and primary/secondary actions, plus presets
`NoResultsState`, `NoDataState`, `ErrorState`, `PermissionState`, `InboxZeroState`. Mobile ships the same five
presets and uses them in 11 places.

**Modals**
*Before:* `prompt()` for payment references and due dates, `alert()` for confirmations (8 and 14 call-sites) —
un-styleable, blocking, inaccessible.
*After:* Radix-based `Dialog` and `AlertDialog` with focus trap, escape handling, destructive affordances and
motion; `toast.undoable` for reversible operations. On mobile, sheets slide from the bottom with the
`sheetEnter/sheetExit` preset and swipe-to-dismiss.
*(These legacy `prompt()`/`alert()` call-sites still exist in the older page modules — see §7.)*

**List rendering**
*Before:* 28 hand-rolled `<table className="grid">` blocks with no sorting, no pagination, no responsive
behaviour and no loading state; the mobile lists were plain `ScrollView`s.
*After:* `DataTable` (declarative columns, sorting with `aria-sort`, pagination, sticky header, skeleton rows,
staggered entrance capped at 8 rows, labelled card fallback below `md`) and `usePager`; mobile gets `ListRow`,
`SwipeRow` (96 px trigger / 148 px max with keyboard escape and screen-reader announcements) and
`Segmented` filters.

**Also fixed while in there:** offline banner + queue visibility on both platforms, relative time formatting,
`⌘K` command palette with recents and permission filtering, pull-to-refresh on mobile, and focus rings that
survive on every surface.

---

## 7. Remaining work (tracked, not hidden)

| Item | Count | Notes |
| --- | --- | --- |
| `prompt()` / `alert()` call-sites in legacy pages | 8 / 14 | The kit now has `Dialog`, `AlertDialog` and `toast`; conversion is mechanical per page |
| Bare `Loading…` text | 2 | `entities.tsx:55`, `coaching.tsx:188` — replace with `SkeletonPage` / inline skeleton |
| Hand-rolled KPI blocks (`text-2xl font-black`) | 12 | Migrate to `StatCard` (animated number, delta, sparkline) |
| Raw `<table className="grid">` blocks | 28 | They inherit the v2 skin but are not yet sortable/responsive — migrate to `DataTable` |
| NativeWind `className` adoption | — | The pipeline (babel + metro + tailwind config + CSS contract) is wired; components currently use typed StyleSheet tokens, which keeps the parity test authoritative |
| `pages/dashboards.tsx` exemplar | done | Venue dashboard, member-sessions and ICS export were rebuilt on the kit as the reference for the migration above |

---

## 8. Verification

| Gate | Command | Result |
| --- | --- | --- |
| Web typecheck + production build | `cd apps/web && npm run build` | ✅ (CSS 70 kB / gzip 15 kB; app chunk 670 kB / gzip 191 kB, charts + motion code-split) |
| Web component tests | `cd apps/web && npm test` | ✅ 3 files / 30 tests (primitives, shell, design-system page) |
| Mobile typecheck | `cd apps/mobile && npm run typecheck` | ✅ |
| Native token freshness | `cd apps/mobile && npm run tokens:check` | ✅ in sync with `packages/core/src/tokens.ts` |
| Domain + parity tests | `npx tsc --noEmit && npx vitest run` (root) | ✅ 14 files / 125 tests |
| CI | `.github/workflows/ci.yml` | core, web (build + test), mobile (typecheck + tokens:check), functions |
