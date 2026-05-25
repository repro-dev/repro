import { Popover as PopoverRoot } from './Popover'
import { PopoverArrow } from './PopoverArrow'
import { PopoverContent } from './PopoverContent'
import { PopoverTrigger } from './PopoverTrigger'

export type { PopoverProps } from './Popover'
export type { PopoverArrowProps } from './PopoverArrow'
export type { PopoverContentProps } from './PopoverContent'
export type { PopoverTriggerProps } from './PopoverTrigger'

export { PopoverArrow } from './PopoverArrow'
export { PopoverContent } from './PopoverContent'
export { PopoverTrigger } from './PopoverTrigger'

export const Popover = Object.assign(PopoverRoot, {
  Trigger: PopoverTrigger,
  Content: PopoverContent,
  Arrow: PopoverArrow,
})
