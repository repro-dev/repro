import { Collapsible as CollapsibleRoot } from './Collapsible'
import { CollapsibleContent } from './CollapsibleContent'
import { CollapsibleTrigger } from './CollapsibleTrigger'

export type { CollapsibleProps } from './Collapsible'
export type { CollapsibleContentProps } from './CollapsibleContent'
export type { CollapsibleTriggerProps } from './CollapsibleTrigger'

export const Collapsible = Object.assign(CollapsibleRoot, {
  Trigger: CollapsibleTrigger,
  Content: CollapsibleContent,
})
