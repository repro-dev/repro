import React, {
  PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react'

export type PlaybackHudAction =
  | 'play'
  | 'pause'
  | 'seek-backward'
  | 'seek-forward'
  | 'seek-to-start'
  | 'seek-to-end'
  | 'speed-up'
  | 'speed-down'

export interface PlaybackHudMeta {
  speed?: number
}

export interface PlaybackHudOverlayItem {
  id: string
  action: PlaybackHudAction
  meta?: PlaybackHudMeta
}

interface PlaybackHudDispatchContextValue {
  showHud: (action: PlaybackHudAction, meta?: PlaybackHudMeta) => void
  dismissHud: (id: string) => void
}

interface PlaybackHudStateContextValue {
  overlays: Array<PlaybackHudOverlayItem>
}

const PlaybackHudDispatchContext =
  React.createContext<PlaybackHudDispatchContextValue>({
    showHud: () => {},
    dismissHud: () => {},
  })

const PlaybackHudStateContext =
  React.createContext<PlaybackHudStateContextValue>({
    overlays: [],
  })

export const PlaybackHudProvider: React.FC<PropsWithChildren> = ({
  children,
}) => {
  const [overlays, setOverlays] = useState<Array<PlaybackHudOverlayItem>>([])
  const idRef = useRef(0)

  const showHud = useCallback(
    (action: PlaybackHudAction, meta?: PlaybackHudMeta) => {
      setOverlays(current => {
        const next = current.filter(item => item.action !== action)
        const id = String(idRef.current++)
        return [...next, { id, action, meta }]
      })
    },
    []
  )

  const dismissHud = useCallback((id: string) => {
    setOverlays(current => current.filter(item => item.id !== id))
  }, [])

  const dispatchValue = useMemo(
    () => ({ showHud, dismissHud }),
    [showHud, dismissHud]
  )

  const stateValue = useMemo(() => ({ overlays }), [overlays])

  return (
    <PlaybackHudDispatchContext.Provider value={dispatchValue}>
      <PlaybackHudStateContext.Provider value={stateValue}>
        {children}
      </PlaybackHudStateContext.Provider>
    </PlaybackHudDispatchContext.Provider>
  )
}

export function usePlaybackHud() {
  return useContext(PlaybackHudDispatchContext)
}

export function usePlaybackHudOverlays() {
  return useContext(PlaybackHudStateContext).overlays
}
