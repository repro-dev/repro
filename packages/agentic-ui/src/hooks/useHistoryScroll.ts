import { Entry, Loading } from '@repro/agentic'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { SCROLL_OFFSET_THRESHOLD_PX } from '../constants'

interface UseHistoryScrollReturn {
  scrollContainerRef: React.RefObject<HTMLDivElement>
  contentContainerRef: React.RefObject<HTMLDivElement>
  shouldShowJumpToEndAction: boolean
  handleJumpToEnd: () => void
}

export function useHistoryScroll(
  loading: Loading,
  entries: Array<Entry>
): UseHistoryScrollReturn {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const contentContainerRef = useRef<HTMLDivElement>(null)
  const [shouldShowJumpToEndAction, setShouldShowJumpToEndAction] =
    useState(false)
  // Starts as true: no content yet, treat as at bottom so first streamed
  // content triggers auto-scroll.
  const isNearBottomRef = useRef(true)
  function handleJumpToEnd() {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
      })
    }
  }

  // Set up scroll listener and ResizeObserver once on mount. The observer
  // handles the container-shrink case: when the input transitions back into
  // view after loading finishes, clientHeight contracts over ~250ms and we
  // need to keep the scroll position pinned to the bottom.
  useLayoutEffect(() => {
    const scrollContainer = scrollContainerRef.current
    const contentContainer = contentContainerRef.current

    if (!scrollContainer || !contentContainer) {
      return () => {}
    }

    const checkHistoryScrollPosition = () => {
      const isAtBottom =
        scrollContainer.scrollHeight -
          scrollContainer.scrollTop -
          scrollContainer.clientHeight <
        SCROLL_OFFSET_THRESHOLD_PX
      // Keep ref in sync so other effects can read it without state lag.
      isNearBottomRef.current = isAtBottom
      setShouldShowJumpToEndAction(!isAtBottom)
      // Re-pin during the input-container transition back into view. This
      // callback is also registered as a ResizeObserver on the scroll
      // container, so it fires during the ~250ms clientHeight shrink caused
      // by the input section sliding back in — no need to re-pin inside the
      // scroll listener (which would fire on user-initiated scrolls too).
    }

    const resizeObserver = new ResizeObserver(checkHistoryScrollPosition)
    // Observe the scroll container so we react to clientHeight changes during
    // the ~250ms input-section slide-in transition after loading finishes.
    resizeObserver.observe(scrollContainer)

    scrollContainer.addEventListener('scroll', checkHistoryScrollPosition, {
      passive: true,
    })

    return () => {
      resizeObserver.disconnect()
      scrollContainer.removeEventListener('scroll', checkHistoryScrollPosition)
    }
  }, [])

  // Scroll to bottom whenever new content arrives during streaming. This fires
  // on every re-render driven by a new chunk, which is more reliable than a
  // ResizeObserver on the content element (which only fires at line-wrap
  // boundaries, not on every token). Suppressed if the user has scrolled up
  // past the threshold.
  useEffect(() => {
    if (
      loading !== 'none' &&
      isNearBottomRef.current &&
      scrollContainerRef.current
    ) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
      })
    }
  }, [entries, loading])

  // When streaming ends, scroll to bottom once so the final message fragment
  // is fully visible — but only if the user is still near the bottom. If they
  // scrolled up during streaming, respect their scroll intent and do not snap.
  useEffect(() => {
    if (
      loading === 'none' &&
      isNearBottomRef.current &&
      scrollContainerRef.current
    ) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
      })
    }
  }, [loading])

  return {
    scrollContainerRef,
    contentContainerRef,
    shouldShowJumpToEndAction,
    handleJumpToEnd,
  }
}
