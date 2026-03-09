# Layout Conventions

Every page maps to exactly one layout convention. Use the decision tree below to select the correct one, then follow the convention's reference card.

## Decision Tree

Evaluate these conditions **in order**. Use the first match.

| # | Condition | Convention |
|---|-----------|------------|
| 1 | Unauthenticated flow (login, register, password reset, invite accept) | `auth-centered` |
| 2 | Primary app chrome with persistent navigation (top bar + optional sidebar) | `app-shell` |
| 3 | Primary content area + contextual metadata panel side-by-side | `content-sidebar` |
| 4 | Grid of summary cards, metrics, or KPI tiles | `dashboard-grid` |
| 5 | Otherwise (single-column: settings, forms, detail views, lists) | `content-single` |

## PageLayout Sub-Components

All conventions are built from these `PageLayout` sub-components:

| Sub-component | Purpose | Key props |
|---------------|---------|-----------|
| `PageLayout` | Root grid shell, `100vh`, `gridTemplateRows="auto 1fr"` | — |
| `PageLayout.Backdrop` | Absolute-positioned gradient layer behind structural content | `gradient`, `backgroundColor`, `height` (default 180) |
| `PageLayout.Header` | Transparent top bar region | `backgroundColor` |
| `PageLayout.Body` | Scrollable content area, optional centering | `maxWidth`, `padding` (default `spacing.xl`) |

Supporting layout primitives:

| Component | Purpose | Key props |
|-----------|---------|-----------|
| `Stack` | Vertical flex layout with token-constrained gap | `gap` (spacing token key, e.g. `"xl"`), `component` |
| `Center` | Horizontal + vertical centering via CSS Grid | `maxWidth` |

**Imports for all convention examples:**

```tsx
import { PageLayout, Stack, Center, color, colors, spacing, radius, shadow } from '@repro/design'
import { Block, Col, Row, Grid } from '@jsxstyle/react'
```

---

## Convention: `app-shell`

Full application shell with branded header and scrollable body. Optionally includes a sidebar.

**When to use:** The page is the main authenticated chrome — top bar with logo, navigation links, and user controls.

**Regions:**

| Region | Component | Content |
|--------|-----------|---------|
| Backdrop | `PageLayout.Backdrop` with `gradient` | Visual gradient layer behind content |
| Header | `PageLayout.Header` (transparent on top of backdrop) | Logo, nav links, user menu |
| Body | `PageLayout.Body` | Route outlet / main content |

**Structure (with sidebar):**

```tsx
<PageLayout>
  <PageLayout.Backdrop gradient={{ from: colors.blue['900'], to: colors.blue['700'] }} />
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
<PageLayout>
  <PageLayout.Backdrop gradient={{ from: colors.blue['900'], to: colors.blue['700'] }} />
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
<PageLayout>
  <PageLayout.Backdrop gradient={{ from: colors.blue['900'], to: colors.blue['700'] }} />
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
