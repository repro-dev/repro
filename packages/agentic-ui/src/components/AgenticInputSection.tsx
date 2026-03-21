import { Block } from "@jsxstyle/react";
import { AgenticInput, AgenticInputFormState, colors } from "@repro/design";
import React from "react";
import { PLACEHOLDER_COPY } from "../constants";

interface AgenticInputSectionProps {
  disabled: boolean;
  shouldRaise: boolean;
  onFocusChange: (hasFocus: boolean) => void;
  onSubmit: (state: AgenticInputFormState) => void;
}

export const AgenticInputSection: React.FC<AgenticInputSectionProps> = ({
  disabled,
  shouldRaise,
  onFocusChange,
  onSubmit,
}) => {
  return (
    <Block
      backgroundColor={shouldRaise ? colors.white : colors.slate["100"]}
      borderColor={shouldRaise ? colors.slate["200"] : "transparent"}
      borderStyle="solid"
      borderWidth={0}
      borderBlockStartWidth={1}
      borderRadius={shouldRaise ? 0 : 8}
      bottom={0}
      boxShadow={shouldRaise ? "0 -4px 8px rgba(0, 0, 0, 0.05)" : "none"}
      left={0}
      marginBlock={shouldRaise ? -20 : 0}
      marginInline={shouldRaise ? -20 : 0}
      overflow="hidden"
      paddingBlock={shouldRaise ? 20 : 0}
      paddingInline={shouldRaise ? 20 : 0}
      position="absolute"
      right={0}
      transform={
        disabled ? `translateY(calc(100% + 20px))` : `translateY(-20px)`
      }
      transition="margin ease-in-out 100ms, padding ease-in-out 100ms, transform ease-in-out 250ms"
    >
      <AgenticInput
        disabled={disabled}
        placeholders={PLACEHOLDER_COPY}
        onFocusChange={onFocusChange}
        onSubmit={onSubmit}
      />
    </Block>
  );
};
