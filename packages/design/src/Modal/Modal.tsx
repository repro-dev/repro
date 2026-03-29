import { Block, Row } from '@jsxstyle/react'
import { useFocusTrap } from '@repro/a11y'
import React, {
  PropsWithChildren,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { color } from '../tokens/colors'
import { shadow } from '../tokens/elevation'
import { duration, easing } from '../tokens/motion'

// ---------------------------------------------------------------------------
// CSS keyframes — injected once into the document head on first render.
// Named constants are referenced by the animation strings below.
// ---------------------------------------------------------------------------

const KEYFRAMES = `
@keyframes modal-backdrop-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes modal-backdrop-out {
  from { opacity: 1; }
  to   { opacity: 0; }
}
@keyframes modal-panel-in {
  from { opacity: 0; transform: scale(0.95); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes modal-panel-out {
  from { opacity: 1; transform: scale(1); }
  to   { opacity: 0; transform: scale(0.95); }
}
`

/**
 * Inject the modal animation keyframes into `<head>` exactly once.
 * Idempotent — safe to call on every render.
 */
function injectKeyframes(): void {
  if (
    typeof document === 'undefined' ||
    document.getElementById('repro-modal-keyframes')
  ) {
    return
  }

  const style = document.createElement('style')
  style.id = 'repro-modal-keyframes'
  style.textContent = KEYFRAMES
  document.head.appendChild(style)
}

// ---------------------------------------------------------------------------
// Animation phase type
// ---------------------------------------------------------------------------

type AnimationPhase = 'entering' | 'visible' | 'exiting'

// ---------------------------------------------------------------------------
// useModalAnimation hook
// ---------------------------------------------------------------------------

/**
 * Manages the mount/unmount lifecycle for animated modals.
 *
 * Returns:
 *  - `isMounted`: whether the modal DOM should be present
 *  - `phase`: current animation phase ('entering' | 'visible' | 'exiting')
 *  - `handleAnimationEnd`: call on the outermost animated element's animationend
 */
function useModalAnimation(open: boolean): {
  isMounted: boolean
  phase: AnimationPhase
  handleAnimationEnd: () => void
} {
  const [isMounted, setIsMounted] = useState(open)
  const [phase, setPhase] = useState<AnimationPhase>(
    open ? 'entering' : 'visible'
  )

  // Capture prefers-reduced-motion on first render (SSR-safe).
  // matchMedia may be absent in test environments (jsdom), so guard it.
  const prefersReducedMotion =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false

  // Use a ref to always access the latest phase inside the callback without
  // rebuilding the memoised function.
  const phaseRef = useRef(phase)
  useEffect(() => {
    phaseRef.current = phase
  })

  useEffect(() => {
    if (open) {
      setIsMounted(true)
      setPhase('entering')
    } else {
      if (prefersReducedMotion) {
        // Skip animation entirely — unmount immediately.
        setIsMounted(false)
      } else {
        setPhase('exiting')
        // isMounted is set to false via the animationend handler below.
      }
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps — prefersReducedMotion is stable

  const handleAnimationEnd = useCallback(() => {
    const current = phaseRef.current
    if (current === 'exiting') {
      setIsMounted(false)
    } else if (current === 'entering') {
      // Transition to 'visible' so the animation string is cleared and won't
      // replay on subsequent re-renders.
      setPhase('visible')
    }
  }, [])

  return { isMounted, phase, handleAnimationEnd }
}

// ---------------------------------------------------------------------------
// Animation string helpers
// ---------------------------------------------------------------------------

const ANIM_DURATION = duration[200]
const ANIM_EASING = easing.easeOut

function backdropAnimation(phase: AnimationPhase): string | undefined {
  if (phase === 'entering') {
    return `modal-backdrop-in ${ANIM_DURATION} ${ANIM_EASING} forwards`
  }
  if (phase === 'exiting') {
    return `modal-backdrop-out ${ANIM_DURATION} ${ANIM_EASING} forwards`
  }
  return undefined
}

function panelAnimation(phase: AnimationPhase): string | undefined {
  if (phase === 'entering') {
    return `modal-panel-in ${ANIM_DURATION} ${ANIM_EASING} forwards`
  }
  if (phase === 'exiting') {
    return `modal-panel-out ${ANIM_DURATION} ${ANIM_EASING} forwards`
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = PropsWithChildren<{
  width: string | number
  height: string | number
  minWidth?: string | number
  minHeight?: string | number
  /**
   * Controls whether the modal is visible. Defaults to `true` for backward
   * compatibility. When changed from `true` to `false`, the modal plays an
   * exit animation before unmounting.
   */
  open?: boolean
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

// ---------------------------------------------------------------------------
// Modal component
// ---------------------------------------------------------------------------

/**
 * Centered modal dialog with a dark backdrop overlay.
 *
 * Use for focused tasks that block interaction with the page behind.
 * Traps focus while open and closes on Escape or backdrop click when
 * `onClose` is provided. Renders inline (not into a Portal, unlike Drawer).
 * Requires explicit `width` and `height` props.
 *
 * Pass `open` to control visibility with enter/exit animations. The component
 * stays mounted until the exit animation completes, then unmounts itself.
 */
export const Modal: React.FC<Props> = ({
  children,
  width,
  height,
  minWidth,
  minHeight,
  open = true,
  onClose,
  'aria-label': ariaLabel,
  labelId,
}) => {
  injectKeyframes()

  const { isMounted, phase, handleAnimationEnd } = useModalAnimation(open)

  const containerRef = useFocusTrap<HTMLDivElement>(isMounted)

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
    if (!isMounted) return
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [handleEscape, isMounted])

  if (!isMounted) {
    return null
  }

  const backdropAnim = backdropAnimation(phase)
  const panelAnim = panelAnimation(phase)

  return (
    <Backdrop
      onClose={onClose}
      animationStyle={backdropAnim}
      onAnimationEnd={handleAnimationEnd}
    >
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
          style: panelAnim ? { animation: panelAnim } : undefined,
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

// ---------------------------------------------------------------------------
// Backdrop component
// ---------------------------------------------------------------------------

interface BackdropProps {
  onClose?: () => void
  animationStyle?: string
  onAnimationEnd?: () => void
}

const Backdrop: React.FC<PropsWithChildren<BackdropProps>> = ({
  children,
  onClose,
  animationStyle,
  onAnimationEnd,
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
      props={{
        ...({
          'data-testid': 'modal-backdrop',
        } as React.HTMLAttributes<HTMLDivElement>),
        onClick: handleBackdropClick,
        onAnimationEnd: onAnimationEnd,
        style: animationStyle ? { animation: animationStyle } : undefined,
      }}
    >
      {children}
    </Row>
  )
}
