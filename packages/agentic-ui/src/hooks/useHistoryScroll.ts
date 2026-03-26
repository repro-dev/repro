import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Loading } from "@repro/agentic";
import { SCROLL_OFFSET_THRESHOLD_PX } from "../constants";

interface UseHistoryScrollReturn {
  scrollContainerRef: React.RefObject<HTMLDivElement>;
  contentContainerRef: React.RefObject<HTMLDivElement>;
  shouldShowJumpToEndAction: boolean;
  handleJumpToEnd: () => void;
}

export function useHistoryScroll(loading: Loading): UseHistoryScrollReturn {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const contentContainerRef = useRef<HTMLDivElement>(null);
  const [shouldShowJumpToEndAction, setShouldShowJumpToEndAction] =
    useState(false);
  // Starts as true: no content yet, treat as at bottom so first streamed
  // content triggers auto-scroll.
  const isNearBottomRef = useRef(true);

  function handleJumpToEnd() {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
      });
    }
  }

  useLayoutEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    const contentContainer = contentContainerRef.current;

    if (!scrollContainer || !contentContainer) {
      return () => {};
    }

    const checkHistoryScrollPosition = () => {
      const isAtBottom =
        scrollContainer.scrollHeight -
          scrollContainer.scrollTop -
          scrollContainer.clientHeight <
        SCROLL_OFFSET_THRESHOLD_PX;
      // Keep ref in sync so the ResizeObserver can read it without state lag.
      isNearBottomRef.current = isAtBottom;
      setShouldShowJumpToEndAction(!isAtBottom);
      if (loading !== "none" && isAtBottom) {
        scrollContainer.scrollTo({ top: scrollContainer.scrollHeight });
      }
    };

    const resizeObserver = new ResizeObserver(checkHistoryScrollPosition);
    // Observe both the content (grows as messages stream in) and the scroll
    // container itself (shrinks when the input transitions back into view after
    // loading finishes, reducing clientHeight over ~250ms).
    resizeObserver.observe(contentContainer);
    resizeObserver.observe(scrollContainer);

    scrollContainer.addEventListener("scroll", checkHistoryScrollPosition, {
      passive: true,
    });

    const animationDelay = setTimeout(() => {
      checkHistoryScrollPosition();
    }, 250);

    return () => {
      resizeObserver.disconnect();
      scrollContainer.removeEventListener("scroll", checkHistoryScrollPosition);
      clearTimeout(animationDelay);
    };
  }, [loading]);

  // When streaming ends, scroll to bottom once so the final message is fully
  // visible regardless of where the ResizeObserver last landed.
  useEffect(() => {
    if (loading === "none" && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
      });
    }
  }, [loading]);

  return {
    scrollContainerRef,
    contentContainerRef,
    shouldShowJumpToEndAction,
    handleJumpToEnd,
  };
}
