import { AppShell as AppShellRoot } from './AppShell'
import { AppShellContent } from './AppShellContent'
import { AppShellSidebar } from './AppShellSidebar'

export type { AppShellProps } from './AppShell'
export { SIDEBAR_WIDTH } from './AppShell'
export type { AppShellContentProps } from './AppShellContent'
export type { AppShellSidebarProps } from './AppShellSidebar'

export const AppShell = Object.assign(AppShellRoot, {
  Sidebar: AppShellSidebar,
  Content: AppShellContent,
})
