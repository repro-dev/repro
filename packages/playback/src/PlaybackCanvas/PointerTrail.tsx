import { colors } from '@repro/design'
import React, { useEffect, useRef } from 'react'
import {
  useLatestControlFrame,
  usePlayback,
  useSnapshot,
  useViewport,
} from '../hooks'
import { ControlFrame } from '../types'

interface TrailPosition {
  x: number
  y: number
  time: number
}

interface PointerTrailProps {
  trailDuration?: number
  trailColor?: string
  trailWidth?: number
}

export const PointerTrail: React.FC<PointerTrailProps> = ({
  trailDuration = 200,
  trailColor = colors.pink['400'],
  trailWidth = 2,
}) => {
  const trailRef = useRef<Array<TrailPosition>>([])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  const snapshot = useSnapshot()
  const playback = usePlayback()
  const controlFrame = useLatestControlFrame()
  const viewport = useViewport()
  const [vWidth, vHeight] = viewport

  // Clear trail on seek
  useEffect(() => {
    if (controlFrame !== ControlFrame.Idle) {
      trailRef.current = []
    }
  }, [controlFrame])

  // Track pointer position changes
  useEffect(() => {
    const pointer = snapshot.interaction?.pointer
    if (!pointer) {
      return
    }

    const trail = trailRef.current
    const [x, y] = pointer

    // Don't add duplicate positions
    if (trail.length > 0) {
      const last = trail[trail.length - 1]
      if (last && last.x === x && last.y === y) {
        return
      }
    }

    const elapsed = playback.getElapsed()
    trail.push({ x, y, time: elapsed })

    // Trim positions beyond trailDuration
    const cutoff = elapsed - trailDuration
    while (trail.length > 0 && trail[0]!.time < cutoff) {
      trail.shift()
    }
  }, [snapshot, playback, trailDuration])

  // Update canvas dimensions when viewport changes
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    canvas.width = vWidth
    canvas.height = vHeight
  }, [vWidth, vHeight])

  // Render loop
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
      const elapsed = playback.getElapsed()

      // Trim old positions continuously (handles paused playback)
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
      ctx.lineWidth = trailWidth
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      // Draw Catmull-Rom to cubic Bezier segments with fading opacity
      const n = positions.length
      const tension = 0.5

      for (let i = 1; i < n; i++) {
        // Fading: oldest segment has alpha ≈ 0, newest has alpha = 1
        ctx.globalAlpha = i / (n - 1)

        // Catmull-Rom to cubic Bezier control points
        const p0 = positions[i - 2] ?? positions[0]!
        const p1 = positions[i - 1]!
        const p2 = positions[i]!
        const p3 = positions[i + 1] ?? positions[n - 1]!

        const cp1 = {
          x: p1.x + ((p2.x - p0.x) * tension) / 6,
          y: p1.y + ((p2.y - p0.y) * tension) / 6,
        }

        const cp2 = {
          x: p2.x - ((p3.x - p1.x) * tension) / 6,
          y: p2.y - ((p3.y - p1.y) * tension) / 6,
        }

        ctx.beginPath()
        ctx.moveTo(p1.x, p1.y)
        ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, p2.x, p2.y)
        ctx.stroke()
      }

      ctx.globalAlpha = 1

      rafRef.current = requestAnimationFrame(render)
    }

    rafRef.current = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(rafRef.current)
    }
  }, [trailColor, trailWidth, playback, trailDuration])

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
