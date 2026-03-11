import { DropdownMenu as DropdownMenuRoot } from './DropdownMenu'
import { DropdownMenuContent } from './DropdownMenuContent'
import { DropdownMenuItem } from './DropdownMenuItem'
import { DropdownMenuSeparator } from './DropdownMenuSeparator'
import { DropdownMenuTrigger } from './DropdownMenuTrigger'

export type { DropdownMenuProps } from './DropdownMenu'
export type { DropdownMenuContentProps } from './DropdownMenuContent'
export type { DropdownMenuItemProps } from './DropdownMenuItem'
export type { DropdownMenuTriggerProps } from './DropdownMenuTrigger'

export const DropdownMenu = Object.assign(DropdownMenuRoot, {
  Trigger: DropdownMenuTrigger,
  Content: DropdownMenuContent,
  Item: DropdownMenuItem,
  Separator: DropdownMenuSeparator,
})
