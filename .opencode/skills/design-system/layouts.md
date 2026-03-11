# Layout Conventions

Every page maps to exactly one layout convention. Use the decision tree below to select the correct one, then follow the convention's reference card.

## Decision Tree

Evaluate these conditions **in order**. Use the first match.

| # | Condition | Convention |
|---|-----------|------------|
| 1 | Unauthenticated flow (login, register, password reset, invite accept) | `auth-centered` |
| 2 | Primary app chrome with persistent navigation (top bar + optional sidebar) | `app-shell` |
| 3 | Page embeds the recording playback viewport with DevTools inspector | `tool-panel` |
| 4 | Primary content area + contextual metadata panel side-by-side | `content-sidebar` |
| 5 | Grid of summary cards, metrics, or KPI tiles | `dashboard-grid` |
| 6 | Otherwise (single-column: settings, forms, detail views, lists) | `content-single` |

## PageLayout Sub-Components

All conventions are built from these `PageLayout` sub-components:

| Sub-component | Purpose | Key props |
|---------------|---------|-----------|
| `PageLayout` | Root grid shell, `100vh`, `gridTemplateRows="auto 1fr"` | `branded` |
| `PageLayout.Header` | Transparent top bar region | `backgroundColor` |
| `PageLayout.Body` | Scrollable content area, optional centering | `maxWidth`, `padding` (default `spacing.xl`) |

When `branded` is set, `PageLayout` renders a product gradient backdrop (blue-900 to blue-700) behind the header. Use `branded` for customer-facing pages; omit for internal/admin pages.

Supporting layout primitives:

| Component | Purpose | Key props |
|-----------|---------|-----------|
| `Stack` | Vertical flex layout with token-constrained gap | `gap` (spacing token key, e.g. `"xl"`), `component` |
| `Center` | Horizontal + vertical centering via CSS Grid | `maxWidth` |

**Imports for all convention examples:**

```tsx
import { PageLayout, Stack, Center, Card, color, spacing, radius, shadow } from '@repro/design'
import { Block, Col, Row, Grid } from '@jsxstyle/react'
```

---

## Convention: `app-shell`

Full application shell with branded header and scrollable body. Optionally includes a sidebar.

**When to use:** The page is the main authenticated chrome — top bar with logo, navigation links, and user controls.

**Regions:**

| Region | Component | Content |
|--------|-----------|---------|
| Header | `PageLayout.Header` (transparent on top of branded gradient) | Logo, nav links, user menu |
| Body | `PageLayout.Body` | Route outlet / main content |

**Structure (with sidebar):**

```tsx
<PageLayout branded>
  <PageLayout.Header>
    {/* Logo, nav links, user controls */}
  </PageLayout.Header>
  <PageLayout.Body>
    <Grid gridTemplateColumns="280px 1fr" gap={spacing.xl} height="100%">
      {/* Sidebar nav items (wrap in Card) */}
      {/* Main content */}
    </Grid>
  </PageLayout.Body>
</PageLayout>
```

**Structure (without sidebar):**

```tsx
<PageLayout branded>
  <PageLayout.Header>
    {/* Logo, nav links, user controls */}
  </PageLayout.Header>
  <PageLayout.Body>
    {/* Main content */}
  </PageLayout.Body>
</PageLayout>
```

**Storybook:** `Patterns/Layouts` > `app-shell` (`packages/design/src/PageLayout/conventions.stories.tsx`)

**Legacy implementations (pre-`PageLayout` — use Storybook skeleton as canonical reference):**
- `apps/workspace/src/Layout.tsx` — workspace app shell (blue gradient header)
- `apps/admin/src/Layout.tsx` — admin app shell (slate gradient header)

---

## Convention: `auth-centered`

Unauthenticated flow with a centered content card on a subtle background.

**When to use:** Login, registration, password reset, invite acceptance, or any pre-authentication screen.

**Structure:**

```tsx
<PageLayout>
  <Block gridRow="1 / -1" backgroundColor={color.bg.subtle}>
    <Center>
      <Col alignItems="flex-start" gap={spacing['2xl']}>
        {/* Logo */}
        <Block
          backgroundColor={color.bg.surface}
          borderRadius={radius.md}
          boxShadow={shadow.md}
          padding={spacing['3xl']}
          width={400}
        >
          {/* Form content */}
        </Block>
      </Col>
    </Center>
  </Block>
</PageLayout>
```

**Storybook:** `Patterns/Layouts` > `auth-centered`

**Legacy implementations:**
- `apps/workspace/src/AuthLayout.tsx` — workspace login/register
- `apps/admin/src/AuthLayout.tsx` — admin login with Admin badge

---

## Convention: `tool-panel`

Multi-panel DevTools layout with a recording playback viewport, a resizable inspector, a toolbar with tab switching, and an optional side panel.

**When to use:** The page embeds the recording playback viewport with the DevTools inspector. Compose with `<DevTools>` from `@repro/devtools` — do not build custom multi-panel playback layouts.

**Structural overview:**

`<DevTools>` renders a CSS Grid (`gridTemplateRows="1fr auto"`) with two regions:

| Region | Component | Content |
|--------|-----------|---------|
| Playback | `PlaybackRegion` (`Block`) | `PlaybackCanvas` with scale-to-fit, pointer/scroll tracking, picker overlay |
| Inspector | `InspectorRegion` (`Grid`, `gridTemplateRows="40px auto"`) | `Toolbar` (toggle, picker, tabs, timeline) + collapsible `ContentRegion` with `DragHandle` resize |

The inspector is collapsible — when collapsed, only the `Toolbar` row is visible. When expanded, a `DragHandle` (from `@repro/design`) allows vertical resizing between `MIN_HEIGHT` and `MAX_HEIGHT`. The `DragHandle` masks pointer events on the playback viewport during drag to prevent iframe interference.

The `Toolbar` contains: inspector toggle, element picker, view tabs (Elements / Network / Console), a timeline slot (customisable via the `timeline` prop), and optional playback navigation controls.

**Composition pattern — hosting route:**

```tsx
import { DevTools } from '@repro/devtools'
import { PlaybackFromSourceProvider } from '@repro/playback'
import { Card } from '@repro/design'
import { Grid, Block } from '@jsxstyle/react'

<PlaybackFromSourceProvider source={source}>
  <Grid gridTemplateColumns="1fr 4fr" gridTemplateRows="100%" height="100%" gap={15}>
    {/* Optional sidebar */}
    <Card fullBleed height="100%">
      <Block height="100%" overflow="hidden" borderRadius={4}>
        <DevTools resourceBaseURL={resourceBaseURL} />
      </Block>
    </Card>
  </Grid>
</PlaybackFromSourceProvider>
```

**Key guidance:**

- Always compose with `<DevTools>` — never build custom multi-panel playback layouts from scratch.
- Pass `resourceBaseURL` to enable resource loading for the recorded session.
- Pass a custom `timeline` prop to replace the default `SimpleTimeline`.
- Set `hideInspectorOnOpen` to start with the inspector collapsed.

**Real examples:**

- `apps/workspace/src/routes/RecordingRoute/RecordingRoute.tsx` — workspace recording playback with sidebar
- `apps/capture/src/components/Widget/ReportForm/Layout.tsx` — capture widget report form (playback + aside panel)

---

## Convention: `content-single`

Single-column content with a header and width-constrained body.

**When to use:** Settings pages, standalone forms, detail views, or any page with linear top-to-bottom content.

**Structure:**

```tsx
<PageLayout>
  <PageLayout.Header>
    {/* Page title */}
  </PageLayout.Header>
  <PageLayout.Body maxWidth={720}>
    <Col gap={spacing['2xl']}>
      {/* Content sections */}
    </Col>
  </PageLayout.Body>
</PageLayout>
```

**Storybook:** `Patterns/Layouts` > `content-single`

---

## Convention: `content-sidebar`

Primary content area alongside a contextual metadata panel.

**When to use:** The page has a main content region (player, editor, document) with supplementary metadata or controls in a fixed-width side panel.

**Structure:**

```tsx
<PageLayout>
  <PageLayout.Header>
    {/* Page title */}
  </PageLayout.Header>
  <PageLayout.Body>
    <Grid gridTemplateColumns="1fr 320px" gap={spacing.xl} height="100%">
      {/* Primary content */}
      <Card>
        {/* Metadata panel */}
      </Card>
    </Grid>
  </PageLayout.Body>
</PageLayout>
```

**Storybook:** `Patterns/Layouts` > `content-sidebar`

---

## Convention: `dashboard-grid`

Grid of summary cards and metrics with a branded header.

**When to use:** KPI tiles, summary cards, charts, or tabular overviews in a responsive grid.

**Structure:**

```tsx
<PageLayout branded>
  <PageLayout.Header>
    {/* Dashboard title */}
  </PageLayout.Header>
  <PageLayout.Body>
    <Col gap={spacing['2xl']}>
      {/* Section heading */}
      <Grid
        gridTemplateColumns="repeat(auto-fill, minmax(240px, 1fr))"
        gap={spacing.xl}
      >
        {/* Summary cards */}
      </Grid>
      {/* Charts, tables */}
    </Col>
  </PageLayout.Body>
</PageLayout>
```

**Storybook:** `Patterns/Layouts` > `dashboard-grid`
