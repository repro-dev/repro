import {
  InteractionType,
  LogLevel,
  MessagePartType,
  MouseButton,
  NetworkMessageType,
  NodeType,
  PointerState,
  RecordingMode,
  RequestType,
  SourceEvent,
  SourceEventType,
} from '@repro/domain'
import { Box } from '@repro/tdl'

function makeVTree() {
  return {
    rootId: 'AAAAA',
    nodes: {
      AAAAA: new Box({
        type: NodeType.Document as const,
        id: 'AAAAA',
        parentId: null,
        children: ['BBBBB', 'CCCCC'],
      }),
      BBBBB: new Box({
        type: NodeType.DocType as const,
        id: 'BBBBB',
        parentId: 'AAAAA',
        name: 'html',
        publicId: '',
        systemId: '',
      }),
      CCCCC: new Box({
        type: NodeType.Element as const,
        id: 'CCCCC',
        parentId: 'AAAAA',
        tagName: 'HTML',
        children: ['DDDDD', 'EEEEE'],
        attributes: { lang: 'en' },
        properties: { value: null, checked: null, selectedIndex: null },
        shadowRoot: false,
        slotAssignments: null,
      }),
      DDDDD: new Box({
        type: NodeType.Element as const,
        id: 'DDDDD',
        parentId: 'CCCCC',
        tagName: 'HEAD',
        children: ['FFFFF'],
        attributes: {},
        properties: { value: null, checked: null, selectedIndex: null },
        shadowRoot: false,
        slotAssignments: null,
      }),
      FFFFF: new Box({
        type: NodeType.Element as const,
        id: 'FFFFF',
        parentId: 'DDDDD',
        tagName: 'TITLE',
        children: ['GGGGG'],
        attributes: {},
        properties: { value: null, checked: null, selectedIndex: null },
        shadowRoot: false,
        slotAssignments: null,
      }),
      GGGGG: new Box({
        type: NodeType.Text as const,
        id: 'GGGGG',
        parentId: 'FFFFF',
        value: 'Test Page',
      }),
      EEEEE: new Box({
        type: NodeType.Element as const,
        id: 'EEEEE',
        parentId: 'CCCCC',
        tagName: 'BODY',
        children: ['HHHHH', 'IIIII'],
        attributes: {},
        properties: { value: null, checked: null, selectedIndex: null },
        shadowRoot: false,
        slotAssignments: null,
      }),
      HHHHH: new Box({
        type: NodeType.Element as const,
        id: 'HHHHH',
        parentId: 'EEEEE',
        tagName: 'H1',
        children: ['JJJJJ'],
        attributes: {},
        properties: { value: null, checked: null, selectedIndex: null },
        shadowRoot: false,
        slotAssignments: null,
      }),
      JJJJJ: new Box({
        type: NodeType.Text as const,
        id: 'JJJJJ',
        parentId: 'HHHHH',
        value: 'Hello World',
      }),
      IIIII: new Box({
        type: NodeType.Element as const,
        id: 'IIIII',
        parentId: 'EEEEE',
        tagName: 'BUTTON',
        children: ['KKKKK'],
        attributes: { id: 'submit-btn', class: 'btn btn-primary' },
        properties: { value: null, checked: null, selectedIndex: null },
        shadowRoot: false,
        slotAssignments: null,
      }),
      KKKKK: new Box({
        type: NodeType.Text as const,
        id: 'KKKKK',
        parentId: 'IIIII',
        value: 'Submit',
      }),
    },
  }
}

function makeInteractionSnapshot() {
  return {
    pointer: [0, 0] as [number, number],
    pointerState: PointerState.Up,
    scroll: {},
    viewport: [1280, 720] as [number, number],
    pageURL: 'https://example.com',
  }
}

function makeSnapshotEvent(time: number): SourceEvent {
  return new Box({
    type: SourceEventType.Snapshot,
    time,
    data: {
      dom: makeVTree(),
      interaction: makeInteractionSnapshot(),
      frameworkState: null,
      cssRules: null,
    },
  })
}

export interface FixtureRecording {
  title: string
  url: string
  description: string
  mode: RecordingMode
  duration: number
  browserName: string
  browserVersion: string
  operatingSystem: string
  events: Array<SourceEvent>
}

export const simpleInteraction: FixtureRecording = {
  title: 'Simple Interaction',
  url: 'https://example.com',
  description: 'Page load with a few clicks — basic playback test',
  mode: RecordingMode.Replay,
  duration: 4650,
  browserName: 'Chrome',
  browserVersion: '120.0.0',
  operatingSystem: 'macOS',
  events: [
    makeSnapshotEvent(0),

    new Box({
      type: SourceEventType.Interaction,
      time: 1000,
      data: new Box({
        type: InteractionType.PointerMove,
        from: [0, 0] as [number, number],
        to: [400, 300] as [number, number],
        duration: 200,
      }),
    }),

    new Box({
      type: SourceEventType.Interaction,
      time: 1500,
      data: new Box({
        type: InteractionType.PointerDown,
        targets: ['IIIII'],
        at: [400, 300] as [number, number],
      }),
    }),

    new Box({
      type: SourceEventType.Interaction,
      time: 1550,
      data: new Box({
        type: InteractionType.PointerUp,
        targets: ['IIIII'],
        at: [400, 300] as [number, number],
      }),
    }),

    new Box({
      type: SourceEventType.Interaction,
      time: 1550,
      data: new Box({
        type: InteractionType.Click,
        button: MouseButton.Primary,
        targets: ['IIIII'],
        at: [400, 300] as [number, number],
        meta: {
          node: {
            type: NodeType.Element,
            id: 'IIIII',
            parentId: 'EEEEE',
            tagName: 'BUTTON',
            children: ['KKKKK'],
            attributes: { id: 'submit-btn', class: 'btn btn-primary' },
            properties: { value: null, checked: null, selectedIndex: null },
            shadowRoot: false,
            slotAssignments: null,
          },
          humanReadableLabel: 'Submit',
        },
      }),
    }),

    new Box({
      type: SourceEventType.Interaction,
      time: 3000,
      data: new Box({
        type: InteractionType.PointerMove,
        from: [400, 300] as [number, number],
        to: [600, 100] as [number, number],
        duration: 300,
      }),
    }),

    new Box({
      type: SourceEventType.Interaction,
      time: 4500,
      data: new Box({
        type: InteractionType.Scroll,
        target: 'EEEEE',
        from: [0, 0] as [number, number],
        to: [0, 200] as [number, number],
        duration: 150,
      }),
    }),
  ],
}

export const consoleErrors: FixtureRecording = {
  title: 'Console Errors',
  url: 'https://example.com/app',
  description: 'Recording with console messages including errors',
  mode: RecordingMode.Replay,
  duration: 7000,
  browserName: 'Chrome',
  browserVersion: '120.0.0',
  operatingSystem: 'macOS',
  events: [
    makeSnapshotEvent(0),

    new Box({
      type: SourceEventType.Console,
      time: 500,
      data: {
        level: LogLevel.Info,
        parts: [
          new Box({
            type: MessagePartType.String,
            value: 'Application initialized',
          }),
        ],
        stack: [],
      },
    }),

    new Box({
      type: SourceEventType.Console,
      time: 1200,
      data: {
        level: LogLevel.Warning,
        parts: [
          new Box({
            type: MessagePartType.String,
            value: 'Deprecated API usage detected',
          }),
        ],
        stack: [
          {
            functionName: 'fetchData',
            fileName: 'https://example.com/app.js',
            lineNumber: 42,
            columnNumber: 12,
          },
        ],
      },
    }),

    new Box({
      type: SourceEventType.Console,
      time: 2500,
      data: {
        level: LogLevel.Error,
        parts: [
          new Box({
            type: MessagePartType.String,
            value:
              'TypeError: Cannot read properties of undefined (reading "id")',
          }),
        ],
        stack: [
          {
            functionName: 'processUser',
            fileName: 'https://example.com/app.js',
            lineNumber: 87,
            columnNumber: 5,
          },
          {
            functionName: 'handleClick',
            fileName: 'https://example.com/app.js',
            lineNumber: 125,
            columnNumber: 18,
          },
        ],
      },
    }),

    new Box({
      type: SourceEventType.Interaction,
      time: 3000,
      data: new Box({
        type: InteractionType.PointerMove,
        from: [0, 0] as [number, number],
        to: [300, 200] as [number, number],
        duration: 100,
      }),
    }),

    new Box({
      type: SourceEventType.Console,
      time: 5000,
      data: {
        level: LogLevel.Error,
        parts: [
          new Box({
            type: MessagePartType.String,
            value:
              'Unhandled promise rejection: NetworkError when attempting to fetch resource.',
          }),
        ],
        stack: [
          {
            functionName: null,
            fileName: 'https://example.com/api.js',
            lineNumber: 15,
            columnNumber: 3,
          },
        ],
      },
    }),

    new Box({
      type: SourceEventType.Console,
      time: 7000,
      data: {
        level: LogLevel.Verbose,
        parts: [
          new Box({
            type: MessagePartType.String,
            value: 'Retry attempt 1 of 3',
          }),
        ],
        stack: [],
      },
    }),
  ],
}

const textEncoder = new TextEncoder()

export const networkRequests: FixtureRecording = {
  title: 'Network Requests',
  url: 'https://example.com/dashboard',
  description: 'Recording with various network requests and responses',
  mode: RecordingMode.Replay,
  duration: 8100,
  browserName: 'Firefox',
  browserVersion: '124.0.0',
  operatingSystem: 'Linux x86_64',
  events: [
    makeSnapshotEvent(0),

    new Box({
      type: SourceEventType.Network,
      time: 200,
      data: new Box({
        type: NetworkMessageType.FetchRequest,
        correlationId: 'Ab1c',
        requestType: RequestType.Fetch,
        url: 'https://api.example.com/users/me',
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer token123',
        },
        body: new ArrayBuffer(0),
      }),
    }),

    new Box({
      type: SourceEventType.Network,
      time: 450,
      data: new Box({
        type: NetworkMessageType.FetchResponse,
        correlationId: 'Ab1c',
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
        body: textEncoder.encode(
          '{"id":1,"name":"Test User","email":"user@example.com"}'
        ).buffer,
      }),
    }),

    new Box({
      type: SourceEventType.Interaction,
      time: 1000,
      data: new Box({
        type: InteractionType.PointerMove,
        from: [0, 0] as [number, number],
        to: [500, 350] as [number, number],
        duration: 150,
      }),
    }),

    new Box({
      type: SourceEventType.Network,
      time: 2000,
      data: new Box({
        type: NetworkMessageType.FetchRequest,
        correlationId: 'Xd2e',
        requestType: RequestType.XHR,
        url: 'https://api.example.com/dashboard/stats',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token123',
        },
        body: textEncoder.encode('{"period":"last_7_days"}').buffer,
      }),
    }),

    new Box({
      type: SourceEventType.Network,
      time: 2800,
      data: new Box({
        type: NetworkMessageType.FetchResponse,
        correlationId: 'Xd2e',
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
        body: textEncoder.encode('{"views":1250,"sessions":342,"errors":7}')
          .buffer,
      }),
    }),

    new Box({
      type: SourceEventType.Network,
      time: 5000,
      data: new Box({
        type: NetworkMessageType.FetchRequest,
        correlationId: 'Pq3f',
        requestType: RequestType.Fetch,
        url: 'https://api.example.com/notifications',
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer token123',
        },
        body: new ArrayBuffer(0),
      }),
    }),

    new Box({
      type: SourceEventType.Network,
      time: 8000,
      data: new Box({
        type: NetworkMessageType.FetchResponse,
        correlationId: 'Pq3f',
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
        body: textEncoder.encode('{"error":"Internal Server Error"}').buffer,
      }),
    }),

    new Box({
      type: SourceEventType.Console,
      time: 8100,
      data: {
        level: LogLevel.Error,
        parts: [
          new Box({
            type: MessagePartType.String,
            value: 'Failed to fetch notifications: 500 Internal Server Error',
          }),
        ],
        stack: [],
      },
    }),
  ],
}

export const fixtureRecordings = [
  simpleInteraction,
  consoleErrors,
  networkRequests,
]
