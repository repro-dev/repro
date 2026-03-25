import { Block, Col, Row } from "@jsxstyle/react";
import { ContentBlock, ToolMessage, summarizeToolResult } from "@repro/agentic";
import {
  FX,
  color,
  focusRing,
  fontFamily,
  fontSize,
  radius,
  spacing,
  textStyles,
  transition,
} from "@repro/design";
import { ChevronRightIcon, WrenchIcon } from "lucide-react";
import React, { useState } from "react";

interface ToolCallRowProps {
  toolName: string;
  result: ToolMessage | null;
  isExecuting: boolean;
}

// Resolve tool message content to a plain string for display. When content
// is an array of vision content blocks (e.g. captureScreenshot), produce a
// human-readable summary rather than attempting to JSON-parse raw blocks.
function contentToString(content: string | Array<ContentBlock>): string {
  if (typeof content === "string") {
    return content;
  }
  const textBlock = content.find((b) => b.type === "text");
  if (textBlock && textBlock.type === "text") {
    return textBlock.text;
  }
  return "[vision content]";
}

interface ToolResultDetailProps {
  toolName: string;
  content: string | Array<ContentBlock>;
}

// Renders a screenshot dataUrl as an inline image; falls back to pretty-printed
// JSON for all other tools. Handles both plain string and ContentBlock[] content.
const ToolResultDetail: React.FC<ToolResultDetailProps> = ({
  toolName,
  content,
}) => {
  if (toolName === "captureScreenshot") {
    // Check for dataUrl in a ContentBlock array (image_url block)
    if (Array.isArray(content)) {
      const imageBlock = content.find((b) => b.type === "image_url");
      if (imageBlock && imageBlock.type === "image_url") {
        return (
          <Block
            backgroundColor={color.bg.muted}
            borderRadius={radius.sm}
            padding={spacing.md}
            overflow="hidden"
          >
            <Block
              component="img"
              maxWidth="100%"
              display="block"
              borderRadius={radius.sm}
              props={{ src: imageBlock.image_url.url, alt: "Screenshot" }}
            />
          </Block>
        );
      }
    }

    // Check for dataUrl in a plain JSON string (legacy / fallback path)
    if (typeof content === "string") {
      let dataUrl: string | null = null;
      try {
        const parsed = JSON.parse(content) as Record<string, unknown>;
        if (typeof parsed.dataUrl === "string") {
          dataUrl = parsed.dataUrl;
        }
      } catch {
        // fall through to JSON block below
      }

      if (dataUrl !== null) {
        return (
          <Block
            backgroundColor={color.bg.muted}
            borderRadius={radius.sm}
            padding={spacing.md}
            overflow="hidden"
          >
            <Block
              component="img"
              maxWidth="100%"
              display="block"
              borderRadius={radius.sm}
              props={{ src: dataUrl, alt: "Screenshot" }}
            />
          </Block>
        );
      }
    }
  }

  const raw = contentToString(content);

  return (
    <Block
      fontSize={fontSize.xs}
      fontFamily={fontFamily.mono}
      color={color.text.secondary}
      backgroundColor={color.bg.muted}
      borderRadius={radius.sm}
      padding={spacing.md}
      overflowX="auto"
      whiteSpace="pre-wrap"
      wordBreak="break-all"
      component="pre"
    >
      {(() => {
        try {
          return JSON.stringify(JSON.parse(raw), null, 2);
        } catch {
          return raw;
        }
      })()}
    </Block>
  );
};

export const ToolCallRow: React.FC<ToolCallRowProps> = ({
  toolName,
  result,
  isExecuting,
}) => {
  const [expanded, setExpanded] = useState(false);

  const summary = result
    ? summarizeToolResult(toolName, contentToString(result.content))
    : null;

  return (
    <Col>
      <Row
        alignItems="center"
        gap={spacing.sm}
        paddingV={spacing.sm}
        paddingH={spacing.md}
        cursor="pointer"
        borderRadius={radius.sm}
        hoverBackgroundColor={color.bg.hover}
        transition={transition.fast}
        component="button"
        background="none"
        border="none"
        padding={0}
        fontFamily="inherit"
        props={{
          type: "button",
          onClick: () => setExpanded((prev) => !prev),
          "aria-expanded": expanded,
          "aria-label": `Toggle details for ${toolName}`,
        }}
        {...focusRing()}
      >
        <Row alignItems="center" flexShrink={0}>
          <WrenchIcon size={12} color={color.text.muted} />
        </Row>

        <Block
          fontSize={fontSize.xs}
          fontFamily={fontFamily.mono}
          color={color.text.secondary}
          flexGrow={1}
          textAlign="left"
        >
          {toolName}
        </Block>

        {isExecuting && result === null ? (
          <Row alignItems="center" gap={spacing.xs}>
            <FX.Pulse>
              <Block
                width={6}
                height={6}
                borderRadius={radius.full}
                backgroundColor={color.text.muted}
              />
            </FX.Pulse>
          </Row>
        ) : (
          <Block
            {...textStyles.caption}
            color={color.text.muted}
            overflow="hidden"
            textOverflow="ellipsis"
            whiteSpace="nowrap"
            flexShrink={1}
          >
            {summary}
          </Block>
        )}

        <Row
          alignItems="center"
          flexShrink={0}
          transform={expanded ? "rotate(90deg)" : "rotate(0deg)"}
          transition={transition.fast}
        >
          <ChevronRightIcon size={12} color={color.text.muted} />
        </Row>
      </Row>

      {expanded && result !== null && (
        <ToolResultDetail toolName={toolName} content={result.content} />
      )}
    </Col>
  );
};
