import { Block, Col, Row } from "@jsxstyle/react";
import {
  color,
  colors,
  fontSize,
  radius,
  spacing,
  transition,
} from "@repro/design";
import { BotMessageSquareIcon } from "lucide-react";
import React from "react";

const EXAMPLE_PROMPTS = [
  "What errors occurred?",
  "Why did the page stop responding?",
  "Walk me through what the user did",
  "Are there any failed network requests?",
];

const Ring: React.FC<{ distance: number }> = ({ distance }) => (
  <Block
    position="absolute"
    borderColor={colors.slate["300"]}
    borderRadius="99em"
    borderStyle="solid"
    borderWidth={1}
    blockSize="100cqmin"
    inlineSize="100cqmin"
    transformOrigin="center center"
    scale={0.25 + distance * 0.25}
    opacity={Math.min(1, 1 - distance * 0.2)}
  />
);

interface EmptyStateProps {
  onSelectPrompt: (prompt: string) => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ onSelectPrompt }) => {
  return (
    <Col
      alignItems="center"
      justifyContent="center"
      gap={spacing.xl}
      blockSize="100%"
      paddingBlock={spacing["2xl"]}
    >
      {/* Decorative icon section — constrained so rings don't dominate */}
      <Block
        position="relative"
        blockSize={160}
        inlineSize={160}
        containerType="inline-size"
        overflow="hidden"
        flexShrink={0}
      >
        <Ring distance={4} />
        <Ring distance={3} />
        <Ring distance={2} />
        <Ring distance={1} />
        <Row
          alignItems="center"
          justifyContent="center"
          inlineSize="100cqmin"
          blockSize="100cqmin"
        >
          <BotMessageSquareIcon
            size={40}
            color={colors.slate["500"]}
            strokeWidth={1}
          />
        </Row>
      </Block>

      <Col alignItems="center" gap={spacing.md}>
        {/* Tagline */}
        <Block
          color={color.text.secondary}
          fontSize={fontSize.sm}
          textAlign="center"
        >
          Ask me to help diagnose this recording
        </Block>

        {/* Example prompt chips */}
        <Col gap={spacing.sm} alignItems="center">
          {EXAMPLE_PROMPTS.map((prompt) => (
            <Block
              key={prompt}
              component="button"
              color={color.text.default}
              backgroundColor={color.bg.subtle}
              borderRadius={radius.lg}
              borderWidth={0}
              paddingBlock={spacing.sm}
              paddingInline={spacing.md}
              fontSize={fontSize.xs}
              cursor="pointer"
              transition={transition.fast}
              hoverBackgroundColor={color.bg.hover}
              props={{ onClick: () => onSelectPrompt(prompt) }}
            >
              {prompt}
            </Block>
          ))}
        </Col>
      </Col>
    </Col>
  );
};
