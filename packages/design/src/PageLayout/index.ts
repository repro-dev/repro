import { BrandedBackdrop } from './BrandedBackdrop'
import { PageLayout as PageLayoutRoot } from './PageLayout'
import { PageLayoutBody } from './PageLayoutBody'
import { PageLayoutHeader } from './PageLayoutHeader'
import { PageLayoutSidebar } from './PageLayoutSidebar'

export type { BrandedBackdropProps } from './BrandedBackdrop'
export type { PageLayoutProps } from './PageLayout'
export type { PageLayoutBodyProps } from './PageLayoutBody'
export type {
  PageLayoutHeaderGradient,
  PageLayoutHeaderProps,
} from './PageLayoutHeader'
export type { PageLayoutSidebarProps } from './PageLayoutSidebar'

export { BrandedBackdrop }

export const PageLayout = Object.assign(PageLayoutRoot, {
  Backdrop: BrandedBackdrop,
  Header: PageLayoutHeader,
  Body: PageLayoutBody,
  Sidebar: PageLayoutSidebar,
})
