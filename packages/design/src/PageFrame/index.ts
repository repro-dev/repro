import { PageFrameActions } from './PageFrameActions'
import { PageFrameBody } from './PageFrameBody'
import { PageFrame as PageFrameRoot } from './PageFrame'
import { PageFrameHeader } from './PageFrameHeader'
import { PageFrameTitle } from './PageFrameTitle'

export type { PageFrameProps } from './PageFrame'
export type { PageFrameActionsProps } from './PageFrameActions'
export type { PageFrameBodyProps } from './PageFrameBody'
export type { PageFrameHeaderProps } from './PageFrameHeader'
export type { PageFrameTitleProps } from './PageFrameTitle'

export const PageFrame = Object.assign(PageFrameRoot, {
  Header: PageFrameHeader,
  Title: PageFrameTitle,
  Actions: PageFrameActions,
  Body: PageFrameBody,
})
