# REP-1074: Props-First Alternatives to Compound Composition — Evaluation

## 1. Executive Summary

This evaluation examines the compound component composition model used throughout `@repro/design` and compares it against props-first (slot props) alternatives. The analysis is grounded in concrete codebase evidence from all 22+ compound components in the design system and their usage across 5 app routes in `apps/admin` and `apps/workspace`.

**Key finding**: The compound model is overused. Only 7 of 15 compound components (Tabs, Table, Accordion, DropdownMenu, SideNav, Breadcrumbs, AppShell) have genuinely variable structures that warrant sub-components. The remaining 8 (Modal, PageFrame, ToolView, EmptyState, Card, Collapsible, ConfirmDialog, Drawer) own fixed layouts that would be better served by slot props. The evidence from app-side drift — duplicated `useIsDesktopViewport`, inconsistent `Card context="danger" padding={0}` patterns, varied Modal.Header usage — confirms that giving consumers free-form control over internal composition causes measurable inconsistency.

**Recommendation**: Adopt props-first as the default composition model for future components. Keep compound only for inherently variable structures. Migrate ToolView and EmptyState to props-first; add props-first wrappers for Modal and Drawer; leave PageFrame and AppShell compound but tighten guidance. The full per-component classification is in §5.

---

## 2. Current State — Inventory

### 2.1 Inventory Table

| Component | API Shape | Sub-components | Context Provider? | Current model appropriate? |
|-----------|-----------|----------------|-------------------|---------------------------|
| Modal | Compound | Header (props-first internals), Body | No | Partial — compound for advanced; needs props-first wrapper |
| PageFrame | Compound | Header, Title, Actions, Body | No | Mixed — works for pages; settings surfaces need slot props |
| AppShell | Compound | Sidebar (slot-props internals), Content | No | Yes — truly variable (sidebar optional, content free-form) |
| ToolView | Compound | Header, Content | No | No — fixed 2-region layout, no variability |
| EmptyState | Compound | Icon, Title, Description, Action | No | No — 5 invariant parts in fixed order, no context shared |
| Tabs | Compound | List, Tab, Panel | Yes (`TabsContext`) | Yes — N tabs, N panels, Context-driven |
| Table | Compound | Header, Body, Row, Cell, HeaderCell | Yes (`TableContext`) | Yes — N rows, N columns, sort/selection state via Context |
| Accordion | Compound | Item, Trigger, Content | Yes (2 Contexts) | Yes — N items, each with trigger/content |
| DropdownMenu | Compound | Trigger, Content, Item, Separator | Yes (via floating-ui) | Yes — N items, floating-ui state via Context |
| SideNav | Compound | Section, Item | No | Yes — N sections, N items per section |
| Breadcrumbs | Compound | Item | No | Yes — N items in arbitrary order |
| Card | Props-first | — | — | Yes — already correct |
| Collapsible | Props-first | — | No | Yes — `trigger` as a prop, `children` as content |
| ConfirmDialog | Props-first | — | No | Yes — wraps Modal compound internally via props |
| Drawer | Free-form children | — | No | Partial — no sub-components but no slot guardrails either |

### 2.2 Structural Invariant Analysis

For each compound component, we assess what invariants the compound model is supposed to enforce and whether they are *actually* enforced:

| Component | Invariant claimed | Enforced? | Evidence |
|-----------|------------------|-----------|----------|
| Modal | "Header before Body before Footer" | Convention only | `Modal.Header` can be placed after `Modal.Body` in source — nothing prevents it. `Modal.Body` is a simple `Col padding={spacing.xl}` wrapper (Modal.tsx:195-197). There is no fixed layout — consumers can omit both, put Header inside Body, or nest arbitrarily. |
| PageFrame | "Header + scrollable Body" | Convention only | `PageFrame.Title` can appear outside `PageFrame.Header` — the root component is `Col height="100%"` (PageFrame.tsx:32) with zero structural enforcement. |
| EmptyState | "Icon → Title → Description → Action" | Convention only | All sub-components are positional children; nothing prevents reordering, omissions, or extra wrappers between them. |
| ToolView | "Header bar + full-bleed content" | Convention only | Root is `Grid gridTemplateRows="auto 1fr"` (ToolView.tsx:31). Header and Content are positional children — wrong order breaks the layout. |

### 2.3 Props-First Counter-Examples

Three props-first components demonstrate how the same composition concerns are handled without compound sub-components:

**Collapsible** (`packages/design/src/Collapsible/Collapsible.tsx`):
- Single `trigger` prop + `children` for content
- Owns all layout, spacing, typography, ARIA wiring, and animation
- Consumers provide only trigger text and panel content — no ability to break the layout
- This is the canonical example of a fixed-layout component that does not need sub-components

**ConfirmDialog** (`packages/design/src/ConfirmDialog/ConfirmDialog.tsx`):
- All content is controlled via named props: `title`, `description`, `confirmLabel`, `cancelLabel`, `variant`
- Internally wraps Modal compound components but consumers never touch Modal sub-components
- The props interface guarantees consistent header structure, button layout, and spacing
- This is the exemplary case: a props-first wrapper that provides guardrails for a 90% use case while the underlying compound remains available for advanced consumers

**Card** (`packages/design/src/Card/Card.tsx`):
- Captures semantic context (`context`, `fullBleed`) and layout (`padding`, `height`) via named props
- Owns the spacing contract — consumers cannot alter internal padding or border treatment
- The `Card context="danger"` pattern is idiomatically clear, requiring no compound sub-components

---

## 3. Drift Evidence

### 3.1 The `useIsDesktopViewport` Duplication (4 copies)

The identical `useIsDesktopViewport` hook is defined in three separate files with exact duplicate implementations:

| File | Lines | Pattern |
|------|-------|---------|
| `apps/admin/src/routes/UserDetailRoute.tsx` | 51–91 | Defines `desktopViewportQuery` + `useIsDesktopViewport` + `TabPanelContent` wrapper |
| `apps/workspace/src/routes/AccountSettingsRoute/AccountSettingsRoute.tsx` | 60–100 | Defines `desktopViewportQuery` + `useIsDesktopViewport` + `SettingsContent` wrapper |
| `apps/workspace/src/routes/ProjectSettingsRoute/ProjectSettingsRoute.tsx` | 102–140 | Defines `useIsDesktopViewport` + `SettingsContent` wrapper (inline string, no `desktopViewportQuery` variable) |

All three use the pattern `maxWidth: isDesktop ? '66.666%' : '100%'` via inline `props.style`. `ProjectSettingsRoute.tsx:150` uses `jsxstyle maxWidth` prop instead of inline style, making it subtly different from the other two.

**Contrast with ProfileSettingsRoute**: `ProfileSettingsRoute.tsx` uses `PageFrame.Body maxWidth={720}` directly — a completely different approach with no `useIsDesktopViewport` at all. This is a concrete example of compound-model drift: because `PageFrame.Body` accepts `maxWidth` but has no opinion about responsive behavior, each settings surface reinvents the responsive wrapper independently.

### 3.2 The Duplicated `ActionRow` Pattern (3 copies)

The `ActionRow` component (a grid with label/description on the left and control on the right) is identically defined in three separate route files:

| File | Lines | Identical? |
|------|-------|------------|
| `apps/admin/src/routes/UserDetailRoute.tsx` | 23–49 | Grid, identical gap/spacing tokens |
| `apps/workspace/src/routes/AccountSettingsRoute/AccountSettingsRoute.tsx` | 33–58 | Grid, identical gap/spacing tokens |
| `apps/workspace/src/routes/ProjectSettingsRoute/ProjectSettingsRoute.tsx` | 59–84 | Grid, identical gap/spacing tokens |

All three define the same local `ActionRow` type and same `Grid gridTemplateColumns="minmax(0, 1fr) auto"` pattern. The plan at `../plan-REP-1074.md` called this out as risk #4 ("Settings page drift is real") and it is confirmed.

### 3.3 The `Card context="danger" padding={0}` Pattern (3 copies)

The `Card context="danger" padding={0}` + inner `ActionRow` pattern appears identically in:

| File | Lines | Contents |
|------|-------|----------|
| `apps/admin/src/routes/UserDetailRoute.tsx` | 275–311 | "Danger zone" section with `ActionRow` inside `Card context="danger" padding={0}` |
| `apps/workspace/src/routes/AccountSettingsRoute/AccountSettingsRoute.tsx` | 498–515 | "Danger zone" section with identical pattern |
| `apps/workspace/src/routes/ProjectSettingsRoute/ProjectSettingsRoute.tsx` | 669–687 | "Danger zone" section with identical pattern |

The only structural difference: `UserDetailRoute` wraps actions in a `Col gap={0}` with per-item borders, while both workspace routes use a single `Block padding={spacing.lg}` for a single action. This is a concrete candidate for a `DangerZone` props-first component.

### 3.4 Modal.Header Usage — Inconsistent Composition

Modal.Header appears in app code in two distinct patterns:

**Inside Modal.Body (wrapped in extra Col)**:
- `AccountSettingsRoute.tsx:529-531`: `<Modal.Header title="Delete account?" ... />` inside `<Modal.Body>` with an extra `Col gap={spacing.md}`
- `DeactivateUserDialog.tsx:56-58`: `<Modal.Header ... />` inside `<Modal.Body>` with `Col gap={spacing.md}` wrapper
- `ProjectSettingsRoute.tsx:701-703`: `<Modal.Header ... />` inside `<Modal.Body>` with `Col gap={spacing.lg}` wrapper

**As top-level child (inside a form Col, not Modal.Body)**:
- `CreateProjectDialog.tsx:130`: `<Modal.Header title="Create project" />` inside a `<Col>` that also wraps the form, with no `Modal.Body` wrapper

This inconsistency is documented in the plan's risk note: "Modal.Header is accessed as a compound sub-component, but its API is purely props-first (`title`, `description`)." The patterns show that `Modal.Header` is being used in varying nesting contexts, which a props-first `Modal({ title, description, ... })` wrapper would eliminate.

### 3.5 PageFrame Sub-Component Drift

`UserDetailRoute` and `AccountSettingsRoute` both place the page header *inside* `PageFrame.Body` with a `Block width="100%" maxWidth={1440} margin="0 auto"` wrapper, while `ProfileSettingsRoute` uses `PageFrame.Header` directly. This contradicts the design-system guidance ("Put the page header inside `PageFrame.Body`, not `PageFrame.Header`, when the surface needs tabs or wide context") but the guidance itself is a convention — nothing enforces it, and the two approaches coexist inconsistently.

---

## 4. API Shape Comparison

### 4.1 Evaluation Matrix

| Criterion | Compound wins when... | Props-first wins when... |
|-----------|----------------------|-------------------------|
| API clarity | Structure is inherently variable (N tabs, N rows, N items in a menu) | Structure is fixed and semantically meaningful (header/body, icon/title/description/action) |
| Implementation consistency | Sub-components need shared state via React Context | Component owns the layout/spacing/semantic contract entirely |
| Guardrail strength | Never — compound gives away layout control to consumers | Always — component controls spacing, semantics, and region ordering |
| Agent codegen ease | Structure maps 1:1 to DOM nesting (children are rendered in order) | Fewer decisions = fewer wrong choices; agent only fills named props |
| Edge-case flexibility | Consumers need to inject custom wrappers or interstitials between regions | Consumers only need content injection; custom wrappers would violate design intent |

### 4.2 Comparison: Modal (compound) vs ConfirmDialog (props-first wrapper of Modal)

**Modal** (`packages/design/src/Modal/Modal.tsx`):
- `width` / `height` are required props (free-form values)
- Children are free-form `ReactNode` with convention-only sub-components
- Sub-components are simple wrappers: `Modal.Header` is a `Col` with `gap={spacing.xs}` + title/description, `Modal.Body` is a `Col` with `padding={spacing.xl}`
- Spacing between Header and Body depends on what the consumer places between them
- ARIA wiring (`aria-labelledby`) requires the consumer to provide and coordinate IDs

**ConfirmDialog** (`packages/design/src/ConfirmDialog/ConfirmDialog.tsx`):
- All content is named props: `title`, `description`, `confirmLabel`, `cancelLabel`, `variant`
- Button layout, spacing, and labels are all owned by the component
- Confirm/Cancel wiring is handled internally
- ARIA is managed via `aria-label={title}` on the parent Modal
- 0 lines of consumer layout code for the dialog structure

**Analysis**: ConfirmDialog demonstrates that the 90% use case for Modal is a fixed confirmation layout with 5–6 named slots. The component itself is only 68 lines and wraps Modal internally. For the remaining 10% (form modals, custom layouts), the raw Modal compound remains available. This dual-surface pattern — props-first wrapper + compound escape hatch — is the strongest recommendation emerging from this evaluation.

### 4.3 Comparison: EmptyState (compound, five-part formula) vs Props-First Alternative

**Current EmptyState compound** (`packages/design/src/EmptyState/`):
- 6 files: `EmptyState.tsx`, `EmptyStateIcon.tsx`, `EmptyStateTitle.tsx`, `EmptyStateDescription.tsx`, `EmptyStateAction.tsx`, `index.ts`
- Each sub-component is a thin wrapper with specific styling
- Consumers must compose in the correct order, with the correct gap between parts
- The `EmptyStateAction` is a bare `Block props={{ ref }}>{children}</Block>` (no semantics)

**Hypothetical props-first alternative:**
```tsx
<EmptyState
  icon={<InboxIcon size={48} />}
  title="No sessions yet"
  description="Sessions will appear here once recording begins."
  action={<Button>Get started</Button>}
/>
```
- 1 file, ~40 lines
- Order is enforced by the component code, not consumer discipline
- Spacing, typography, and ARIA are guaranteed consistent
- Missing parts are handled gracefully (optional props)

**Evidence**: App usage of EmptyState (47 matches across 5 files in apps/) universally follows the 5-part structure. There are zero cases where consumers use a different order, add interleaving elements, or omit spacing wrappers. The compound model provides no benefit but carries maintenance cost for 6 files.

### 4.4 Comparison: PageFrame (compound) vs Card (props-first)

**PageFrame** (`packages/design/src/PageFrame/`):
- 8 files for 5 sub-components (Header, Title, Actions, Body, root + stories + test)
- No shared context — each component is styled independently
- Structural invariants (Header before Body) are convention-only
- The `maxWidth` prop on `PageFrame.Body` doesn't address responsive behavior, leading to the duplicated `useIsDesktopViewport` pattern in 3 routes

**Card** (`packages/design/src/Card/Card.tsx`):
- 1 main file, 48 lines
- All variation is captured in named props: `context`, `fullBleed`, `padding`, `height`
- Layout, spacing, and semantics are owned by the component
- Can't produce inconsistent card layouts because consumers can't arrange sub-components

---

## 5. Recommendation

### 5.1 Default Composition Model

> **Props-first (slot props) should be the default for new components.** When a component owns a fixed structural layout — regions in a predictable order with consistent spacing, typography, and semantics — those regions should be named slot props, not free-form children. Compound sub-components should be reserved for inherently variable structures where the number or order of children is genuinely unpredictable and sub-components share state via React Context.

### 5.2 Decision Rules

1. **Use props-first (slot props) when**: The component has a fixed layout with 2–4 named regions in a predictable order. The component owns spacing, typography, and semantic HTML for each region. *Example: `ConfirmDialog({ title, description, confirmLabel, cancelLabel, variant })`. Proposed: `ToolView({ header, children })`, `EmptyState({ icon, title, description, action })`.*

2. **Use props-first with render-props when**: Same as #1 but one region needs access to internal component state. *Example: a hypothetical `DataTable({ columns, rows, renderCell })`.*

3. **Use compound sub-components when**: The component has genuinely variable structure — the number, order, or presence of children cannot be predicted. The sub-components need shared context via React Context. *Example: `Tabs` (N tabs with `TabsContext`), `Table` (N rows with `TableContext`), `Accordion` (N items with `AccordionContext`), `DropdownMenu` (N items with `DropdownMenuContext` + floating-ui).*

4. **Use hybrid (props-first wrapper + compound internals) when**: 90% of use cases have a fixed structure but the remaining 10% need flexibility. The component internally uses the compound pattern but exposes a props-first API. *Example: Modal/ConfirmDialog pattern. Proposed: Modal gains a default props-first wrapper, Drawer gains optional slot props for header/footer/subtitle.*

5. **Avoid free-form children for layout components**: Components that exist to provide layout, spacing, or alignment (AppShell, PageFrame, ToolView, Modal) should not accept free-form children without guardrails. Move to slot props or constrained sub-components.

### 5.3 Per-Component Classification

| Component | Recommendation | Rationale |
|-----------|---------------|-----------|
| **Modal** | Keep compound internals, add props-first wrapper | Compound needed for form modals and custom layouts; props-first wrapper (like ConfirmDialog) covers 90% of use cases with stronger guardrails. The `Modal.Header` is already props-first internally. |
| **PageFrame** | Keep compound for flexible pages, add slot props for settings surfaces | Settings pages (AccountSettings, UserDetail, ProjectSettings) have a fixed "page header → body → constrained content" structure that would benefit from slot props. Compound remains correct for pages with tabs, tables, and variable content. |
| **AppShell** | Keep compound | Truly variable: Sidebar is optional, header/footer are optional slots on Sidebar, content is free-form. No fixed-layout claim. |
| **ToolView** | Migrate to slot props | Fixed 2-region layout (header + full-bleed content) in a predictable order. No variability, no Context. `ToolView({ header: ..., children })` would be simpler and more constrained. |
| **EmptyState** | Migrate to props-first | Five-part formula is invariant — every usage in the codebase follows the same order. Sub-components share no Context. A single `EmptyState({ icon, title, description, action })` would replace 6 files with 1. |
| **Tabs** | Keep compound | Inherently variable (N tabs, N panels). `TabsContext` provides active-tab state. Cannot be props-first without losing flexibility. |
| **Table** | Keep compound | Inherently variable (N rows, N columns). `TableContext` provides sort, selection, and density state across sub-components. |
| **Accordion** | Keep compound | Inherently variable (N items, each with trigger + content). `AccordionContext` and `AccordionItemContext` manage open state. |
| **DropdownMenu** | Keep compound | Inherently variable (N items, sub-menus). `DropdownMenuContext` wraps floating-ui state. Cannot be props-first. |
| **SideNav** | Keep compound | Inherently variable (N sections, N items per section). Sections and items vary independently. |
| **Breadcrumbs** | Keep compound | Inherently variable (N items, arbitrary route depth). N items inserted by consumer in correct order. |
| **Card** | Keep props-first | Already correct. Named props for `context`, `padding`, `fullBleed`, `height` cover all variation. |
| **Collapsible** | Keep props-first | Already correct. Single `trigger` prop + `children` handles the fixed layout perfectly. |
| **ConfirmDialog** | Keep props-first | Already correct; exemplary pattern for props-first wrapping of compound internals. |
| **Drawer** | Add optional slot props for header/footer | Currently free-form children with no structural guidance. A props-first `header`/`footer` interface would improve guardrails while keeping `children` for the main content area. |

### 5.4 Follow-Up Issues

| # | Title | Priority | Rationale |
|---|-------|----------|-----------|
| 1 | **Add `DangerZone` props-first component** | High | Replaces the duplicated `Card context="danger" padding={0} + ActionRow` pattern (3 copies across admin & workspace). Props: `title`, `description`, `actions: Array<{label, description, control}>`. Eliminates the shared ActionRow duplication. |
| 2 | **Add `SettingsPage` props-first component** | High | Owns the `useIsDesktopViewport + maxWidth + spacing['3xl']` rhythm (duplicated in 3 routes). Props: page-level options, content sections. Eliminates `useIsDesktopViewport` duplication and `SettingsContent`/`TabPanelContent` wrappers. |
| 3 | **Migrate `EmptyState` from compound to props-first** | Medium | 6 files → 1. Props: `icon`, `title`, `description`, `action`. Backward-compatible (compound pattern kept as deprecated re-export initially). |
| 4 | **Add `ConfirmModal` props-first component** | Medium | Extends `ConfirmDialog` pattern for non-destructive confirmation modals. Handles the common Modal usage in CreateProjectDialog, DeactivateUserDialog, and the invite flow. |
| 5 | **Update `design-system/SKILL.md` and `references/component-contract.md`** | Medium | Cross-reference each other. Add the default model guidance from §5.1 and the decision rules from §5.2. |
| 6 | **Audit `Modal` usage and add default props-first wrapper** | Low | All 4 app-side Modal usages follow a pattern suitable for a props-first wrapper. A `Modal({ title, description, width, height, children, onClose })` wrapper would simplify 80%+ of Modal usage. |
| 7 | **Migrate `ToolView` to slot props** | Low | Low priority because ToolView has only 2 sub-components and internal usage is consistent. Demonstrates the pattern for future fixed-layout components. |

---

## 6. Open Questions

### 6.1 Backward Compatibility for Compound-to-Props Migrations

Migrating a compound component to props-first (EmptyState, ToolView) would break existing callers that use sub-component syntax. The standard migration strategy is:
1. Add props-first API to the root component
2. Deprecate the sub-component exports (keep for one minor version)
3. After the deprecation window, remove the sub-components

For `EmptyState`, which has ~10 usage sites across 5 files, this migration would be straightforward. The question is whether to batch this with a broader audit or do it incrementally.

### 6.2 Component-Contract Reference Doc vs Design-System Skill Gap

The `references/component-contract.md` already contains a decision table for compound vs slot composition (lines 85–119) and accurately describes both patterns. However, the `design-system/SKILL.md` does not surface or link to this guidance. The evaluation should flag this as a documentation gap that needs bridging (captured as Follow-up #5 in §5.4).

### 6.3 The 66.666% Max-Width Convention

The `maxWidth: isDesktop ? '66.666%' : '100%'` pattern appears in 3 app routes but is not codified anywhere in `@repro/design`. This width constraint (two-thirds of the page on desktop, full width on mobile) is a design system concern, not an app concern, but it has leaked into every settings surface because no component owns it. A `SettingsPage` component (§5.4 Follow-up #2) would solve this, but the precise width constraint needs design review.

### 6.4 Component Line-Count Analysis

The compound model's file overhead is significant:

| Component | Files | Total Lines | Props-first Equivalent |
|-----------|-------|-------------|----------------------|
| EmptyState | 6 | ~255 | 1 file, ~50 lines |
| PageFrame | 8 | ~192 | 1 file + 3 slot files (~100 lines) |
| AppShell | 7 | ~170 | N/A — keep compound |
| DropdownMenu | 8 | ~440 | N/A — keep compound |
| Table | 13 | ~680 | N/A — keep compound |

A props-first EmptyState would save ~200 lines of code and maintenance surface. A slot-props PageFrame wouldn't reduce file count significantly but would eliminate the `useIsDesktopViewport` duplication pattern across apps.

---

*Generated for REP-1074. See `tmp/plan-REP-1074.md` for the implementation plan and `tmp/context-REP-1074.md` for issue scope.*
