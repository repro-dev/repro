import { Block } from '@jsxstyle/react'
import React, { useCallback, useEffect, useState } from 'react'
import { focusRing } from '../tokens/interaction'
import { colors } from '../theme'

interface Props {
  edge: 'top' | 'bottom' | 'left' | 'right'
  onDragStart(): void
  onDragEnd(): void
  onDrag(offset: number): void
  /** Accessible label describing what this handle resizes, e.g. "Resize panel" */
  'aria-label'?: string
}

const KEYBOARD_STEP = 10

/**
 * Draggable edge handle for resizing panels. Renders as an absolutely
 * positioned `role="separator"` on the specified `edge`.
 *
 * Supports pointer drag and keyboard resizing (arrow keys). Reports
 * offset deltas via `onDrag`; the parent is responsible for applying
 * the size change.
 */
export const DragHandle: React.FC<Props> = ({
  edge,
  onDrag,
  onDragEnd,
  onDragStart,
  'aria-label': ariaLabel = 'Resize',
}) => {
  const [dragging, setDragging] = useState(false)
  const [start, setStart] = useState<number | null>(null)

  const handleDown = (evt: React.PointerEvent<HTMLDivElement>) => {
    evt.preventDefault()
    setDragging(true)
    setStart(edge === 'top' || edge === 'bottom' ? evt.pageY : evt.pageX)
    onDragStart()
  }

  const handleUp = useCallback(
    (evt: PointerEvent) => {
      evt.preventDefault()
      setDragging(false)
      setStart(null)
      onDragEnd()
    },
    [setDragging, setStart, onDragEnd]
  )

  const handleMove = useCallback(
    (evt: PointerEvent) => {
      if (dragging && start !== null) {
        evt.preventDefault()

        const position =
          edge === 'top' || edge === 'bottom' ? evt.pageY : evt.pageX

        const offset =
          edge === 'top' || edge === 'left'
            ? start - position
            : position - start

        onDrag(offset)
      }
    },
    [dragging, edge, onDrag, start]
  )

  const handleKeyDown = useCallback(
    (evt: React.KeyboardEvent<HTMLDivElement>) => {
      const isVertical = edge === 'top' || edge === 'bottom'
      let delta = 0

      if (isVertical) {
        // For top edge: ArrowUp = expand (positive), ArrowDown = shrink (negative)
        // For bottom edge: ArrowDown = expand (positive), ArrowUp = shrink (negative)
        if (evt.key === 'ArrowUp') delta = edge === 'top' ? KEYBOARD_STEP : -KEYBOARD_STEP
        else if (evt.key === 'ArrowDown') delta = edge === 'bottom' ? KEYBOARD_STEP : -KEYBOARD_STEP
      } else {
        // For left edge: ArrowLeft = expand (positive), ArrowRight = shrink (negative)
        // For right edge: ArrowRight = expand (positive), ArrowLeft = shrink (negative)
        if (evt.key === 'ArrowLeft') delta = edge === 'left' ? KEYBOARD_STEP : -KEYBOARD_STEP
        else if (evt.key === 'ArrowRight') delta = edge === 'right' ? KEYBOARD_STEP : -KEYBOARD_STEP
      }

      if (delta !== 0) {
        evt.preventDefault()
        onDragStart()
        onDrag(delta)
        onDragEnd()
      }
    },
    [edge, onDrag, onDragStart, onDragEnd]
  )

  useEffect(() => {
    window.addEventListener('pointerup', handleUp)
    return () => window.removeEventListener('pointerup', handleUp)
  }, [handleUp])

  useEffect(() => {
    window.addEventListener('pointermove', handleMove)
    return () => window.removeEventListener('pointermove', handleMove)
  }, [handleMove])

  const positionStyles = {
    position: 'absolute',
    top: edge === 'bottom' ? 'auto' : 0,
    bottom: edge === 'top' ? 'auto' : 0,
    left: edge === 'right' ? 'auto' : 0,
    right: edge === 'left' ? 'auto' : 0,
  } as const

  const cursor = edge === 'top' || edge === 'bottom' ? 'ns-resize' : 'ew-resize'

  const borderWidth = [
    edge === 'top' ? '2px' : '0',
    edge === 'right' ? '2px' : '0',
    edge === 'bottom' ? '2px' : '0',
    edge === 'left' ? '2px' : '0',
  ].join(' ')

  const activeBorderWidth = [
    edge === 'top' ? '4px' : '0',
    edge === 'right' ? '4px' : '0',
    edge === 'bottom' ? '4px' : '0',
    edge === 'left' ? '4px' : '0',
  ].join(' ')

  const borderColor = colors.slate['200']
  const activeBorderColor = colors.blue['500']

  const sizeStyles = {
    height: edge === 'top' || edge === 'bottom' ? 4 : 'auto',
    width: edge === 'left' || edge === 'right' ? 4 : 'auto',
  }

  const isVertical = edge === 'top' || edge === 'bottom'

  return (
    <Block
      {...positionStyles}
      {...sizeStyles}
      borderWidth={dragging ? activeBorderWidth : borderWidth}
      hoverBorderWidth={activeBorderWidth}
      borderStyle="solid"
      borderColor={dragging ? activeBorderColor : borderColor}
      hoverBorderColor={activeBorderColor}
      boxSizing="border-box"
      cursor={cursor}
      transition="all linear 100ms"
      props={{
        role: 'separator',
        'aria-orientation': isVertical ? 'horizontal' : 'vertical',
        'aria-label': ariaLabel,
        tabIndex: 0,
        onPointerDown: handleDown,
        onKeyDown: handleKeyDown,
      }}
      {...focusRing()}
    />
  )
}
