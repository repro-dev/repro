import { Block, Row } from '@jsxstyle/react'
import React, { PropsWithChildren, useCallback, useEffect } from 'react'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { color } from '../tokens/colors'
import { shadow } from '../tokens/elevation'

type Props = PropsWithChildren<{
  width: string | number
  height: string | number
  minWidth?: string | number
  minHeight?: string | number
  /**
   * Called when the user requests the modal to close (e.g. Escape key or
   * clicking the backdrop). If not provided, the modal cannot be closed via
   * keyboard or backdrop click.
   */
  onClose?: () => void
  /**
   * Accessible label for the modal dialog. Either `aria-label` or
   * `aria-labelledby` (via `labelId`) should be provided.
   * Prefer `labelId` when the modal has a visible title.
   */
  'aria-label'?: string
  /**
   * The `id` of the element that labels this modal (e.g. a heading inside the
   * modal). Used to set `aria-labelledby` on the dialog element.
   */
  labelId?: string
}>

/**
 * Centered modal dialog with a dark backdrop overlay.
 *
 * Use for focused tasks that block interaction with the page behind.
 * Traps focus while open and closes on Escape or backdrop click when
 * `onClose` is provided. Renders inline (not into a Portal, unlike Drawer).
 * Requires explicit `width` and `height` props.
 */
export const Modal: React.FC<Props> = ({
  children,
  width,
  height,
  minWidth,
  minHeight,
  onClose,
  'aria-label': ariaLabel,
  labelId,
}) => {
  const containerRef = useFocusTrap<HTMLDivElement>(true)

  const handleEscape = useCallback(
    (evt: KeyboardEvent) => {
      if (evt.key === 'Escape' && onClose) {
        evt.preventDefault()
        onClose()
      }
    },
    [onClose]
  )

  useEffect(() => {
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [handleEscape])

  return (
    <Backdrop onClose={onClose}>
      <Block
        position="relative"
        background={color.bg.surface}
        boxShadow={shadow.lg}
        minHeight={minHeight}
        minWidth={minWidth}
        height={height}
        width={width}
        overflow="hidden"
        props={{
          ref: containerRef,
          role: 'dialog',
          'aria-modal': 'true',
          ...(ariaLabel
            ? { 'aria-label': ariaLabel }
            : labelId
              ? { 'aria-labelledby': labelId }
              : {}),
        }}
      >
        {children}
      </Block>
    </Backdrop>
  )
}

interface BackdropProps {
  onClose?: () => void
}

const Backdrop: React.FC<PropsWithChildren<BackdropProps>> = ({
  children,
  onClose,
}) => {
  const handleBackdropClick = useCallback(
    (evt: React.MouseEvent<HTMLDivElement>) => {
      // Only close if the click was directly on the backdrop, not on the modal
      if (evt.target === evt.currentTarget && onClose) {
        onClose()
      }
    },
    [onClose]
  )

  return (
    <Row
      alignItems="center"
      justifyContent="center"
      background="rgba(0, 0, 0, 0.75)"
      position="fixed"
      top={0}
      left={0}
      bottom={0}
      right={0}
      props={{ onClick: handleBackdropClick }}
    >
      {children}
    </Row>
  )
}
