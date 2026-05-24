import type { PopoverContentProps } from './PopoverContent'

export const popoverContentAccessibleNameExamples = [
  {
    children: null,
    id: 'filters-popover',
    'aria-label': 'Filters',
  },
  {
    children: null,
    role: 'menu',
    'aria-labelledby': 'actions-heading',
  },
] satisfies PopoverContentProps[]

export const popoverContentRequiresAccessibleName =
  // @ts-expect-error PopoverContent defaults to role="dialog" and requires an accessible name.
  { children: null } satisfies PopoverContentProps
