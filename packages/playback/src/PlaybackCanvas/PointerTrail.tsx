import { colors } from '@repro/design'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  useLatestControlFrame,
  usePlayback,
  usePlaybackState,
  useSnapshot,
  useViewport,
} from '../hooks'
import { ControlFrame, PlaybackState } from '../types'

export interface TrailPosition {
  x: number
  y: number
  time: number
}

interface PointerTrailProps {
  trailDuration?: number
  trailColor?: string
  trailWidth?: number
}

export function usePointerTrail(trailDuration: number): TrailPosition[] {
  const snapshot = useSnapshot()
  const playback = usePlayback()
  const controlFrame = useLatestControlFrame()

  const [trail, setTrail] = useState<Array<TrailPosition>>([])
  const isSeekingRef = useRef(false)

  useEffect(() => {
    if (controlFrame !== ControlFrame.Idle) {
      setTrail([])
      isSeekingRef.current = true
    }
  }, [controlFrame])

  useEffect(() => {
    const pointer = snapshot.interaction?.pointer
    if (!pointer) {
      return
    }

    if (isSeekingRef.current) {
      isSeekingRef.current = false
      return
    }

    const [x, y] = pointer

    setTrail(current => {
      if (current.length > 0) {
        const last = current[current.length - 1]
        if (last && last.x === x && last.y === y) {
          return current
        }
      }

      const elapsed = playback.getElapsed()

      const updated = [...current, { x, y, time: elapsed }]

      const cutoff = elapsed - trailDuration
      while (updated.length > 0 && updated[0]!.time < cutoff) {
        updated.shift()
      }

      return updated
    })
  }, [snapshot, playback, trailDuration])

  return trail
}

const catmullRomControlPoints = (
  positions: Array<TrailPosition>,
  tension: number,
  i: number
) => {
  const p0 = positions[i - 2] ?? positions[0]!
  const p1 = positions[i - 1]!
  const p2 = positions[i]!
  const p3 = positions[i + 1] ?? positions[positions.length - 1]!

  return {
    cp1: {
      x: p1.x + ((p2.x - p0.x) * tension) / 6,
      y: p1.y + ((p2.y - p0.y) * tension) / 6,
    },
    cp2: {
      x: p2.x - ((p3.x - p1.x) * tension) / 6,
      y: p2.y - ((p3.y - p1.y) * tension) / 6,
    },
    p1,
    p2,
  }
}

export const PointerTrail: React.FC<PointerTrailProps> = ({
  trailDuration = 200,
  trailColor = colors.pink['400'],
  trailWidth = 2,
}) => {
  const trailRef = useRef<Array<TrailPosition>>([])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  const trail = usePointerTrail(trailDuration)
  const viewport = useViewport()
  const playback = usePlayback()
  const playbackState = usePlaybackState()
  const [vWidth, vHeight] = viewport

  trailRef.current = trail

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    canvas.width = vWidth
    canvas.height = vHeight
  }, [vWidth, vHeight])

  const drawTrailPath = useCallback(
    (ctx: CanvasRenderingContext2D, positions: Array<TrailPosition>) => {
      const n = positions.length
      if (n < 2) return

      const tension = 0.7

      const {
        cp1: firstCp1,
        cp2: firstCp2,
        p1: firstP1,
        p2: firstP2,
      } = catmullRomControlPoints(positions, tension, 1)

      ctx.beginPath()
      ctx.moveTo(firstP1.x, firstP1.y)
      ctx.bezierCurveTo(
        firstCp1.x,
        firstCp1.y,
        firstCp2.x,
        firstCp2.y,
        firstP2.x,
        firstP2.y
      )

      for (let i = 2; i < n; i++) {
        const { cp1, cp2, p2 } = catmullRomControlPoints(positions, tension, i)
        ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, p2.x, p2.y)
      }
    },
    []
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return
    }

    const render = () => {
      const positions = trailRef.current

      if (playbackState === PlaybackState.Paused) {
        trailRef.current = []
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        rafRef.current = requestAnimationFrame(render)
        return
      }

      const elapsed = playback.getElapsed()

      const cutoff = elapsed - trailDuration
      while (positions.length > 0 && positions[0]!.time < cutoff) {
        positions.shift()
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      if (positions.length < 2) {
        rafRef.current = requestAnimationFrame(render)
        return
      }

      ctx.strokeStyle = trailColor
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      ctx.globalAlpha = 0.15
      ctx.lineWidth = trailWidth * 4
      drawTrailPath(ctx, positions)
      ctx.stroke()

      ctx.globalAlpha = 0.85
      ctx.lineWidth = trailWidth
      drawTrailPath(ctx, positions)
      ctx.stroke()

      ctx.globalAlpha = 1

      rafRef.current = requestAnimationFrame(render)
    }

    rafRef.current = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(rafRef.current)
    }
  }, [
    trailColor,
    trailWidth,
    playback,
    trailDuration,
    playbackState,
    drawTrailPath,
  ])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    />
  )
}
