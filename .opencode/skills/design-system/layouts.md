# Layout Conventions

Every page maps to exactly one layout convention. The system has three tiers:

```
Tier 1: Application Shell (app-shell / tool-view / auth-flow)
  └── Owns the viewport. Provides sidebar nav, tool header, or auth card.

Tier 2: Page Frame (PageFrame)
  └── Page-level header (title, breadcrumbs, actions) + scrollable body.

Tier 3: Content Layout (varies per page)
  └── Composition inside PageFrame.Body — list, detail, dashboard, settings, etc.
```

Use the decision tree below to select the correct Tier 1 shell, then select the page convention that describes what goes inside it.

## Decision Tree

Evaluate these conditions **in order**. Use the first match.

| # | Condition | Shell (Tier 1) | Page convention (Tier 3) |
|---|-----------|---------------|-------------------------|
| 1 | Unauthenticated flow (login, register, password reset, invite accept) | `auth-flow` | — (standalone) |
| 2 | Immersive full-screen tool (session replay, capture widget) | `tool-view` | — (tool manages own layout) |
| 3 | Main authenticated pages with sidebar navigation | `app-shell` | Select from page conventions below |

### Page conventions (inside `app-shell` > `PageFrame`)

| # | Condition | Convention |
|---|-----------|------------|
| 1 | Filterable collection of records with empty/populated states | `page-list` |
| 2 | Single-record detail view with metadata | `page-detail` |
| 3 | Grid of summary cards, metrics, or KPI tiles | `page-dashboard` |
| 4 | Settings with secondary sidebar navigation | `page-settings` |
| 5 | Otherwise (standalone forms, about pages, single-column content) | `page-single` |

---

## Tier 1 Components

### `AppShell` (REP-369)

Sidebar + content area grid shell. Primary authenticated layout.

| Sub-component | Purpose | Key props |
|---------------|---------|-----------|
| `AppShell` | Root grid shell, `100vh`, `gridTemplateColumns="220px 1fr"` | — |
| `AppShell.Sidebar` | Flex column for logo, `SideNav`, user menu | — |
| `AppShell.Content` | Scrollable content area for `<Outlet />` | — |

**Structure:**

```tsx
import { AppShell, SideNav } from '@repro/design'

<AppShell>
  <AppShell.Sidebar>
    {/* App-level: WorkspaceHeader, SideNav, UserMenu */}
  </AppShell.Sidebar>
  <AppShell.Content>
    <Outlet />
  </AppShell.Content>
</AppShell>
```

**Sidebar content is app-level** — `WorkspaceHeader`, `SideNav` with route-aware items, and `UserMenu` are compositions built in `apps/workspace/src/` (not design system components). The design system provides the structural shell and the navigation primitives; the app wires them to routes and session data.

### `ToolView` (REP-370)

Full-screen tool shell. Sidebar is hidden; compact header bar with back link + tool controls.

| Sub-component | Purpose | Key props |
|---------------|---------|-----------|
| `ToolView` | Root grid shell, `100vh`, `gridTemplateRows="auto 1fr"` | — |
| `ToolView.Header` | Compact bar (40–48px), back link + title + actions | — |
| `ToolView.Content` | Full-bleed content area (`overflow: hidden`) | — |

**Structure:**

```tsx
import { ToolView } from '@repro/design'
import { DevTools } from '@repro/devtools'

<ToolView>
  <ToolView.Header>
    <Link to="/sessions">← Back to sessions</Link>
    <span>{recording.title}</span>
    <ShareButton />
  </ToolView.Header>
  <ToolView.Content>
    <DevTools resourceBaseURL={resourceBaseURL} />
  </ToolView.Content>
</ToolView>
```

### `auth-flow` (standalone layout)

Unauthenticated flow with a centered content card on a subtle background. Auth layouts are custom standalone compositions — they do not use `AppShell`, `ToolView`, or any Tier 1 shell from `@repro/design`. Each app defines its own `AuthLayout` component using inline styles and design tokens directly.

**Structure:**

```tsx
import { Center, color, spacing, radius, shadow } from '@repro/design'
import { Block, Col } from '@jsxstyle/react'

<Block height="100vh" backgroundColor={color.bg.subtle}>
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
```

**Storybook:** `Patterns/Layouts` > `auth-flow`

**Legacy implementations:**
- `apps/workspace/src/AuthLayout.tsx` — workspace login/register
- `apps/admin/src/AuthLayout.tsx` — admin login with Admin badge

---

## Tier 2: PageFrame (REP-371)

Page-level header (title, breadcrumbs, actions) above a scrollable body. Rendered inside `AppShell.Content`. Does not own the viewport.

| Sub-component | Purpose | Key props |
|---------------|---------|-----------|
| `PageFrame` | Flex column, `height: 100%` (fills parent) | — |
| `PageFrame.Header` | Flex row: title left, actions right | — |
| `PageFrame.Title` | `<h1>` with heading typography | — |
| `PageFrame.Actions` | Right-aligned action buttons | — |
| `PageFrame.Body` | `flex: 1`, `overflow-y: auto`, scrollable | `maxWidth` |

**Structure:**

```tsx
import { PageFrame, Button } from '@repro/design'

<PageFrame>
  <PageFrame.Header>
    <PageFrame.Title>Sessions</PageFrame.Title>
    <PageFrame.Actions>
      <Button>New Recording</Button>
    </PageFrame.Actions>
  </PageFrame.Header>
  <PageFrame.Body>
    {/* Page content — see Tier 3 conventions */}
  </PageFrame.Body>
</PageFrame>
```

---

## Tier 3: Page Conventions

These describe what goes inside `PageFrame.Body` (or inside `AppShell.Content` when a page composes its own framing).

### Convention: `page-list`

Filterable collection of records with empty and populated states.

**When to use:** Sessions list, team members list, API keys list — any tabular or card-based collection.

**Structure:**

```tsx
import { PageFrame, Card, EmptyState, Button } from '@repro/design'
import { Col, Grid } from '@jsxstyle/react'
import { spacing } from '@repro/design'

<PageFrame>
  <PageFrame.Header>
    <PageFrame.Title>Sessions</PageFrame.Title>
    <PageFrame.Actions>
      <Button>New Recording</Button>
    </PageFrame.Actions>
  </PageFrame.Header>
  <PageFrame.Body>
    {/* Filter bar (when applicable) */}
    {items.length === 0 ? (
      <EmptyState>
        <EmptyState.Title>No sessions yet</EmptyState.Title>
        <EmptyState.Description>
          Start capturing user sessions to see them here.
        </EmptyState.Description>
        <EmptyState.Action>
          <Button>Create Recording</Button>
        </EmptyState.Action>
      </EmptyState>
    ) : (
      <Col gap={spacing.md}>
        {items.map(item => (
          <Card key={item.id}>{/* Item row */}</Card>
        ))}
      </Col>
    )}
  </PageFrame.Body>
</PageFrame>
```

### Convention: `page-detail`

Single-record detail view with metadata.

**When to use:** Individual account view, user profile, recording metadata (not the player — that's `tool-view`).

**Structure:**

```tsx
import { PageFrame, Breadcrumbs, Card } from '@repro/design'
import { Col, Grid } from '@jsxstyle/react'
import { spacing } from '@repro/design'

<PageFrame>
  <PageFrame.Header>
    <Breadcrumbs>
      <Breadcrumbs.Item component={Link} to="/accounts">Accounts</Breadcrumbs.Item>
      <Breadcrumbs.Item current>{account.name}</Breadcrumbs.Item>
    </Breadcrumbs>
  </PageFrame.Header>
  <PageFrame.Body maxWidth={960}>
    <Grid gridTemplateColumns="1fr 320px" gap={spacing.xl}>
      <Col gap={spacing.lg}>
        {/* Primary content sections */}
      </Col>
      <Card>
        {/* Metadata sidebar */}
      </Card>
    </Grid>
  </PageFrame.Body>
</PageFrame>
```

### Convention: `page-dashboard`

Grid of summary cards, metrics, or KPI tiles.

**When to use:** Analytics overview, workspace home with activity cards, any metrics-heavy page.

**Structure:**

```tsx
import { PageFrame, Card } from '@repro/design'
import { Col, Grid } from '@jsxstyle/react'
import { spacing } from '@repro/design'

<PageFrame>
  <PageFrame.Header>
    <PageFrame.Title>Dashboard</PageFrame.Title>
  </PageFrame.Header>
  <PageFrame.Body>
    <Col gap={spacing['2xl']}>
      <Grid
        gridTemplateColumns="repeat(auto-fill, minmax(240px, 1fr))"
        gap={spacing.xl}
      >
        {/* Summary cards */}
      </Grid>
      {/* Charts, tables */}
    </Col>
  </PageFrame.Body>
</PageFrame>
```

### Convention: `page-settings`

Settings with a secondary sidebar navigation for sections.

**When to use:** Account settings, workspace settings, any configuration area with multiple sections.

**Structure:**

```tsx
import { PageFrame, SideNav } from '@repro/design'
import { Grid } from '@jsxstyle/react'
import { spacing } from '@repro/design'

<PageFrame>
  <PageFrame.Header>
    <PageFrame.Title>Settings</PageFrame.Title>
  </PageFrame.Header>
  <PageFrame.Body>
    <Grid gridTemplateColumns="200px 1fr" gap={spacing.xl} height="100%">
      <SideNav aria-label="Settings navigation">
        <SideNav.Item component={NavLink} to="/settings" active>General</SideNav.Item>
        <SideNav.Item component={NavLink} to="/settings/team">Team</SideNav.Item>
        <SideNav.Item component={NavLink} to="/settings/api-keys">API Keys</SideNav.Item>
      </SideNav>
      <Col gap={spacing['2xl']} maxWidth={720}>
        <Outlet />
      </Col>
    </Grid>
  </PageFrame.Body>
</PageFrame>
```

### Convention: `page-single`

Single-column content with width-constrained body.

**When to use:** Standalone forms, about pages, detail views without sidebars, or any linear top-to-bottom content.

**Structure:**

```tsx
import { PageFrame } from '@repro/design'
import { Col } from '@jsxstyle/react'
import { spacing } from '@repro/design'

<PageFrame>
  <PageFrame.Header>
    <PageFrame.Title>Create Team</PageFrame.Title>
  </PageFrame.Header>
  <PageFrame.Body maxWidth={720}>
    <Col gap={spacing['2xl']}>
      {/* Content sections */}
    </Col>
  </PageFrame.Body>
</PageFrame>
```

---

## Supporting Components

### Layout Primitives

| Component | Purpose | Key props |
|-----------|---------|-----------|
| `Stack` | Vertical flex layout with token-constrained gap | `gap` (spacing token key, e.g. `"xl"`), `component` |
| `Center` | Horizontal + vertical centering via CSS Grid | `maxWidth` |

### Navigation Primitives

| Component | Purpose | Key props |
|-----------|---------|-----------|
| `SideNav` | Vertical sidebar navigation (`<nav>`) | `aria-label` |
| `SideNav.Section` | Grouped nav items with optional title | `title` |
| `SideNav.Item` | Nav link with icon, active state, router integration | `icon`, `active`, `component` |
| `Breadcrumbs` | Hierarchical page location (`<nav>`) | — |
| `Breadcrumbs.Item` | Breadcrumb link with router integration | `component`, `current` |
| `DropdownMenu` | Trigger-activated action menu | — |

---

## Route-to-Shell Mapping

| Route pattern | Shell | Convention | Notes |
|---------------|-------|------------|-------|
| `/account/login` | `auth-flow` | — | Standalone centered card |
| `/account/register` | `auth-flow` | — | Same as login |
| `/` | `app-shell` | redirect | Redirects to `/sessions` |
| `/sessions` | `app-shell` | `page-list` | Session recordings list |
| `/sessions/:id` | `tool-view` | — | Full-screen replay with `DevTools` |
| `/settings` | `app-shell` | `page-settings` | Secondary sidebar nav |
| `/settings/team` | `app-shell` | `page-settings` | Nested under settings |
| `/share/:id` | standalone | — | No shell — public share page |

---

## Route Structure

React Router v6 layout routes scope each shell:

```tsx
<Routes>
  {/* Auth flow — standalone layout */}
  <Route element={<AuthLayout />}>
    <Route path="/account/login" element={<Login />} />
    <Route path="/account/register" element={<Register />} />
  </Route>

  {/* App shell — sidebar nav */}
  <Route element={<RequireSession><AppShellLayout /></RequireSession>}>
    <Route index element={<Navigate to="/sessions" />} />
    <Route path="/sessions" element={<SessionsList />} />
    <Route path="/settings" element={<SettingsLayout />}>
      <Route index element={<GeneralSettings />} />
      <Route path="team" element={<TeamSettings />} />
    </Route>
  </Route>

  {/* Tool view — full-screen playback */}
  <Route element={<RequireSession><ToolViewLayout /></RequireSession>}>
    <Route path="/sessions/:id" element={<RecordingRoute />} />
  </Route>

  {/* Standalone */}
  <Route path="/share/:id" element={<ShareRoute />} />
</Routes>
```

---

## Imports Reference

```tsx
// Tier 1 shells
import { AppShell, ToolView } from '@repro/design'

// Tier 2 page frame
import { PageFrame } from '@repro/design'

// Navigation primitives
import { SideNav, Breadcrumbs, DropdownMenu } from '@repro/design'

// Content components
import { Card, EmptyState, Button, Stack, Center } from '@repro/design'

// Tokens
import { color, colors, spacing, radius, shadow, textStyles } from '@repro/design'

// Layout primitives
import { Block, Col, Row, Grid } from '@jsxstyle/react'
```
