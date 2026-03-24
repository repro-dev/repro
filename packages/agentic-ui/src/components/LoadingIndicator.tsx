import { Block, Row } from "@jsxstyle/react";
import { Loading } from "@repro/agentic";
import { colors, FX, spacing, transition } from "@repro/design";
import { CircleIcon, XIcon } from "lucide-react";
import React from "react";

interface LoadingIndicatorProps {
  loading: Loading;
  onCancel?: () => void;
}

export const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
  loading,
  onCancel,
}) => {
  const isHidden = loading === "none" || loading === "cancelled";

  return (
    <Row
      alignItems="center"
      backgroundColor={colors.blue["800"]}
      backgroundImage={`linear-gradient(to bottom right, ${colors.blue["900"]}, ${colors.blue["700"]})`}
      borderRadius="99em"
      bottom={0}
      boxShadow={isHidden ? "none" : "0 0 16px rgba(0, 0, 0, 0.15)"}
      left="50%"
      position="absolute"
      translate={isHidden ? `-50% calc(100% + 20px)` : `-50% -20px`}
      transition="all ease-in-out 250ms"
      overflow="clip"
    >
      <Row
        gap={spacing.xs}
        paddingBlock={spacing.md}
        paddingInline={spacing.lg}
      >
        <FX.Pulse>
          <CircleIcon size={8} fill={colors.white} stroke={colors.white} />
        </FX.Pulse>

        <FX.Pulse animationDelay="100ms">
          <CircleIcon size={8} fill={colors.white} stroke={colors.white} />
        </FX.Pulse>

        <FX.Pulse animationDelay="200ms">
          <CircleIcon size={8} fill={colors.white} stroke={colors.white} />
        </FX.Pulse>
      </Row>

      {onCancel && (
        <>
          {/* Faint separator */}
          <Block
            alignSelf="stretch"
            backgroundColor="rgba(255, 255, 255, 0.25)"
            width={1}
          />

          {/* Cancel X button */}
          <Block
            alignItems="center"
            background="none"
            border="none"
            color={colors.white}
            component="button"
            cursor="pointer"
            display="flex"
            justifyContent="center"
            lineHeight={1}
            paddingBlock={spacing.md}
            paddingInline={spacing.lg}
            transition={transition.fast}
            hoverBackgroundColor={colors.blue["700"]}
            props={{
              type: "button",
              "aria-label": "Cancel",
              onClick: onCancel,
            }}
          >
            <XIcon size={12} />
          </Block>
        </>
      )}
    </Row>
  );
};
