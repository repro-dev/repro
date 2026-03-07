import { PageLayout as PageLayoutRoot } from './PageLayout'
import { PageLayoutBody } from './PageLayoutBody'
import { PageLayoutHeader } from './PageLayoutHeader'
import { PageLayoutSidebar } from './PageLayoutSidebar'

export type { PageLayoutProps } from './PageLayout'
export type { PageLayoutBodyProps } from './PageLayoutBody'
export type {
  PageLayoutHeaderGradient,
  PageLayoutHeaderProps,
} from './PageLayoutHeader'
export type { PageLayoutSidebarProps } from './PageLayoutSidebar'

export const PageLayout = Object.assign(PageLayoutRoot, {
  Header: PageLayoutHeader,
  Body: PageLayoutBody,
  Sidebar: PageLayoutSidebar,
})
