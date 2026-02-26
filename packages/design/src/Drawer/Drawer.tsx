import { Block, Row } from '@jsxstyle/react'
import { X as CloseIcon } from 'lucide-react'
import React, { PropsWithChildren, useCallback, useEffect } from 'react'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { Portal } from '../Portal'
import { focusRing } from '../tokens/interaction'
import { colors } from '../theme'

interface Props {
  open: boolean
  onClose(): void
  /**
   * Accessible label for the drawer dialog. Either `aria-label` or
   * `aria-labelledby` (via `labelId`) should be provided.
   * Prefer `labelId` when the drawer has a visible title.
   */
  'aria-label'?: string
  /**
   * The `id` of the element that labels this drawer (e.g. a heading inside).
   * Used to set `aria-labelledby` on the dialog element.
   */
  labelId?: string
}

/**
 * Slide-in side panel that opens from the right edge with a backdrop overlay.
 *
 * Use for secondary content or detail views that should not replace the
 * current page. Traps focus while open, closes on Escape and backdrop click,
 * and renders into a Portal.
 */
export const Drawer: React.FC<PropsWithChildren<Props>> = ({
  children,
  open,
  onClose,
  'aria-label': ariaLabel,
  labelId,
}) => {
  const containerRef = useFocusTrap<HTMLDivElement>(open)

  const handleEscape = useCallback(
    (evt: KeyboardEvent) => {
      if (open && evt.key === 'Escape') {
        evt.preventDefault()
        onClose()
      }
    },
    [open, onClose]
  )

  useEffect(() => {
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [handleEscape])

  return (
    <Portal>
      <Backdrop active={open} onClose={onClose}>
        <Block
          position="absolute"
          top={0}
          bottom={0}
          right={0}
          width="35vw"
          minWidth={480}
          padding={30}
          overflow="hidden"
          backgroundColor={colors.white}
          transform={open ? 'translateX(0)' : 'translateX(100%)'}
          transition={
            open
              ? 'transform 100ms ease-in-out 250ms'
              : 'transform 100ms ease-in-out'
          }
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
          <Row
            component="button"
            position="absolute"
            top={10}
            right={10}
            width={32}
            height={32}
            alignItems="center"
            justifyContent="center"
            background="none"
            border="none"
            hoverBackgroundColor={colors.slate['100']}
            borderRadius="99rem"
            cursor="pointer"
            props={{ type: 'button', 'aria-label': 'Close drawer', onClick: onClose }}
            {...focusRing()}
          >
            <CloseIcon size={16} />
          </Row>

          {open && children}
        </Block>
      </Backdrop>
    </Portal>
  )
}

interface BackdropProps {
  active: boolean
  onClose(): void
}

const Backdrop: React.FC<PropsWithChildren<BackdropProps>> = ({
  children,
  active,
  onClose,
}) => {
  const handleBackdropClick = useCallback(
    (evt: React.MouseEvent<HTMLDivElement>) => {
      if (evt.target === evt.currentTarget) {
        onClose()
      }
    },
    [onClose]
  )

  return (
    <Block
      background="rgba(0, 0, 0, 0.75)"
      position="fixed"
      top={0}
      left={0}
      bottom={0}
      right={0}
      opacity={active ? 1 : 0}
      pointerEvents={active ? 'all' : 'none'}
      transition={
        active ? 'opacity 250ms ease-in-out' : 'opacity 250ms ease-in-out 100ms'
      }
      props={{ onClick: handleBackdropClick }}
    >
      {children}
    </Block>
  )
}
