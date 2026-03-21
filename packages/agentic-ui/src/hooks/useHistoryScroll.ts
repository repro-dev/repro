import { useLayoutEffect, useRef, useState } from "react";
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
      setShouldShowJumpToEndAction(!isAtBottom);
    };

    const resizeObserver = new ResizeObserver(checkHistoryScrollPosition);
    resizeObserver.observe(contentContainer);

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

  return {
    scrollContainerRef,
    contentContainerRef,
    shouldShowJumpToEndAction,
    handleJumpToEnd,
  };
}
