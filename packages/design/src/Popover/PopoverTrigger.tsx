import { InlineBlock } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import mergeRefs from 'react-merge-refs'
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
      const { props: childPropsBagValue, ...childTopLevelProps } = childProps
      const childPropsBag =
        typeof childPropsBagValue === 'object' &&
        childPropsBagValue !== null &&
        !Array.isArray(childPropsBagValue)
          ? (childPropsBagValue as Record<string, unknown>)
          : undefined
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

      const childAriaHasPopup = childPropsBag?.['aria-haspopup'] as
        | React.AriaAttributes['aria-haspopup']
        | undefined
      const ariaHasPopup: React.AriaAttributes['aria-haspopup'] | undefined =
        triggerProps['aria-haspopup'] ??
        childTopLevelProps['aria-haspopup'] ??
        childAriaHasPopup

      const referenceProps = getReferenceProps({
        ...triggerProps,
        ...childTopLevelProps,
        ...childPropsBag,
        ...(ariaHasPopup != null ? { 'aria-haspopup': ariaHasPopup } : {}),
        'aria-expanded': open,
      })

      if (childPropsBag) {
        return React.cloneElement(triggerChild, {
          props: {
            ...childPropsBag,
            ...referenceProps,
            ref: mergedRef,
          },
        })
      }

      return React.cloneElement(triggerChild, {
        ...referenceProps,
        ref: mergedRef,
      })
    }

    const ariaHasPopup = triggerProps['aria-haspopup']
    const referenceProps = getReferenceProps({
      ...triggerProps,
      ...(ariaHasPopup != null ? { 'aria-haspopup': ariaHasPopup } : {}),
      'aria-expanded': open,
    })

    return (
      <InlineBlock
        props={{
          ...referenceProps,
          ref: mergeRefs([ref, refs.setReference]),
        }}
      >
        {children}
      </InlineBlock>
    )
  }
)

PopoverTrigger.displayName = 'PopoverTrigger'
