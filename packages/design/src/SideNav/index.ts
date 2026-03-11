import { SideNav as SideNavRoot } from './SideNav'
import { SideNavItem } from './SideNavItem'
import { SideNavSection } from './SideNavSection'

export type { SideNavProps } from './SideNav'
export type { SideNavItemProps } from './SideNavItem'
export type { SideNavSectionProps } from './SideNavSection'

export const SideNav = Object.assign(SideNavRoot, {
  Section: SideNavSection,
  Item: SideNavItem,
})
