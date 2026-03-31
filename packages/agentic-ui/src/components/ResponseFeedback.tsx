import { Row } from "@jsxstyle/react";
import { color, focusRing, radius, spacing, transition } from "@repro/design";
import { ThumbsDownIcon, ThumbsUpIcon } from "lucide-react";
import React, { useState } from "react";

interface ResponseFeedbackProps {
  onFeedback: (sentiment: "positive" | "negative") => void;
}

export const ResponseFeedback: React.FC<ResponseFeedbackProps> = ({
  onFeedback,
}) => {
  const [selected, setSelected] = useState<"positive" | "negative" | null>(
    null,
  );

  function handleClick(sentiment: "positive" | "negative") {
    // Re-clicking the same thumb deselects it (fire-and-forget — no deselect
    // API call needed since deselection just means no signal)
    const next = selected === sentiment ? null : sentiment;
    setSelected(next);

    if (next !== null) {
      onFeedback(next);
    }
  }

  return (
    <Row gap={spacing.xs} marginBlockStart={spacing.xs}>
      {/* Thumbs up */}
      <Row
        alignItems="center"
        backgroundColor={
          selected === "positive" ? color.primarySubtle : "transparent"
        }
        border={`1px solid ${
          selected === "positive" ? color.border.focus : "transparent"
        }`}
        borderRadius={radius.sm}
        color={selected === "positive" ? color.primary : color.text.muted}
        component="button"
        cursor="pointer"
        padding={spacing.xs}
        transition={transition.fast}
        hoverColor={color.primary}
        hoverBackgroundColor={
          selected === "positive" ? color.primarySubtleHover : color.bg.hover
        }
        {...focusRing("neutral")}
        props={{
          type: "button",
          "aria-label": "Thumbs up",
          "aria-pressed": selected === "positive",
          onClick: () => handleClick("positive"),
        }}
      >
        <ThumbsUpIcon size={13} />
      </Row>

      {/* Thumbs down */}
      <Row
        alignItems="center"
        backgroundColor={
          selected === "negative" ? color.dangerSubtle : "transparent"
        }
        border={`1px solid ${
          selected === "negative" ? color.dangerBorderSubtle : "transparent"
        }`}
        borderRadius={radius.sm}
        color={selected === "negative" ? color.dangerFg : color.text.muted}
        component="button"
        cursor="pointer"
        padding={spacing.xs}
        transition={transition.fast}
        hoverColor={color.danger}
        hoverBackgroundColor={
          selected === "negative" ? color.dangerTint : color.bg.hover
        }
        {...focusRing("neutral")}
        props={{
          type: "button",
          "aria-label": "Thumbs down",
          "aria-pressed": selected === "negative",
          onClick: () => handleClick("negative"),
        }}
      >
        <ThumbsDownIcon size={13} />
      </Row>
    </Row>
  );
};
