import { InlineBlock } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import mergeRefs from 'react-merge-refs'
import { Button } from '../Button'
import { usePopoverContext } from './PopoverContext'

export interface PopoverTriggerProps
  extends React.ComponentPropsWithoutRef<'div'> {
  children: React.ReactNode
}

/**
 * Trigger element that opens the popover on click.
 *
 * Clones the focusable trigger child so the floating-ui reference ref and
 * ARIA state land on the actual control instead of an unfocusable wrapper.
 */
export const PopoverTrigger = forwardRef<HTMLElement, PopoverTriggerProps>(
  ({ children, ...triggerProps }, ref) => {
    const { refs, getReferenceProps, open } = usePopoverContext()

    if (React.isValidElement(children)) {
      const triggerChild = children as React.ReactElement<
        React.HTMLAttributes<HTMLElement> & {
          'aria-haspopup'?: React.AriaAttributes['aria-haspopup']
          'aria-expanded'?: boolean
          ref?: React.Ref<HTMLElement>
          props?: Record<string, unknown>
        }
      >
      const childProps = triggerChild.props
      const childRef = (
        triggerChild as unknown as {
          ref?: React.Ref<HTMLElement>
        }
      ).ref
      const mergedRef = mergeRefs(
        [ref, refs.setReference, childRef].filter(
          Boolean
        ) as React.Ref<HTMLElement>[]
      )

      const referenceProps = getReferenceProps({
        ...triggerProps,
        'aria-haspopup':
          triggerProps['aria-haspopup'] ??
          childProps['aria-haspopup'] ??
          'menu',
        'aria-expanded': open,
      })

      const isButtonTrigger =
        triggerChild.type === Button ||
        (typeof triggerChild.type !== 'string' &&
          (triggerChild.type as { displayName?: string }).displayName ===
            Button.displayName)

      if (isButtonTrigger) {
        return React.cloneElement(triggerChild, {
          props: {
            ...childProps.props,
            ...referenceProps,
          },
          ref: mergedRef,
        })
      }

      return React.cloneElement(triggerChild, {
        ...referenceProps,
        ref: mergedRef,
      })
    }

    const referenceProps = getReferenceProps({
      'aria-haspopup': triggerProps['aria-haspopup'] ?? 'menu',
      'aria-expanded': open,
      ...triggerProps,
    })

    return (
      <InlineBlock
        props={{
          ref: mergeRefs([ref, refs.setReference]),
          ...referenceProps,
        }}
      >
        {children}
      </InlineBlock>
    )
  }
)

PopoverTrigger.displayName = 'PopoverTrigger'
