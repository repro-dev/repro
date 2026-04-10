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
import { fork } from "fluture";
import { Box } from "@repro/tdl";
import { makeAccessorFromEventList } from "../../../recordingDataAccessor";
import { RecordingDataAccessor } from "../../../types";
import type { FutureInstance } from "fluture";

// Forks a FutureInstance into a Promise so tests can use await.
export function runFuture<L, R>(future: FutureInstance<L, R>): Promise<R> {
  return new Promise<R>((resolve, reject) => {
    fork(reject)(resolve)(future);
  });
}

// ─── Accessor helpers ────────────────────────────────────────────────────────

export function makeAccessor(
  events: Array<ReturnType<typeof SourceEventView.from>>,
  duration?: number,
  snapshotFn?: (timestampMs: number) => Snapshot | null,
): RecordingDataAccessor {
  return {
    getDuration: () => duration ?? Number.MAX_SAFE_INTEGER,
    getSnapshotAtTime: snapshotFn ?? (() => null),
    getResourceMap: () => ({}),
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
  // Bypass SourceEventView.from() — the binary codec's getByteLength cannot
  // handle all nested union/struct combinations at construction time.
  // The accessor only reads .get("time") and .get("type"); a plain Box suffices.
  return new Box({
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
  }) as unknown as ReturnType<typeof SourceEventView.from>;
}

export function makeFetchResponseEvent(
  time: number,
  correlationId: string,
  status: number,
  headers?: Record<string, string>,
): ReturnType<typeof SourceEventView.from> {
  // Bypass SourceEventView.from() — see comment in makeFetchRequestEvent.
  return new Box({
    type: SourceEventType.Network,
    time,
    data: new Box({
      type: NetworkMessageType.FetchResponse,
      correlationId,
      status,
      headers: headers ?? {},
      body: new ArrayBuffer(0),
    }),
  }) as unknown as ReturnType<typeof SourceEventView.from>;
}

export function makeFetchRequestEventWithBody(
  time: number,
  correlationId: string,
  url: string,
  method: string,
  body: string,
  headers?: Record<string, string>,
): ReturnType<typeof SourceEventView.from> {
  // Bypass SourceEventView.from() — see comment in makeFetchRequestEvent.
  return new Box({
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
  }) as unknown as ReturnType<typeof SourceEventView.from>;
}

export function makeFetchResponseEventWithBody(
  time: number,
  correlationId: string,
  status: number,
  body: string,
  headers?: Record<string, string>,
): ReturnType<typeof SourceEventView.from> {
  // Bypass SourceEventView.from() — see comment in makeFetchRequestEvent.
  return new Box({
    type: SourceEventType.Network,
    time,
    data: new Box({
      type: NetworkMessageType.FetchResponse,
      correlationId,
      status,
      headers: headers ?? {},
      body: new TextEncoder().encode(body).buffer,
    }),
  }) as unknown as ReturnType<typeof SourceEventView.from>;
}

export function makeWebSocketOpenEvent(
  time: number,
  correlationId: string,
  url: string,
): ReturnType<typeof SourceEventView.from> {
  // Bypass SourceEventView.from() — see comment in makeFetchRequestEvent.
  return new Box({
    type: SourceEventType.Network,
    time,
    data: new Box({
      type: NetworkMessageType.WebSocketOpen,
      correlationId,
      url,
    }),
  }) as unknown as ReturnType<typeof SourceEventView.from>;
}

export function makeWebSocketCloseEvent(
  time: number,
  correlationId: string,
): ReturnType<typeof SourceEventView.from> {
  // Bypass SourceEventView.from() — see comment in makeFetchRequestEvent.
  return new Box({
    type: SourceEventType.Network,
    time,
    data: new Box({
      type: NetworkMessageType.WebSocketClose,
      correlationId,
    }),
  }) as unknown as ReturnType<typeof SourceEventView.from>;
}

export function makeWebSocketInboundEvent(
  time: number,
  correlationId: string,
  payload: string,
): ReturnType<typeof SourceEventView.from> {
  // Bypass SourceEventView.from() — see comment in makeFetchRequestEvent.
  return new Box({
    type: SourceEventType.Network,
    time,
    data: new Box({
      type: NetworkMessageType.WebSocketInbound,
      correlationId,
      messageType: WebSocketMessageType.Text,
      data: new TextEncoder().encode(payload).buffer as ArrayBuffer,
    }),
  }) as unknown as ReturnType<typeof SourceEventView.from>;
}

export function makeWebSocketOutboundEvent(
  time: number,
  correlationId: string,
  payload: string,
): ReturnType<typeof SourceEventView.from> {
  // Bypass SourceEventView.from() — see comment in makeFetchRequestEvent.
  return new Box({
    type: SourceEventType.Network,
    time,
    data: new Box({
      type: NetworkMessageType.WebSocketOutbound,
      correlationId,
      messageType: WebSocketMessageType.Text,
      data: new TextEncoder().encode(payload).buffer as ArrayBuffer,
    }),
  }) as unknown as ReturnType<typeof SourceEventView.from>;
}

export function makeWebSocketBinaryInboundEvent(
  time: number,
  correlationId: string,
  byteLength: number,
): ReturnType<typeof SourceEventView.from> {
  // Bypass SourceEventView.from() — see comment in makeFetchRequestEvent.
  return new Box({
    type: SourceEventType.Network,
    time,
    data: new Box({
      type: NetworkMessageType.WebSocketInbound,
      correlationId,
      messageType: WebSocketMessageType.Binary,
      data: new ArrayBuffer(byteLength),
    }),
  }) as unknown as ReturnType<typeof SourceEventView.from>;
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
  // Bypass SourceEventView.from() — see comment in makeFetchRequestEvent.
  return new Box({
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
  }) as unknown as ReturnType<typeof SourceEventView.from>;
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
    frameworkState: null,
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

export interface MetaNode {
  id: string;
  tagName: string;
  attributes: Record<string, string | null>;
}

export function makeClickEvent(
  time: number,
  label?: string | null,
  at?: [number, number],
  metaNode?: MetaNode,
  targets?: string[],
): ReturnType<typeof SourceEventView.from> {
  const resolvedAt = at ?? [100, 200];
  const resolvedLabel = label ?? null;
  const node = metaNode
    ? {
        type: NodeType.Element,
        id: metaNode.id as NodeId,
        parentId: null,
        tagName: metaNode.tagName,
        children: [],
        attributes: metaNode.attributes,
        properties: { value: null, checked: null, selectedIndex: null },
        shadowRoot: false,
      }
    : {
        type: NodeType.Element,
        id: "00001" as NodeId,
        parentId: null,
        tagName: "button",
        children: [],
        attributes: {},
        properties: { value: null, checked: null, selectedIndex: null },
        shadowRoot: false,
      };
  // Bypass SourceEventView.from() — see comment in makeFetchRequestEvent.
  return new Box({
    type: SourceEventType.Interaction,
    time,
    data: new Box({
      type: InteractionType.Click,
      button: 0,
      targets: targets ?? [],
      at: resolvedAt,
      meta: {
        node,
        humanReadableLabel: resolvedLabel,
      },
    }),
  }) as unknown as ReturnType<typeof SourceEventView.from>;
}

export function makeDoubleClickEvent(
  time: number,
  label?: string | null,
  at?: [number, number],
  metaNode?: MetaNode,
  targets?: string[],
): ReturnType<typeof SourceEventView.from> {
  const resolvedAt = at ?? [50, 60];
  const resolvedLabel = label ?? null;
  const node = metaNode
    ? {
        type: NodeType.Element,
        id: metaNode.id as NodeId,
        parentId: null,
        tagName: metaNode.tagName,
        children: [],
        attributes: metaNode.attributes,
        properties: { value: null, checked: null, selectedIndex: null },
        shadowRoot: false,
      }
    : {
        type: NodeType.Element,
        id: "00001" as NodeId,
        parentId: null,
        tagName: "button",
        children: [],
        attributes: {},
        properties: { value: null, checked: null, selectedIndex: null },
        shadowRoot: false,
      };
  // Bypass SourceEventView.from() — see comment in makeFetchRequestEvent.
  return new Box({
    type: SourceEventType.Interaction,
    time,
    data: new Box({
      type: InteractionType.DoubleClick,
      button: 0,
      targets: targets ?? [],
      at: resolvedAt,
      meta: {
        node,
        humanReadableLabel: resolvedLabel,
      },
    }),
  }) as unknown as ReturnType<typeof SourceEventView.from>;
}

export function makeKeyDownEvent(
  time: number,
  key: string,
): ReturnType<typeof SourceEventView.from> {
  // Bypass SourceEventView.from() — see comment in makeFetchRequestEvent.
  return new Box({
    type: SourceEventType.Interaction,
    time,
    data: new Box({
      type: InteractionType.KeyDown,
      key,
    }),
  }) as unknown as ReturnType<typeof SourceEventView.from>;
}

export function makeKeyUpEvent(
  time: number,
  key: string,
): ReturnType<typeof SourceEventView.from> {
  // Bypass SourceEventView.from() — see comment in makeFetchRequestEvent.
  return new Box({
    type: SourceEventType.Interaction,
    time,
    data: new Box({
      type: InteractionType.KeyUp,
      key,
    }),
  }) as unknown as ReturnType<typeof SourceEventView.from>;
}

export function makeScrollEvent(
  time: number,
  target: NodeId = "00001" as NodeId,
  from: [number, number] = [0, 0],
  to: [number, number] = [0, 300],
): ReturnType<typeof SourceEventView.from> {
  // Bypass SourceEventView.from() — see comment in makeFetchRequestEvent.
  return new Box({
    type: SourceEventType.Interaction,
    time,
    data: new Box({
      type: InteractionType.Scroll,
      target,
      from,
      to,
      duration: 0,
    }),
  }) as unknown as ReturnType<typeof SourceEventView.from>;
}

// Note: argument order is (time, to, from?) to match the original test helpers
export function makePageTransitionEvent(
  time: number,
  to: string,
  from: string | null = null,
): ReturnType<typeof SourceEventView.from> {
  // Bypass SourceEventView.from() — see comment in makeFetchRequestEvent.
  return new Box({
    type: SourceEventType.Interaction,
    time,
    data: new Box({
      type: InteractionType.PageTransition,
      from,
      to,
    }),
  }) as unknown as ReturnType<typeof SourceEventView.from>;
}

export function makeViewportResizeEvent(
  time: number,
  from: [number, number] = [1024, 768],
  to: [number, number] = [800, 600],
): ReturnType<typeof SourceEventView.from> {
  // Bypass SourceEventView.from() — see comment in makeFetchRequestEvent.
  return new Box({
    type: SourceEventType.Interaction,
    time,
    data: new Box({
      type: InteractionType.ViewportResize,
      from,
      to,
      duration: 0,
    }),
  }) as unknown as ReturnType<typeof SourceEventView.from>;
}

export function makeDOMPatchEvent(
  time: number,
): ReturnType<typeof SourceEventView.from> {
  // Bypass SourceEventView.from() — see comment in makeFetchRequestEvent.
  return new Box({
    type: SourceEventType.DOMPatch,
    time,
    data: new Box({
      type: PatchType.Attribute,
      targetId: "00001" as NodeId,
      name: "class",
      value: null,
      oldValue: null,
    }),
  }) as unknown as ReturnType<typeof SourceEventView.from>;
}

export function makePointerMoveEvent(
  time: number,
): ReturnType<typeof SourceEventView.from> {
  // Bypass SourceEventView.from() — see comment in makeFetchRequestEvent.
  return new Box({
    type: SourceEventType.Interaction,
    time,
    data: new Box({
      type: InteractionType.PointerMove,
      from: [0, 0],
      to: [10, 10],
      duration: 100,
    }),
  }) as unknown as ReturnType<typeof SourceEventView.from>;
}

export function makePointerDownEvent(
  time: number,
): ReturnType<typeof SourceEventView.from> {
  // Bypass SourceEventView.from() — see comment in makeFetchRequestEvent.
  return new Box({
    type: SourceEventType.Interaction,
    time,
    data: new Box({
      type: InteractionType.PointerDown,
      targets: [],
      at: [0, 0],
    }),
  }) as unknown as ReturnType<typeof SourceEventView.from>;
}

export function makePointerUpEvent(
  time: number,
): ReturnType<typeof SourceEventView.from> {
  // Bypass SourceEventView.from() — see comment in makeFetchRequestEvent.
  return new Box({
    type: SourceEventType.Interaction,
    time,
    data: new Box({
      type: InteractionType.PointerUp,
      targets: [],
      at: [0, 0],
    }),
  }) as unknown as ReturnType<typeof SourceEventView.from>;
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
  // Bypass SourceEventView.from() — see comment in makeFetchRequestEvent.
  // data is not accessed by any handler — only type is checked.
  return new Box({
    type: SourceEventType.Snapshot,
    time,
    data: {} as never,
  }) as unknown as ReturnType<typeof SourceEventView.from>;
}

export function makePerformanceEvent(
  time: number,
): ReturnType<typeof SourceEventView.from> {
  // Bypass SourceEventView.from() — see comment in makeFetchRequestEvent.
  // data is not accessed by any handler — only type is checked.
  return new Box({
    type: SourceEventType.Performance,
    time,
    data: {} as never,
  }) as unknown as ReturnType<typeof SourceEventView.from>;
}

// ─── DOMPatch event factories ─────────────────────────────────────────────────

export function makeAttributePatchEvent(
  time: number,
  targetId: string,
  name: string,
  value: string | null,
  oldValue: string | null,
): ReturnType<typeof SourceEventView.from> {
  // Bypass SourceEventView.from(): NodeId is fixed-width 5 bytes in the
  // binary codec, so IDs longer than 5 chars would be silently truncated.
  // Plain Box avoids the codec entirely and works with arbitrary test IDs.
  return new Box({
    type: SourceEventType.DOMPatch,
    time,
    data: new Box({
      type: PatchType.Attribute,
      targetId: targetId as NodeId,
      name,
      value,
      oldValue,
    }),
  }) as unknown as ReturnType<typeof SourceEventView.from>;
}

export function makeTextPatchEvent(
  time: number,
  targetId: string,
  value: string,
  oldValue: string,
): ReturnType<typeof SourceEventView.from> {
  // Bypass SourceEventView.from() — see comment in makeAttributePatchEvent.
  return new Box({
    type: SourceEventType.DOMPatch,
    time,
    data: new Box({
      type: PatchType.Text,
      targetId: targetId as NodeId,
      value,
      oldValue,
      parentId: null,
    }),
  }) as unknown as ReturnType<typeof SourceEventView.from>;
}

export function makeAddNodesPatchEvent(
  time: number,
  parentId: string,
  nodeIds: string[],
): ReturnType<typeof SourceEventView.from> {
  // Each entry in nodes is a minimal VTree with a single root element.
  // We bypass SourceEventView.from() here because the binary codec hangs when
  // encoding the nested VTree nodes map (encodeMap + encodeUnion recursion).
  // A plain Box is sufficient — getEventsByType only calls .get("time") and
  // .get("type"), and the getDOMDiff handler calls .get("data").get(...).
  const nodes = nodeIds.map((id) => ({
    rootId: id as NodeId,
    nodes: {
      [id]: new Box({
        type: NodeType.Element as NodeType.Element,
        id: id as NodeId,
        parentId: parentId as NodeId,
        tagName: "div",
        children: [] as NodeId[],
        attributes: {} as Record<string, string | null>,
        properties: { value: null, checked: null, selectedIndex: null },
        shadowRoot: false,
      }),
    },
  }));
  return new Box({
    type: SourceEventType.DOMPatch,
    time,
    data: new Box({
      type: PatchType.AddNodes,
      parentId: parentId as NodeId,
      previousSiblingId: null,
      nextSiblingId: null,
      nodes,
    }),
  }) as unknown as ReturnType<typeof SourceEventView.from>;
}

export function makeRemoveNodesPatchEvent(
  time: number,
  parentId: string,
  nodeIds: string[],
): ReturnType<typeof SourceEventView.from> {
  // Bypass SourceEventView.from() — see comment in makeAddNodesPatchEvent.
  const nodes = nodeIds.map((id) => ({
    rootId: id as NodeId,
    nodes: {
      [id]: new Box({
        type: NodeType.Element as NodeType.Element,
        id: id as NodeId,
        parentId: parentId as NodeId,
        tagName: "div",
        children: [] as NodeId[],
        attributes: {} as Record<string, string | null>,
        properties: { value: null, checked: null, selectedIndex: null },
        shadowRoot: false,
      }),
    },
  }));
  return new Box({
    type: SourceEventType.DOMPatch,
    time,
    data: new Box({
      type: PatchType.RemoveNodes,
      parentId: parentId as NodeId,
      previousSiblingId: null,
      nextSiblingId: null,
      nodes,
    }),
  }) as unknown as ReturnType<typeof SourceEventView.from>;
}

export function makeTextPropertyPatchEvent(
  time: number,
  targetId: string,
  name: string,
  value: string,
  oldValue: string,
): ReturnType<typeof SourceEventView.from> {
  // Bypass SourceEventView.from() — see comment in makeAttributePatchEvent.
  return new Box({
    type: SourceEventType.DOMPatch,
    time,
    data: new Box({
      type: PatchType.TextProperty,
      targetId: targetId as NodeId,
      name,
      value,
      oldValue,
    }),
  }) as unknown as ReturnType<typeof SourceEventView.from>;
}

export function makeBooleanPropertyPatchEvent(
  time: number,
  targetId: string,
  name: string,
  value: boolean,
  oldValue: boolean,
): ReturnType<typeof SourceEventView.from> {
  // Bypass SourceEventView.from() — see comment in makeAttributePatchEvent.
  return new Box({
    type: SourceEventType.DOMPatch,
    time,
    data: new Box({
      type: PatchType.BooleanProperty,
      targetId: targetId as NodeId,
      name,
      value,
      oldValue,
    }),
  }) as unknown as ReturnType<typeof SourceEventView.from>;
}

export function makeNumberPropertyPatchEvent(
  time: number,
  targetId: string,
  name: string,
  value: number,
  oldValue: number,
): ReturnType<typeof SourceEventView.from> {
  // Bypass SourceEventView.from() — see comment in makeAttributePatchEvent.
  return new Box({
    type: SourceEventType.DOMPatch,
    time,
    data: new Box({
      type: PatchType.NumberProperty,
      targetId: targetId as NodeId,
      name,
      value,
      oldValue,
    }),
  }) as unknown as ReturnType<typeof SourceEventView.from>;
}
