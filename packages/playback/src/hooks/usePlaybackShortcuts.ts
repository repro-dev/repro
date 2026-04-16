import {
  isInputElement,
  isSelectElement,
  isTextAreaElement,
} from '@repro/dom-utils'
import { useEffect } from 'react'
import { Shortcuts } from 'shortcuts'

type ShortcutEntry = { shortcut: string; handler: () => void }

function shouldHandleEvent() {
  let target = document.activeElement
  if (target?.shadowRoot) target = target.shadowRoot.activeElement
  if (target) {
    return (
      !isInputElement(target) &&
      !isTextAreaElement(target) &&
      !isSelectElement(target)
    )
  }
  return true
}

export function usePlaybackShortcuts(entries: ShortcutEntry[]) {
  useEffect(() => {
    const sc = new Shortcuts({ shouldHandleEvent })
    sc.add(entries)
    return () => {
      sc.reset()
    }
    // NOTE: entries must be a stable reference — wrap handlers in useCallback
    // and build the array with useMemo at call sites to avoid duplicate registrations.
  }, [entries])
}
