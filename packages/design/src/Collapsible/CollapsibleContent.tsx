import { Block } from '@jsxstyle/react'
import React, { PropsWithChildren, useEffect, useMemo, useState } from 'react'
import { color } from '../tokens/colors'
import { duration, easing } from '../tokens/motion'
import { spacing } from '../tokens/spacing'
import { textStyles } from '../tokens/typography'
import { useCollapsibleContext } from './CollapsibleContext'

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export interface CollapsibleContentProps {
  children: React.ReactNode
}

export function CollapsibleContent({
  children,
}: PropsWithChildren<CollapsibleContentProps>) {
  const { open, triggerId, contentId } = useCollapsibleContext()
  const reducedMotion = useMemo(prefersReducedMotion, [])
  const [isMounted, setIsMounted] = useState(open)

  useEffect(() => {
    if (open) {
      setIsMounted(true)
      return
    }

    if (reducedMotion) {
      setIsMounted(false)
    }
  }, [open, reducedMotion])

  if (!isMounted) {
    return null
  }

  return (
    <Block
      display="grid"
      gridTemplateRows={open ? '1fr' : '0fr'}
      opacity={open ? 1 : 0}
      overflow="hidden"
      transition={
        reducedMotion
          ? undefined
          : `grid-template-rows ${duration[200]} ${easing.easeOut}, opacity ${duration[200]} ${easing.easeOut}`
      }
      props={{
        role: 'region',
        id: contentId,
        'aria-labelledby': triggerId,
        'aria-hidden': !open,
        onTransitionEnd: evt => {
          if (evt.target !== evt.currentTarget) {
            return
          }
          if (!open) {
            setIsMounted(false)
          }
        },
      }}
    >
      <Block
        paddingTop={spacing.sm}
        {...textStyles.body}
        color={color.text.default}
      >
        {children}
      </Block>
    </Block>
  )
}

CollapsibleContent.displayName = 'CollapsibleContent'
