import { Block, Row } from "@jsxstyle/react";
import { colors } from "@repro/design";
import { BotMessageSquareIcon } from "lucide-react";
import React from "react";

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

export const EmptyState: React.FC = () => {
  return (
    <Block
      position="relative"
      blockSize="100%"
      containerType="inline-size"
      overflow="hidden"
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
          size={48}
          color={colors.slate["500"]}
          strokeWidth={1}
        />
      </Row>
    </Block>
  );
};
