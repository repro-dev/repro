import { Breadcrumbs as BreadcrumbsRoot } from './Breadcrumbs'
import { BreadcrumbsItem } from './BreadcrumbsItem'

export type { BreadcrumbsProps } from './Breadcrumbs'
export type { BreadcrumbsItemProps } from './BreadcrumbsItem'

export const Breadcrumbs = Object.assign(BreadcrumbsRoot, {
  Item: BreadcrumbsItem,
})
