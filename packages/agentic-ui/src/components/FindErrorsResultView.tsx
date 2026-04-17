import { Block, Col } from "@jsxstyle/react";
import { color, spacing, textStyles } from "@repro/design";
import React from "react";
import {
  ConsoleMessageResultRow,
  type ConsoleMessage,
} from "./ConsoleMessageResultView";
import {
  NetworkRequestResultRow,
  type NetworkRequest,
} from "./NetworkRequestResultView";

interface ErrorEntry {
  time: number;
  source: "console" | "network";
  summary: string;
  stack?: string[];
}

interface FindErrorsResult {
  errors: ErrorEntry[];
}

interface FindErrorsResultViewProps {
  result: FindErrorsResult;
}

type FindErrorsRenderItem =
  | { kind: "console"; time: number; message: ConsoleMessage }
  | { kind: "network"; time: number; request: NetworkRequest };

type IndexedFindErrorsRenderItem = FindErrorsRenderItem & {
  originalIndex: number;
};

function parseNetworkFailureSummary(summary: string): {
  method?: string;
  url: string;
  status?: number;
} {
  const match = summary.match(
    /^(?<method>[A-Z]+)\s+(?<url>\S+?)(?:\s*(?:→|->|—|-+)\s*(?<status>\d{3}))?(?:\s|$)/,
  );

  if (match?.groups?.url) {
    return {
      method: match.groups.method,
      url: match.groups.url,
      status:
        match.groups.status !== undefined
          ? Number.parseInt(match.groups.status, 10)
          : undefined,
    };
  }

  return { url: summary };
}

function adaptFindError(err: ErrorEntry): FindErrorsRenderItem {
  if (err.source === "console") {
    return {
      kind: "console",
      time: err.time,
      message: {
        timeMs: err.time,
        level: "error",
        text: err.summary,
        stack: err.stack,
      },
    };
  }

  const parsed = parseNetworkFailureSummary(err.summary);

  return {
    kind: "network",
    time: err.time,
    request: {
      timeMs: err.time,
      type: "fetch",
      method: parsed.method,
      url: parsed.url,
      status: parsed.status,
    },
  };
}

export const FindErrorsResultView: React.FC<FindErrorsResultViewProps> = ({
  result,
}) => {
  const { errors } = result;

  if (errors.length === 0) {
    return (
      <Block
        {...textStyles.caption}
        color={color.text.muted}
        padding={spacing.sm}
      >
        No errors found
      </Block>
    );
  }

  const rows = errors
    .map(
      (err, originalIndex): IndexedFindErrorsRenderItem => ({
        ...adaptFindError(err),
        originalIndex,
      }),
    )
    .sort((a, b) => a.time - b.time || a.originalIndex - b.originalIndex);

  return (
    <Col>
      {rows.map((row, i) =>
        row.kind === "console" ? (
          <ConsoleMessageResultRow
            key={`console-${row.time}-${row.originalIndex}`}
            message={row.message}
            index={i}
          />
        ) : (
          <NetworkRequestResultRow
            key={`network-${row.time}-${row.originalIndex}`}
            request={row.request}
            index={i}
          />
        ),
      )}
    </Col>
  );
};
