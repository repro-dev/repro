import { Accordion as AccordionRoot } from './Accordion'
import { AccordionContent } from './AccordionContent'
import { AccordionItem } from './AccordionItem'
import { AccordionTrigger } from './AccordionTrigger'

export type { AccordionProps } from './Accordion'
export type { AccordionContentProps } from './AccordionContent'
export type { AccordionMode, AccordionValue } from './AccordionContext'
export type { AccordionItemProps } from './AccordionItem'
export type { AccordionTriggerProps } from './AccordionTrigger'

export const Accordion = Object.assign(AccordionRoot, {
  Item: AccordionItem,
  Trigger: AccordionTrigger,
  Content: AccordionContent,
})

export { AccordionContent, AccordionItem, AccordionTrigger }
