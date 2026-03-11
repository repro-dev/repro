import { EmptyState as EmptyStateRoot } from './EmptyState'
import { EmptyStateAction } from './EmptyStateAction'
import { EmptyStateDescription } from './EmptyStateDescription'
import { EmptyStateIcon } from './EmptyStateIcon'
import { EmptyStateTitle } from './EmptyStateTitle'

export type { EmptyStateProps } from './EmptyState'
export type { EmptyStateActionProps } from './EmptyStateAction'
export type { EmptyStateDescriptionProps } from './EmptyStateDescription'
export type { EmptyStateIconProps } from './EmptyStateIcon'
export type { EmptyStateTitleProps } from './EmptyStateTitle'

export const EmptyState = Object.assign(EmptyStateRoot, {
  Icon: EmptyStateIcon,
  Title: EmptyStateTitle,
  Description: EmptyStateDescription,
  Action: EmptyStateAction,
})
