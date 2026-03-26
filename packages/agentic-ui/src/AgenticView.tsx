import { Block, Col } from "@jsxstyle/react";
import { useAtomValue } from "@repro/atom";
import { AgenticInputFormState, spacing } from "@repro/design";
import React, { useRef, useState } from "react";
import { AgenticInputSection } from "./components/AgenticInputSection";
import { JumpToEndButton } from "./components/JumpToEndButton";
import { LoadingIndicator } from "./components/LoadingIndicator";
import { MessageList } from "./components/MessageList";
import { useAgenticState } from "./context";
import { useHistoryScroll } from "./hooks/useHistoryScroll";

export const AgenticView: React.FC = () => {
  const [inputHasFocus, setInputHasFocus] = useState(false);

  const agentic = useAgenticState();
  const entries = useAtomValue(agentic.$entries);
  const loading = useAtomValue(agentic.$loading);
  const error = useAtomValue(agentic.$error);

  const lastPromptRef = useRef("");

  const {
    scrollContainerRef,
    contentContainerRef,
    shouldShowJumpToEndAction,
    handleJumpToEnd,
  } = useHistoryScroll(loading);

  const isActive = loading !== "none" && loading !== "cancelled";
  const shouldRaiseInput = inputHasFocus || entries.length > 0;

  function handleSubmit({ value }: AgenticInputFormState) {
    lastPromptRef.current = value;
    agentic.query(value);
    setInputHasFocus(false);
  }

  function handleRetry() {
    agentic.query(lastPromptRef.current);
  }

  return (
    <Block
      blockSize={`calc(100% + ${spacing["2xl"]}px + ${spacing["2xl"]}px)`}
      containerType="size"
      marginBlockStart={`-${spacing["2xl"]}px`}
      position="relative"
    >
      <Col height="100%" overflow="hidden" marginInline={-spacing["2xl"]}>
          <MessageList
            entries={entries}
            loading={loading}
            error={error}
            onRetry={handleRetry}
            scrollContainerRef={scrollContainerRef}
            contentContainerRef={contentContainerRef}
          />
        </Col>

      <AgenticInputSection
        disabled={isActive}
        shouldRaise={shouldRaiseInput}
        onFocusChange={setInputHasFocus}
        onSubmit={handleSubmit}
      />

      <LoadingIndicator
        loading={loading}
        onCancel={isActive ? agentic.cancel : undefined}
      />

      <JumpToEndButton
        shouldShow={shouldShowJumpToEndAction}
        loading={loading}
        onJumpToEnd={handleJumpToEnd}
      />
    </Block>
  );
};
