# Mentis Rebuild Day-by-Day Plan

This plan converts the clean-repo restart into a concrete execution sequence. It is designed to preserve the current design system exactly while rebuilding the app in a stable, testable order.

The operating rule is simple: do not move to the next phase until the current phase has passed its checkpoint and the “done when” checklist is complete.

---

## Phase 0 — Setup and Baseline Capture

### Day 1: Baseline lock + clean branch

Objective:
- freeze the current product look and behavior
- create a clean branch for the restart
- define the source-of-truth visual reference

Checklist:
- [ ] Create a fresh branch for the restart
- [ ] Record screenshots of the main product surfaces
- [ ] Capture the main states: default, empty, loading, error, selected, hover
- [ ] Review the existing design system in the live web app
- [ ] Confirm the target files for the reboot: [DESIGN_SYSTEM_BLUEPRINT.md](DESIGN_SYSTEM_BLUEPRINT.md), [REPO_RESTART_TASK_LIST.md](REPO_RESTART_TASK_LIST.md), [packages/core/src/tokens.ts](packages/core/src/tokens.ts), [apps/web/src/app.css](apps/web/src/app.css), [apps/web/src/lib/theme.tsx](apps/web/src/lib/theme.tsx)

Concrete checkpoint:
- There is a saved visual baseline for every major screen and state.
- The branch is clean and isolated from feature work.
- The team agrees on the visual source of truth before implementation starts.

Done when:
- [ ] All major pages have baseline screenshots
- [ ] Design tokens and page patterns are reviewed against the live app
- [ ] No build work has started before the baseline is locked

---

## Phase 1 — Design Token Foundation

### Day 2: Theme contract and semantic tokens

Objective:
- rebuild the root design contract without touching page code
- ensure dark mode and light mode are functional and stable

Files:
- [packages/core/src/tokens.ts](packages/core/src/tokens.ts)
- [apps/web/src/app.css](apps/web/src/app.css)
- [apps/web/src/lib/theme.tsx](apps/web/src/lib/theme.tsx)
- [apps/mobile/tailwind.tokens.js](apps/mobile/tailwind.tokens.js)

Checklist:
- [ ] Recreate the semantic palette in the token layer
- [ ] Confirm surface, border, text, brand, success, warning, danger, and info tokens
- [ ] Restore the dark-first design with light-mode override
- [ ] Keep semantic names instead of raw hex values in feature code
- [ ] Verify `html.dark` and `color-scheme` switching logic

Concrete checkpoint:
- Theme toggling works cleanly for light, dark, and system mode.
- The entire app can switch from one theme to the other without visual breakage.

Done when:
- [ ] All surface/background values are semantic and centralized
- [ ] No component references raw hex codes directly
- [ ] Light and dark modes both read as intentional system states
- [ ] Theme state persists correctly

### Day 3: Typography, spacing, radii, shadows, and motion

Objective:
- complete the visual foundation beyond color
- standardize layout rhythm

Files:
- [apps/web/src/app.css](apps/web/src/app.css)
- [packages/core/src/tokens.ts](packages/core/src/tokens.ts)

Checklist:
- [ ] Restore type scale and font pairing
- [ ] Define spacing rhythm for cards, rows, inputs, and panels
- [ ] Set radius tokens and shadow tokens
- [ ] Add consistent motion-duration and easing tokens
- [ ] Rebuild the glassy card sheen and brand glow treatment

Concrete checkpoint:
- All core UI surfaces share the same rhythm without any one-off overrides.

Done when:
- [ ] Typography scale is consistent across headers, labels, and body text
- [ ] Spacing feels even and dense without crowding
- [ ] Radii and shadows are consistent across cards, controls, and dialogs
- [ ] Motion feels subtle and purposeful instead of decorative

---

## Phase 2 — Base UI Primitives

### Day 4: Buttons, status, and labels

Objective:
- rebuild the reusable primitive layer before page layouts

Files:
- [apps/web/src/components/ui/button.tsx](apps/web/src/components/ui/button.tsx)
- [apps/web/src/components/ui/badge.tsx](apps/web/src/components/ui/badge.tsx)
- [apps/web/src/components/ui/status-badge.tsx](apps/web/src/components/ui/status-badge.tsx)

Checklist:
- [ ] Rebuild primary, secondary, ghost, danger, link, and soft button variants
- [ ] Rebuild button sizes and loading states
- [ ] Define badge tone variants and status color mapping
- [ ] Rebuild small labels and dot indicators

Concrete checkpoint:
- Buttons and badges can be dropped into multiple screen contexts without styling mismatches.

Done when:
- [ ] CTA hierarchy is clear and stable
- [ ] Badge colors match semantic status meaning
- [ ] Loading and disabled states are consistent
- [ ] Button focus rings are visible and not visually weak

### Day 5: Cards, inputs, and empty/error states

Objective:
- create the foundational form and content containers that pages will sit on top of

Files:
- [apps/web/src/components/ui/card.tsx](apps/web/src/components/ui/card.tsx)
- [apps/web/src/components/ui/input.tsx](apps/web/src/components/ui/input.tsx)
- [apps/web/src/components/ui/empty-state.tsx](apps/web/src/components/ui/empty-state.tsx)
- [apps/web/src/components/ui/progress.tsx](apps/web/src/components/ui/progress.tsx)
- [apps/web/src/components/ui/stat-card.tsx](apps/web/src/components/ui/stat-card.tsx)

Checklist:
- [ ] Restore card variants and sheen treatment
- [ ] Rebuild form controls with label, helper, and error patterns
- [ ] Recreate empty and error state templates
- [ ] Rebuild progress, stat card, and KPI surfaces
- [ ] Confirm consistent spacing and font density in the primitives

Concrete checkpoint:
- The primitives behave like one packaged system, not a set of unrelated components.

Done when:
- [ ] Inputs, cards, and KPI tiles are consistently styled
- [ ] Empty states feel intentional and polished
- [ ] Progress and stat visuals align with the dashboard language
- [ ] No primitive uses a page-specific override

### Day 6: Avatar, tables, menus, and dialogs

Objective:
- finish the reusable UI layer for data-heavy product surfaces

Files:
- [apps/web/src/components/ui/avatar.tsx](apps/web/src/components/ui/avatar.tsx)
- [apps/web/src/components/ui/data-table.tsx](apps/web/src/components/ui/data-table.tsx)
- [apps/web/src/components/ui/dialog.tsx](apps/web/src/components/ui/dialog.tsx)
- [apps/web/src/components/ui/menu.tsx](apps/web/src/components/ui/menu.tsx)

Checklist:
- [ ] Rebuild user avatar treatment and identity pills
- [ ] Recreate the data-table primitive with header, body, sorting, and loading state
- [ ] Restore dialog and sheet patterns
- [ ] Rebuild menu and tooltip behavior

Concrete checkpoint:
- Basic management interactions feel native and reliable without custom styling per page.

Done when:
- [ ] Table rows, headers, and actions align with the product design language
- [ ] Dialogs and menus share the same shadow, border, and spacing system
- [ ] All interactive states are visible and consistent

---

## Phase 3 — Layout and Shell Systems

### Day 7: App shell and navigation framework

Objective:
- rebuild the product shell so every page can sit inside the same frame

Files:
- [apps/web/src/components/layout/app-shell.tsx](apps/web/src/components/layout/app-shell.tsx)
- [apps/web/src/components/layout/nav-list.tsx](apps/web/src/components/layout/nav-list.tsx)

Checklist:
- [ ] Rebuild the app frame, full-height layout, and content canvas
- [ ] Restore the left-side navigation with grouped sections and active state motion
- [ ] Add header controls, user chip, and theme switch
- [ ] Ensure the shell maintains spacing and max-width behavior

Concrete checkpoint:
- The app shell looks like a complete product surface, not a generic dashboard scaffold.

Done when:
- [ ] The navigation model is consistent across all pages
- [ ] Active section highlighting matches the current design
- [ ] Header chrome and shell spacing are stable
- [ ] The shell scales properly across desktop widths

### Day 8: Page headers, section structure, and shared rails

Objective:
- build the standard content frame the pages will use

Files:
- [apps/web/src/components/patterns/page-header.tsx](apps/web/src/components/patterns/page-header.tsx)

Checklist:
- [ ] Rebuild section header layout with title, subtitle, action cluster, and tab patterns
- [ ] Restore breadcrumb and divider behavior
- [ ] Confirm consistent margin rules for section blocks

Concrete checkpoint:
- Every page can be wrapped in the same header and content scaffolding without major visual drift.

Done when:
- [ ] Page titles and section blocks share the same structure
- [ ] Headers are visually balanced and consistently spaced
- [ ] Tabs and action groups are aligned with the shell

---

## Phase 4 — Shared Page Patterns

### Day 9: Dashboard and list/detail templates

Objective:
- implement the shared page archetypes before feature execution

Files:
- [apps/web/src/pages](apps/web/src/pages)

Checklist:
- [ ] Rebuild dashboard stat-grid layout and card arrangement
- [ ] Rebuild list/detail structure with toolbar, filters, data table, and actions
- [ ] Rebuild status panel and side detail patterns
- [ ] Ensure spacing matches the established design rhythm

Concrete checkpoint:
- The shared page templates look like the live product and can be reused across pages.

Done when:
- [ ] Dashboard layout is balanced and dense without visual noise
- [ ] List/detail pages remain consistent in spacing and hierarchy
- [ ] Filters and panel structure feel native to the product

### Day 10: Empty states and permission-aware screens

Objective:
- ensure the product’s non-data states feel intentional and visually consistent

Checklist:
- [ ] Recreate empty, permission denied, and error states
- [ ] Add consistent messaging patterns and action placement
- [ ] Ensure the shell and templates handle these states without structural breaks

Concrete checkpoint:
- A page with no data or limited permissions reads as a designed state, not a broken one.

Done when:
- [ ] Empty states are polished and visually coherent
- [ ] Permission and error screens match the same design language
- [ ] No page has ad hoc styling for no-data states

---

## Phase 5 — Feature Page Rebuild

### Day 11: Rebuild the most important user flows

Objective:
- move from shared design system to actual app functionality

Checklist:
- [ ] Rebuild the highest-priority pages first
- [ ] Use tokens, primitives, shell, and page patterns as the source of truth
- [ ] Do not introduce custom styling in feature pages unless it belongs to the shared system

Concrete checkpoint:
- The most critical flows are visually stable and behave consistently with the design system.

Done when:
- [ ] Priority screens are rebuilt in the product’s native visual language
- [ ] No page is visually isolated from the rest of the app
- [ ] Reusability of primitives is maintained

### Day 12: Remaining pages and cross-page consistency

Objective:
- complete the page rebuild without drifting from the design contract

Checklist:
- [ ] Rebuild remaining feature pages in the same rhythm and layout language
- [ ] Review cross-page consistency for cards, tables, forms, and feedback states
- [ ] Check all routes in the shell for spacing and hierarchy parity

Concrete checkpoint: 
- The app reads as one product rather than multiple separately styled sections.

Done when:
- [ ] Remaining pages have passed visual review
- [ ] Shared patterns are reused consistently
- [ ] Page-level custom styling is reduced to near zero

---

## Phase 6 — Visual QA and Hardening

### Day 13: Cross-device and theme QA

Objective:
- verify the rebuild holds the design system under real usage

Checklist:
- [ ] Test desktop and narrow widths
- [ ] Check dark mode and light mode across all major screens
- [ ] Test table density, forms, side panels, and modals
- [ ] Compare against the captured baseline screenshots

Concrete checkpoint:
- No major panel, type scale, or interaction mismatch remains between the live reference and the rebuild.

Done when:
- [ ] All primary screens are visually aligned to baseline
- [ ] Light and dark themes are consistent
- [ ] Layout holds up at common viewport widths

### Day 14: Final polish and acceptance signoff

Objective:
- complete the final quality gate before handoff

Checklist:
- [ ] Review all direct custom styling for exceptions
- [ ] Check spacing consistency across the app
- [ ] Verify focus, hover, and pressed states
- [ ] Verify all major flows work without visual breakage
- [ ] Confirm the rebuild is aligned with [DESIGN_SYSTEM_BLUEPRINT.md](DESIGN_SYSTEM_BLUEPRINT.md)

Concrete checkpoint:
- The rebuild is ready for signoff as a design-faithful reimplementation.

Done when:
- [ ] No page feels like a design outlier
- [ ] Primitives and theme layer are the single source of truth
- [ ] The app matches the current visual system within normal product QA tolerance
- [ ] Final signoff is recorded

---

## Hard Rules for the Whole Rebuild

1. Build the token layer before any page work.
2. Rebuild primitives before pages.
3. Shell and navigation before feature pages.
4. Never add a one-off color or spacing fix to a page without checking whether the token or primitive is the root cause.
5. Do not proceed to the next phase until the current phase passes its checkpoint.
6. Keep all “done when” checklists complete before signoff.

---

## Recommended Exit Criteria for the Full Project

The restart is complete when all of the following are true:
- [ ] Tokens are centralized and reusable
- [ ] Primitives are consistent and design-faithful
- [ ] The app shell and nav match the current product language
- [ ] Shared page patterns are stable across views
- [ ] Feature pages use the same system without bespoke styling drift
- [ ] The rebuild passes visual QA against the baseline
- [ ] The product reads as one coherent design system
