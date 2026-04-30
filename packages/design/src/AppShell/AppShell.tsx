import { Grid } from '@jsxstyle/react'
import React from 'react'
import { color } from '../tokens/colors'

export const SIDEBAR_WIDTH = 220

export interface AppShellProps {
  children?: React.ReactNode
}

/**
 * Primary authenticated application shell providing a sidebar + content grid.
 *
 * Renders a full-viewport CSS Grid with a fixed-width sidebar region and a
 * flexible content region. Use the compound sub-components
 * (`AppShell.Sidebar`, `AppShell.Content`) to populate the named regions.
 *
 * The sidebar region is for app-level compositions (logo, navigation, user
 * menu). The content region holds the route outlet and page-level components
 * like `PageFrame`.
 *
 * @example
 *   <AppShell>
 *     <AppShell.Sidebar header={<Logo />} footer={<UserMenu />}>
 *       <SideNav />
 *     </AppShell.Sidebar>
 *     <AppShell.Content>
 *       <Outlet />
 *     </AppShell.Content>
 *   </AppShell>
 */
export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  return (
    <Grid
      height="100dvh"
      gridTemplateColumns={`${SIDEBAR_WIDTH}px 1fr`}
      backgroundColor={color.bg.surface}
    >
      {children}
    </Grid>
  )
}
