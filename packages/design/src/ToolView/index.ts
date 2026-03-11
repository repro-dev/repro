import { ToolView as ToolViewRoot } from './ToolView'
import { ToolViewContent } from './ToolViewContent'
import { ToolViewHeader } from './ToolViewHeader'

export type { ToolViewProps } from './ToolView'
export type { ToolViewContentProps } from './ToolViewContent'
export type { ToolViewHeaderProps } from './ToolViewHeader'

export const ToolView = Object.assign(ToolViewRoot, {
  Header: ToolViewHeader,
  Content: ToolViewContent,
})
