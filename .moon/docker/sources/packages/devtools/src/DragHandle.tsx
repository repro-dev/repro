import { DragHandle as BaseDragHandle } from '@repro/design'
import React, { useState } from 'react'
import { MAX_HEIGHT, MIN_HEIGHT } from './constants'
import { useMask, useSize } from './hooks'

export const DragHandle: React.FC = () => {
  const [, setMask] = useMask()
  const [size, setSize] = useSize()
  const [initialSize, setInitialSize] = useState(size)

  const handleDrag = (offset: number) => {
    setSize(Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, initialSize + offset)))
  }

  const handleDragStart = () => {
    setInitialSize(size)
    setMask(true)
  }

  const handleDragEnd = () => {
    setInitialSize(size)
    setMask(false)
    // TODO: persist size to extension storage
  }

  return (
    <BaseDragHandle
      edge="top"
      onDrag={handleDrag}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    />
  )
}
