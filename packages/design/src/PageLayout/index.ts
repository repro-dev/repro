import { PageLayout as PageLayoutRoot } from './PageLayout'
import { PageLayoutBody } from './PageLayoutBody'
import { PageLayoutHeader } from './PageLayoutHeader'

export type { PageLayoutProps } from './PageLayout'
export type { PageLayoutBodyProps } from './PageLayoutBody'
export type { PageLayoutHeaderProps } from './PageLayoutHeader'

export const PageLayout = Object.assign(PageLayoutRoot, {
  Header: PageLayoutHeader,
  Body: PageLayoutBody,
})
