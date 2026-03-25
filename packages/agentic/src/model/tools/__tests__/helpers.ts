import {
  InteractionType,
  LogLevel,
  MessagePartType,
  NetworkMessageType,
  NodeId,
  NodeType,
  PatchType,
  RequestType,
  Snapshot,
  SourceEventType,
  SourceEventView,
  WebSocketMessageType,
} from "@repro/domain";
import { Box } from "@repro/tdl";
import { makeAccessorFromEventList } from "../../../recordingDataAccessor";
import { RecordingDataAccessor } from "../../../types";

// ─── Accessor helpers ────────────────────────────────────────────────────────

export function makeAccessor(
  events: Array<ReturnType<typeof SourceEventView.from>>,
  duration?: number,
  snapshotFn?: (timestampMs: number) => Snapshot | null,
): RecordingDataAccessor {
  return {
    getDuration: () => duration ?? Number.MAX_SAFE_INTEGER,
    getSnapshotAtTime: snapshotFn ?? (() => null),
    ...makeAccessorFromEventList({
      size: () => events.length,
      over: (i) => events[i] ?? null,
    }),
  };
}

export function makeEmptyAccessor(): RecordingDataAccessor {
  return makeAccessor([]);
}

// ─── Network event factories ──────────────────────────────────────────────────

export function makeFetchRequestEvent(
  time: number,
  correlationId: string,
  url: string,
  method: string,
  headers?: Record<string, string>,
): ReturnType<typeof SourceEventView.from> {
  return SourceEventView.from(
    new Box({
      type: SourceEventType.Network,
      time,
      data: new Box({
        type: NetworkMessageType.FetchRequest,
        correlationId,
        requestType: RequestType.Fetch,
        url,
        method,
        headers: headers ?? {},
        body: new ArrayBuffer(0),
      }),
    }),
  );
}

export function makeFetchResponseEvent(
  time: number,
  correlationId: string,
  status: number,
  headers?: Record<string, string>,
): ReturnType<typeof SourceEventView.from> {
  return SourceEventView.from(
    new Box({
      type: SourceEventType.Network,
      time,
      data: new Box({
        type: NetworkMessageType.FetchResponse,
        correlationId,
        status,
        headers: headers ?? {},
        body: new ArrayBuffer(0),
      }),
    }),
  );
}

export function makeFetchRequestEventWithBody(
  time: number,
  correlationId: string,
  url: string,
  method: string,
  body: string,
  headers?: Record<string, string>,
): ReturnType<typeof SourceEventView.from> {
  return SourceEventView.from(
    new Box({
      type: SourceEventType.Network,
      time,
      data: new Box({
        type: NetworkMessageType.FetchRequest,
        correlationId,
        requestType: RequestType.Fetch,
        url,
        method,
        headers: headers ?? {},
        body: new TextEncoder().encode(body).buffer,
      }),
    }),
  );
}

export function makeFetchResponseEventWithBody(
  time: number,
  correlationId: string,
  status: number,
  body: string,
  headers?: Record<string, string>,
): ReturnType<typeof SourceEventView.from> {
  return SourceEventView.from(
    new Box({
      type: SourceEventType.Network,
      time,
      data: new Box({
        type: NetworkMessageType.FetchResponse,
        correlationId,
        status,
        headers: headers ?? {},
        body: new TextEncoder().encode(body).buffer,
      }),
    }),
  );
}

export function makeWebSocketOpenEvent(
  time: number,
  correlationId: string,
  url: string,
): ReturnType<typeof SourceEventView.from> {
  return SourceEventView.from(
    new Box({
      type: SourceEventType.Network,
      time,
      data: new Box({
        type: NetworkMessageType.WebSocketOpen,
        correlationId,
        url,
      }),
    }),
  );
}

export function makeWebSocketCloseEvent(
  time: number,
  correlationId: string,
): ReturnType<typeof SourceEventView.from> {
  return SourceEventView.from(
    new Box({
      type: SourceEventType.Network,
      time,
      data: new Box({
        type: NetworkMessageType.WebSocketClose,
        correlationId,
      }),
    }),
  );
}

export function makeWebSocketInboundEvent(
  time: number,
  correlationId: string,
  payload: string,
): ReturnType<typeof SourceEventView.from> {
  return SourceEventView.from(
    new Box({
      type: SourceEventType.Network,
      time,
      data: new Box({
        type: NetworkMessageType.WebSocketInbound,
        correlationId,
        messageType: WebSocketMessageType.Text,
        data: new TextEncoder().encode(payload).buffer as ArrayBuffer,
      }),
    }),
  );
}

export function makeWebSocketOutboundEvent(
  time: number,
  correlationId: string,
  payload: string,
): ReturnType<typeof SourceEventView.from> {
  return SourceEventView.from(
    new Box({
      type: SourceEventType.Network,
      time,
      data: new Box({
        type: NetworkMessageType.WebSocketOutbound,
        correlationId,
        messageType: WebSocketMessageType.Text,
        data: new TextEncoder().encode(payload).buffer as ArrayBuffer,
      }),
    }),
  );
}

export function makeWebSocketBinaryInboundEvent(
  time: number,
  correlationId: string,
  byteLength: number,
): ReturnType<typeof SourceEventView.from> {
  return SourceEventView.from(
    new Box({
      type: SourceEventType.Network,
      time,
      data: new Box({
        type: NetworkMessageType.WebSocketInbound,
        correlationId,
        messageType: WebSocketMessageType.Binary,
        data: new ArrayBuffer(byteLength),
      }),
    }),
  );
}

// ─── Console event factories ──────────────────────────────────────────────────

export function makeConsoleEvent(
  time: number,
  level: LogLevel,
  text: string,
  stack?: Array<{
    functionName?: string;
    fileName: string;
    lineNumber: number;
    columnNumber: number;
  }>,
): ReturnType<typeof SourceEventView.from> {
  return SourceEventView.from(
    new Box({
      type: SourceEventType.Console,
      time,
      data: {
        level,
        parts: [
          new Box({
            type: MessagePartType.String,
            value: text,
          }),
        ],
        stack: (stack ?? []).map((s) => ({
          functionName: s.functionName ?? null,
          fileName: s.fileName,
          lineNumber: s.lineNumber,
          columnNumber: s.columnNumber,
        })),
      },
    }),
  );
}

export function makeConsoleErrorEvent(
  time: number,
  message: string,
  stack?: Array<{
    functionName?: string;
    fileName: string;
    lineNumber: number;
    columnNumber: number;
  }>,
): ReturnType<typeof SourceEventView.from> {
  return makeConsoleEvent(time, LogLevel.Error, message, stack);
}

export function makeConsoleInfoEvent(
  time: number,
  message: string,
): ReturnType<typeof SourceEventView.from> {
  return makeConsoleEvent(time, LogLevel.Info, message);
}

// ─── Snapshot helpers ─────────────────────────────────────────────────────────

export function makeSimpleSnapshot(): Snapshot {
  return {
    dom: {
      rootId: "root",
      nodes: {
        root: new Box({
          type: NodeType.Document as NodeType.Document,
          id: "root",
          parentId: null,
          children: ["btn"],
        }),
        btn: new Box({
          type: NodeType.Element as NodeType.Element,
          id: "btn",
          parentId: "root",
          tagName: "button",
          children: ["txt"],
          attributes: { "aria-label": "Submit" },
          properties: { value: null, checked: null, selectedIndex: null },
          shadowRoot: false,
        }),
        txt: new Box({
          type: NodeType.Text as NodeType.Text,
          id: "txt",
          parentId: "btn",
          value: "Submit",
        }),
      },
    },
    interaction: null,
  };
}

export function makeSnapshotWithMissingRoot(): {
  dom: { rootId: string; nodes: Record<string, never> };
  interaction: null;
} {
  return {
    dom: { rootId: "nonexistent-root", nodes: {} },
    interaction: null,
  };
}

// ─── Interaction event factories ──────────────────────────────────────────────

export function makeClickEvent(
  time: number,
  label: string | null = null,
  at: [number, number] = [100, 200],
): ReturnType<typeof SourceEventView.from> {
  return SourceEventView.from(
    new Box({
      type: SourceEventType.Interaction,
      time,
      data: new Box({
        type: InteractionType.Click,
        button: 0,
        targets: [],
        at,
        meta: {
          node: {
            type: NodeType.Element,
            id: "00001" as NodeId,
            parentId: null,
            tagName: "button",
            children: [],
            attributes: {},
            properties: { value: null, checked: null, selectedIndex: null },
            shadowRoot: false,
          },
          humanReadableLabel: label,
        },
      }),
    }),
  );
}

export function makeDoubleClickEvent(
  time: number,
  label: string | null = null,
  at: [number, number] = [50, 60],
): ReturnType<typeof SourceEventView.from> {
  return SourceEventView.from(
    new Box({
      type: SourceEventType.Interaction,
      time,
      data: new Box({
        type: InteractionType.DoubleClick,
        button: 0,
        targets: [],
        at,
        meta: {
          node: {
            type: NodeType.Element,
            id: "00001" as NodeId,
            parentId: null,
            tagName: "button",
            children: [],
            attributes: {},
            properties: { value: null, checked: null, selectedIndex: null },
            shadowRoot: false,
          },
          humanReadableLabel: label,
        },
      }),
    }),
  );
}

export function makeKeyDownEvent(
  time: number,
  key: string,
): ReturnType<typeof SourceEventView.from> {
  return SourceEventView.from(
    new Box({
      type: SourceEventType.Interaction,
      time,
      data: new Box({
        type: InteractionType.KeyDown,
        key,
      }),
    }),
  );
}

export function makeKeyUpEvent(
  time: number,
  key: string,
): ReturnType<typeof SourceEventView.from> {
  return SourceEventView.from(
    new Box({
      type: SourceEventType.Interaction,
      time,
      data: new Box({
        type: InteractionType.KeyUp,
        key,
      }),
    }),
  );
}

export function makeScrollEvent(
  time: number,
  target: NodeId = "00001" as NodeId,
  from: [number, number] = [0, 0],
  to: [number, number] = [0, 300],
): ReturnType<typeof SourceEventView.from> {
  return SourceEventView.from(
    new Box({
      type: SourceEventType.Interaction,
      time,
      data: new Box({
        type: InteractionType.Scroll,
        target,
        from,
        to,
        duration: 0,
      }),
    }),
  );
}

// Note: argument order is (time, to, from?) to match the original test helpers
export function makePageTransitionEvent(
  time: number,
  to: string,
  from: string | null = null,
): ReturnType<typeof SourceEventView.from> {
  return SourceEventView.from(
    new Box({
      type: SourceEventType.Interaction,
      time,
      data: new Box({
        type: InteractionType.PageTransition,
        from,
        to,
      }),
    }),
  );
}

export function makeViewportResizeEvent(
  time: number,
  from: [number, number] = [1024, 768],
  to: [number, number] = [800, 600],
): ReturnType<typeof SourceEventView.from> {
  return SourceEventView.from(
    new Box({
      type: SourceEventType.Interaction,
      time,
      data: new Box({
        type: InteractionType.ViewportResize,
        from,
        to,
        duration: 0,
      }),
    }),
  );
}

export function makeDOMPatchEvent(
  time: number,
): ReturnType<typeof SourceEventView.from> {
  return SourceEventView.from(
    new Box({
      type: SourceEventType.DOMPatch,
      time,
      data: new Box({
        type: PatchType.Attribute,
        targetId: "00001" as NodeId,
        name: "class",
        value: null,
        oldValue: null,
      }),
    }),
  );
}

export function makePointerMoveEvent(
  time: number,
): ReturnType<typeof SourceEventView.from> {
  return SourceEventView.from(
    new Box({
      type: SourceEventType.Interaction,
      time,
      data: new Box({
        type: InteractionType.PointerMove,
        from: [0, 0],
        to: [10, 10],
        duration: 100,
      }),
    }),
  );
}

export function makePointerDownEvent(
  time: number,
): ReturnType<typeof SourceEventView.from> {
  return SourceEventView.from(
    new Box({
      type: SourceEventType.Interaction,
      time,
      data: new Box({
        type: InteractionType.PointerDown,
        targets: [],
        at: [0, 0],
      }),
    }),
  );
}

export function makePointerUpEvent(
  time: number,
): ReturnType<typeof SourceEventView.from> {
  return SourceEventView.from(
    new Box({
      type: SourceEventType.Interaction,
      time,
      data: new Box({
        type: InteractionType.PointerUp,
        targets: [],
        at: [0, 0],
      }),
    }),
  );
}

export function makeNetworkEvent(
  time: number,
): ReturnType<typeof SourceEventView.from> {
  return makeFetchRequestEvent(
    time,
    `net-${time}`,
    "https://example.com/",
    "GET",
  );
}

export function makeSnapshotEvent(
  time: number,
): ReturnType<typeof SourceEventView.from> {
  return SourceEventView.from(
    new Box({
      type: SourceEventType.Snapshot,
      time,
      // data is not accessed by any handler — only type is checked
      data: {} as never,
    }),
  );
}

export function makePerformanceEvent(
  time: number,
): ReturnType<typeof SourceEventView.from> {
  return SourceEventView.from(
    new Box({
      type: SourceEventType.Performance,
      time,
      // data is not accessed by any handler — only type is checked
      data: {} as never,
    }),
  );
}
