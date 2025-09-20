import { Block } from '@jsxstyle/react'
import { colors } from '@repro/design'
import { Point } from '@repro/domain'
import React, {
  MutableRefObject,
  PropsWithChildren,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useViewport } from '../hooks'

export const ScaleToFitViewport: React.FC<PropsWithChildren> = ({
  children,
}) => {
  const [vWidth, vHeight] = useViewport()

  const ref = useRef() as MutableRefObject<HTMLDivElement>
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState<Point>([0, 0])

  const onScale = useCallback(
    (width: number, height: number) => {
      const widthScale = width / vWidth
      const heightScale = height / vHeight
      setScale(Math.min(1, widthScale, heightScale))

      const x = (width - vWidth) / 2
      const y = (height - vHeight) / 2
      setOffset([x, y])
    },
    [vWidth, vHeight, setScale, setOffset]
  )

  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      let width: number | null = null
      let height: number | null = null

      for (const entry of entries) {
        const rect = entry.contentRect
        width = rect.width
        height = rect.height
      }

      if (width !== null && height !== null) {
        onScale(width, height)
      }
    })

    if (ref.current) {
      const { width, height } = ref.current.getBoundingClientRect()
      onScale(width, height)
      observer.observe(ref.current)
    }

    return () => {
      observer.disconnect()
    }
  }, [ref, onScale])

  return (
    <Block position="relative" height="100%" props={{ ref }}>
      <Block
        transformOrigin="center"
        background={colors.white}
        props={{
          style: {
            transform: `translate(${offset[0]}px, ${offset[1]}px) scale(${scale})`,
            width: `${vWidth}px`,
            height: `${vHeight}px`,
          },
        }}
      >
        {children}
      </Block>
    </Block>
  )
}
