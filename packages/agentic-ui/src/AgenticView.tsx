import { Block, Col } from "@jsxstyle/react";
import { useAtomValue } from "@repro/atom";
import {
  AgenticInputFormState,
  color,
  focusRing,
  radius,
  spacing,
  Tooltip,
  transition,
} from "@repro/design";
import { RotateCcwIcon } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { AgenticErrorBanner } from "./components/AgenticErrorBanner";
import { AgenticInputSection } from "./components/AgenticInputSection";
import { JumpToEndButton } from "./components/JumpToEndButton";
import { LoadingIndicator } from "./components/LoadingIndicator";
import { MessageList } from "./components/MessageList";
import { useAgenticState } from "./context";
import { useHistoryScroll } from "./hooks/useHistoryScroll";

// Backoff delays (ms) for silent auto-retry when service is unavailable.
// After all attempts are exhausted the banner remains until the user dismisses.
const SERVICE_UNAVAILABLE_RETRY_DELAYS = [30_000, 60_000, 120_000];

export const AgenticView: React.FC<{
  onFeedback?: (sentiment: "positive" | "negative") => void;
}> = ({ onFeedback }) => {
  const [inputHasFocus, setInputHasFocus] = useState(false);

  const agentic = useAgenticState();
  const entries = useAtomValue(agentic.$entries);
  const loading = useAtomValue(agentic.$loading);
  const error = useAtomValue(agentic.$error);
  const wasCancelled = useAtomValue(agentic.$wasCancelled);

  const lastPromptRef = useRef("");
  // Tracks how many auto-retry attempts have been made for the current
  // service_unavailable error so we cycle through the backoff schedule.
  const autoRetryAttemptRef = useRef(0);

  const {
    scrollContainerRef,
    contentContainerRef,
    shouldShowJumpToEndAction,
    handleJumpToEnd,
  } = useHistoryScroll(loading, entries);

  const isActive = loading !== "none" && loading !== "cancelled";
  const isServiceUnavailable = error?.kind === "service_unavailable";
  const isRateLimited = error?.kind === "rate_limited";
  const shouldRaiseInput = inputHasFocus || entries.length > 0;

  // Auto-retry when service becomes unavailable. Schedules silent retries of
  // the current context at increasing backoff intervals (30s → 60s → 120s).
  // On success the error atom is cleared by the state layer and the banner
  // disappears automatically.
  useEffect(() => {
    if (!isServiceUnavailable || lastPromptRef.current === "") {
      return;
    }

    const attempt = autoRetryAttemptRef.current;
    const delays = SERVICE_UNAVAILABLE_RETRY_DELAYS;

    if (attempt >= delays.length) {
      // All auto-retry attempts exhausted — leave the banner for the user.
      return;
    }

    const delay = delays[attempt];
    if (delay === undefined) return;

    const timer = setTimeout(() => {
      autoRetryAttemptRef.current = attempt + 1;
      agentic.retry();
    }, delay);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isServiceUnavailable]);

  function handleSubmit({ value }: AgenticInputFormState) {
    lastPromptRef.current = value;
    autoRetryAttemptRef.current = 0;
    agentic.query(value);
    setInputHasFocus(false);
  }

  function handleRetry() {
    agentic.retry();
  }

  function handleReset() {
    agentic.reset();
    autoRetryAttemptRef.current = 0;
    setInputHasFocus(false);
  }

  function handleDismissBanner() {
    agentic.reset();
    autoRetryAttemptRef.current = 0;
  }

  return (
    <Block
      blockSize={`calc(100% + ${spacing["2xl"]}px + ${spacing["2xl"]}px)`}
      containerType="size"
      marginBlockStart={`-${spacing["2xl"]}px`}
      position="relative"
    >
      <Col height="100%" overflow="hidden" marginInline={-spacing["2xl"]}>
        {isServiceUnavailable && (
          <Block paddingInline={spacing["2xl"]} paddingBlockStart={spacing.sm}>
            <AgenticErrorBanner onDismiss={handleDismissBanner} />
          </Block>
        )}

        <MessageList
          entries={entries}
          loading={loading}
          error={error}
          onRetry={handleRetry}
          scrollContainerRef={scrollContainerRef}
          contentContainerRef={contentContainerRef}
          wasCancelled={wasCancelled}
          onFeedback={onFeedback}
          onSelectPrompt={(prompt) => {
            lastPromptRef.current = prompt;
            autoRetryAttemptRef.current = 0;
            agentic.query(prompt);
          }}
        />
      </Col>

      <AgenticInputSection
        disabled={isActive || isServiceUnavailable || isRateLimited}
        entries={entries}
        shouldRaise={shouldRaiseInput}
        hasConversationStarted={entries.length > 0}
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

      {entries.length > 0 && (
        <Block
          alignItems="center"
          background="transparent"
          border="none"
          borderRadius={radius.sm}
          color={color.text.muted}
          component="button"
          cursor="pointer"
          display="flex"
          justifyContent="center"
          padding={spacing.sm}
          position="absolute"
          left={-(spacing.xl + spacing.sm)}
          top={spacing.sm}
          transition={transition.fast}
          hoverBackgroundColor={color.bg.hover}
          {...focusRing("neutral")}
          props={{
            type: "button",
            "aria-label": "Start new session",
            onClick: handleReset,
          }}
        >
          <Tooltip>Start new session</Tooltip>
          <RotateCcwIcon size={14} />
        </Block>
      )}
    </Block>
  );
};
