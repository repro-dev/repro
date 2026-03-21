import { Block } from "@jsxstyle/react";
import { useAtomValue } from "@repro/atom";
import { AgenticInputFormState } from "@repro/design";
import React, { useState } from "react";
import { AgenticInputSection } from "./components/AgenticInputSection";
import { JumpToEndButton } from "./components/JumpToEndButton";
import { LoadingIndicator } from "./components/LoadingIndicator";
import { MessageList } from "./components/MessageList";
import { GUTTER_PX } from "./constants";
import { useAgenticState } from "./context";
import { useHistoryScroll } from "./hooks/useHistoryScroll";

export const AgenticView: React.FC = () => {
  const [inputHasFocus, setInputHasFocus] = useState(false);

  const agentic = useAgenticState();
  const entries = useAtomValue(agentic.$entries);
  const loading = useAtomValue(agentic.$loading);

  const {
    scrollContainerRef,
    contentContainerRef,
    shouldShowJumpToEndAction,
    handleJumpToEnd,
  } = useHistoryScroll(loading);

  const shouldRaiseInput = inputHasFocus || entries.length > 0;

  function handleSubmit({ value }: AgenticInputFormState) {
    agentic.query(value);
    setInputHasFocus(false);
  }

  return (
    <Block
      blockSize={`calc(100% + ${GUTTER_PX}px + ${GUTTER_PX}px)`}
      containerType="size"
      marginBlockStart={`-${GUTTER_PX}px`}
      position="relative"
    >
      <MessageList
        entries={entries}
        loading={loading}
        scrollContainerRef={scrollContainerRef}
        contentContainerRef={contentContainerRef}
      />

      <AgenticInputSection
        disabled={loading !== "none"}
        shouldRaise={shouldRaiseInput}
        onFocusChange={setInputHasFocus}
        onSubmit={handleSubmit}
      />

      <LoadingIndicator loading={loading} />

      <JumpToEndButton
        shouldShow={shouldShowJumpToEndAction}
        loading={loading}
        onJumpToEnd={handleJumpToEnd}
      />
    </Block>
  );
};
