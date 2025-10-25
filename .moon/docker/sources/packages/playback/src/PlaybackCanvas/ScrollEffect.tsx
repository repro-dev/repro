import { Point } from '@repro/domain'
import React, {
  MutableRefObject,
  PropsWithChildren,
  useEffect,
  useRef,
} from 'react'
import { usePlaybackState } from '../hooks'
import { PlaybackState } from '../types'

type Props = PropsWithChildren<{
  state: Point | null
  elementRef?: HTMLElement | null
}>

export const ScrollEffect: React.FC<Props> = ({
  children,
  elementRef,
  state,
}) => {
  const ref = useRef() as MutableRefObject<HTMLElement>
  const playbackState = usePlaybackState()

  useEffect(() => {
    const target = elementRef || ref.current

    if (target && state) {
      target.scrollTo({
        left: state[0],
        top: state[1],
        behavior: playbackState === PlaybackState.Playing ? 'smooth' : 'auto',
      })
    }
  }, [elementRef, ref, state, playbackState])

  if (elementRef) {
    return <React.Fragment>{children}</React.Fragment>
  }

  const child = React.Children.only(children)

  return (
    <React.Fragment>
      {React.isValidElement(child) && React.cloneElement(child, { ref })}
    </React.Fragment>
  )
}
