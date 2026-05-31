import { Atom, createAtom } from '@repro/atom'
import { Unsubscribe, createBuffer } from '@repro/buffer-utils'
import { Stats, StatsLevel } from '@repro/diagnostics'
import {
  ConsoleEvent,
  ConsoleMessage,
  CustomMark,
  CustomMarkEvent,
  DOMPatch,
  DOMPatchEvent,
  Interaction,
  InteractionEvent,
  InteractionSnapshot,
  InteractionType,
  NetworkEvent,
  NetworkMessage,
  PerformanceEntry,
  PerformanceEvent,
  Point,
  PointerState,
  ReactCommitEvent,
  Snapshot,
  SnapshotEvent,
  SnapshotView,
  SourceEvent,
  SourceEventType,
  SourceEventView,
  StateEvent,
  StateSourceEvent,
  SyntheticId,
  VNode,
} from '@repro/domain'
import { ObserverLike } from '@repro/observer-utils'
import { applyEventToSnapshot, createEmptySnapshot } from '@repro/source-utils'
import { copyObjectDeep } from '@repro/std'
import { Box, List, copy as copyDataView } from '@repro/tdl'
import { applyVTreePatch, getNodeId } from '@repro/vdom-utils'
import {
  NEVER,
  Observable,
  Subject,
  concat,
  defer,
  of,
  switchMap,
  takeUntil,
} from 'rxjs'
import { createConsoleObserver } from './console'
import { createCustomMarkObserver } from './custom'
import {
  createDOMObserver,
  createDOMTreeWalker,
  createDOMVisitor,
  createIFrameVisitor,
} from './dom'
import { detectFrameworks } from './frameworks/detect'
import { createInteractionObserver, createScrollVisitor } from './interaction'
import { createViewportVisitor } from './interaction/visitor'
import { createNetworkObserver } from './network'
import { createPerformanceObserver } from './performance'
import { observePeriodic } from './periodic'
import { createReactObserver } from './state/react'
import { createReduxObserver } from './state/redux'
import { RecordingOptions } from './types'

function isZeroPoint(point: Point) {
  return point[0] === 0 && point[1] === 0
}

const defaultOptions: RecordingOptions = {
  types: new Set(['dom', 'interaction']),
  ignoredNodes: [],
  ignoredSelectors: [],
  maskedSelectors: [],
  snapshotInterval: 10000,
  eventSampling: {
    pointerMove: 50,
    resize: 200,
    scroll: 100,
  },
  webSocket: {
    maxTextPayloadLength: 65_536,
    maxBinaryPayloadLength: 1_048_576,
    redactTextPayloads: false,
    captureBinaryPreview: true,
    binaryPreviewLength: 256,
  },
}

const MAX_EVENT_BUFFER_SIZE_BYTES = 32_000_000

export function createEmptyInteractionSnapshot(): InteractionSnapshot {
  return {
    pointer: [0, 0],
    pointerState: PointerState.Up,
    scroll: {},
    viewport: [0, 0],
    pageURL: '',
  }
}

export interface RecordingStream {
  start(): void
  stop(): void
  injectBufferedEvents(events: Array<DataView>): void
  $started: Atom<boolean>
  isStarted(): boolean
  peek(nodeId: SyntheticId): VNode | null
  slice(start?: number, end?: number): List<SourceEventView>
  snapshot(): Snapshot
  tail(signal: Subject<void>): Observable<SourceEvent>
}

interface BufferSubscriptions {
  onEvict: Unsubscribe | null
  onPush: Unsubscribe | null
}

export const EMPTY_RECORDING_STREAM: RecordingStream = {
  start: () => undefined,
  stop: () => undefined,
  injectBufferedEvents: () => undefined,
  $started: createAtom(false)[0],
  isStarted: () => false,
  peek: () => null,
  slice: () => new List(SourceEventView, []),
  snapshot: () => SnapshotView.from(createEmptySnapshot()),
  tail: () => NEVER,
}

export const InterruptSignal = new Subject<void>()
export function interrupt() {
  InterruptSignal.next()
}

export function createRecordingStream(
  rootDocument: Document,
  customOptions: Partial<RecordingOptions>
): RecordingStream {
  const options: RecordingOptions = {
    ...defaultOptions,
    ...customOptions,
  }

  const [$started, setStarted, isStarted] = createAtom(false)

  const observers: Array<ObserverLike> = []
  const eventBuffer = createBuffer<DataView>(MAX_EVENT_BUFFER_SIZE_BYTES)

  const bufferSubscriptions: BufferSubscriptions = {
    onEvict: null,
    onPush: null,
  }

  let leadingSnapshot = createEmptySnapshot()
  let trailingSnapshot = createEmptySnapshot()
  let sourceDocuments = [rootDocument]

  // Detect frameworks once at stream creation time
  const frameworks = detectFrameworks()

  // Instance references to state observers — set by registerStateObservers(),
  // read by createSnapshotEvent() to call instance-level getters.
  let reactObserverInstance:
    | (ObserverLike & {
        getComponentTree(): import('@repro/domain').ReactComponentTree | null
        resetComponentTree(): void
      })
    | null = null
  let reduxObserverInstance:
    | (ObserverLike & { getStoreState(): unknown; resetStoreState(): void })
    | null = null

  const domTreeWalker = createDOMTreeWalker({
    ignoredNodes: options.ignoredNodes,
    ignoredSelectors: options.ignoredSelectors,
    maskedSelectors: options.maskedSelectors,
  })

  // TODO: investigate on-the-fly snapshotting
  registerSnapshotObserver()
  registerDOMVisitor()

  if (options.types.has('dom')) {
    registerIFrameVisitor()
    registerDOMObserver()
  }

  if (options.types.has('interaction')) {
    registerScrollVisitor()
    registerViewportVisitor()
    registerInteractionObserver()
  }

  if (options.types.has('network')) {
    registerNetworkObserver()
  }

  if (options.types.has('custom')) {
    registerCustomMarkObserver()
  }

  if (options.types.has('console')) {
    registerConsoleObserver()
  }

  if (options.types.has('performance')) {
    registerPerformanceObserver()
  }

  if (options.types.has('state')) {
    registerStateObservers()
  }

  function start() {
    if (isStarted()) {
      return
    }

    Stats.time('RecordingStream#start: total', () => {
      setStarted(true)

      sourceDocuments = [rootDocument]
      trailingSnapshot = createEmptySnapshot()

      if (options.types.has('interaction')) {
        trailingSnapshot.interaction = createEmptyInteractionSnapshot()
        // TODO: should we "visit" this for consistency?
        trailingSnapshot.interaction.pageURL = globalThis.location.href
      }

      Stats.time('RecordingStream#start: build VTree snapshot', () => {
        domTreeWalker(rootDocument)
      })

      const trailingVTree = trailingSnapshot.dom

      if (!trailingVTree) {
        throw new Error('RecordingStream#start: VTree is not initialized')
      }

      Stats.time('RecordingStream#start: copy leading snapshot', () => {
        leadingSnapshot = copyObjectDeep(trailingSnapshot)
      })

      subscribeToBuffer()

      for (const observer of observers) {
        for (const doc of sourceDocuments) {
          observer.observe(doc, trailingVTree)
        }
      }

      addEvent(createSnapshotEvent())
    })
  }

  function stop() {
    if (!isStarted()) {
      return
    }

    for (const observer of observers) {
      observer.disconnect()
    }

    // Defensively clear framework state so getComponentTree()/getStoreState() return null between stop() and next start().
    reactObserverInstance?.resetComponentTree()
    reduxObserverInstance?.resetStoreState()

    unsubscribeFromBuffer()
    eventBuffer.clear()

    setStarted(false)
  }

  function injectBufferedEvents(events: Array<DataView>) {
    for (const event of events) {
      eventBuffer.push(copyDataView(event))
    }
  }

  function slice(start?: number, end?: number): List<SourceEventView> {
    let events: Array<DataView> = []

    Stats.time('RecordingStream#slice: total', () => {
      Stats.time('RecordingStream#slice: deep copy event buffer', () => {
        events = eventBuffer.copy().map(copyDataView).slice(start, end)
      })

      Stats.time('RecordingStream#slice: sort events by time', () => {
        events.sort((a, b) => {
          return (
            SourceEventView.over(a)
              .map(event => event.time)
              .orElse(0) -
            SourceEventView.over(b)
              .map(event => event.time)
              .orElse(0)
          )
        })
      })

      const firstEvent = events[0]

      const timeOffset = firstEvent
        ? SourceEventView.over(firstEvent)
            .map(event => event.time)
            .orElse(0)
        : 0

      Stats.value('RecordingStream#slice: time offset', timeOffset)

      Stats.time('RecordingStream#slice: offset event times', () => {
        for (const event of events) {
          SourceEventView.over(event).apply(lens => {
            lens.time = lens.time - timeOffset
          })
        }
      })

      // If first event is not a snapshot event (i.e. leading snapshot has been
      // evicted), prepend rolling leading snapshot.
      if (
        !firstEvent ||
        SourceEventView.over(firstEvent).match(
          firstEvent => firstEvent.type !== SourceEventType.Snapshot
        )
      ) {
        let adjustedLeadingSnapshot = copyObjectDeep(leadingSnapshot)

        if (start != null && start !== 0) {
          Stats.time(
            'RecordingStream#slice: create adjusted leading snapshot',
            () => {
              let before = events.slice(0, start ?? 0)

              Stats.value(
                'RecordingStream#slice: leading events count',
                before.length
              )

              for (const event of before) {
                const decoded = SourceEventView.decode(event)

                decoded
                  .map(decoded => decoded.time)
                  .apply(time => {
                    applyEventToSnapshot(adjustedLeadingSnapshot, decoded, time)
                  })
              }
            }
          )
        }

        Stats.time('RecordingStream#slice: prepend leading snapshot', () => {
          events.unshift(
            SourceEventView.encode(
              new Box({
                time: 0,
                type: SourceEventType.Snapshot,
                data: adjustedLeadingSnapshot,
              })
            )
          )
        })
      }
    })

    return new List(SourceEventView, events)
  }

  function peek(nodeId: SyntheticId): VNode | null {
    const trailingVTree = trailingSnapshot.dom

    if (!trailingVTree) {
      throw new Error('RecordingStream#peek: VTree is not initialized')
    }

    return trailingVTree.nodes[nodeId] || null
  }

  function snapshot(): Snapshot {
    return SnapshotView.from(copyObjectDeep(trailingSnapshot))
  }

  function tail(signal: Subject<void>): Observable<SourceEvent> {
    function observeSnapshot() {
      return defer(() => of(createSnapshotEvent()))
    }

    return observeSnapshot().pipe(
      switchMap(snapshotEvent => {
        const timeOffset = snapshotEvent
          .map(snapshotEvent => snapshotEvent.time)
          .orElse(0)

        snapshotEvent.apply(snapshotEvent => {
          snapshotEvent.time -= timeOffset
        })

        return concat(
          of(snapshotEvent),
          new Observable<SourceEvent>(observer => {
            const subscription = eventBuffer.onPush(data => {
              const event = SourceEventView.decode(copyDataView(data))

              event.apply(event => {
                event.time -= timeOffset
              })

              observer.next(event)
            })

            return () => {
              subscription()
            }
          }).pipe(takeUntil(signal))
        )
      })
    )
  }

  function addEvent(event: SourceEvent) {
    const data = Stats.timeMean(
      'RecordingStream#addEvent: encode',
      () => {
        return SourceEventView.encode(event)
      },
      StatsLevel.Debug
    )

    eventBuffer.push(data)
  }

  const MAX_REDUX_SNAPSHOT_CHARS = 500_000

  function safeSerialiseReduxState(state: unknown): string | null {
    if (state === null) return null
    try {
      const json = JSON.stringify(state)
      if (json === undefined) return null
      if (json.length > MAX_REDUX_SNAPSHOT_CHARS) return null
      return json
    } catch {
      return null
    }
  }

  function createSnapshotEvent(): Box<SnapshotEvent> {
    const reactTree = frameworks.react
      ? reactObserverInstance?.getComponentTree() ?? null
      : null
    const reduxState = frameworks.redux
      ? safeSerialiseReduxState(reduxObserverInstance?.getStoreState() ?? null)
      : null

    const snap = copyObjectDeep(trailingSnapshot)
    snap.frameworkState =
      reactTree !== null || reduxState !== null
        ? { reactTree, reduxState }
        : null

    return new Box({
      time: performance.now(),
      type: SourceEventType.Snapshot,
      data: snap,
    })
  }

  function registerSnapshotObserver() {
    observers.push(
      observePeriodic(options.snapshotInterval, () => {
        const view = eventBuffer.peekLast()
        const lastEvent = view ? SourceEventView.over(view) : null

        if (
          !lastEvent ||
          lastEvent.match(
            lastEvent => lastEvent.type !== SourceEventType.Snapshot
          )
        ) {
          addEvent(createSnapshotEvent())
        }
      })
    )
  }

  function createPatchEvent(patch: DOMPatch): Box<DOMPatchEvent> {
    return new Box({
      time: performance.now(),
      type: SourceEventType.DOMPatch,
      data: patch,
    })
  }

  function registerDOMObserver() {
    observers.push(
      createDOMObserver(domTreeWalker, options, patch => {
        const trailingVTree = trailingSnapshot.dom

        if (!trailingVTree) {
          throw new Error(
            'RecordingStream~registerDOMObserver: trailing VTree has not been created'
          )
        }

        applyVTreePatch(trailingVTree, patch)
        addEvent(createPatchEvent(patch))
      })
    )
  }

  function registerDOMVisitor() {
    const rootId = getNodeId(rootDocument)
    const domVisitor = createDOMVisitor(options)

    domVisitor.subscribe(vtree => {
      if (vtree.rootId === rootId) {
        trailingSnapshot.dom = vtree
      }
    })

    domTreeWalker.acceptDOMVisitor(domVisitor)
  }

  function registerIFrameVisitor() {
    const iframeVisitor = createIFrameVisitor()

    iframeVisitor.subscribe(contentDocuments => {
      sourceDocuments.push(...contentDocuments)

      if (isStarted() && trailingSnapshot.dom) {
        for (const observer of observers) {
          for (const doc of contentDocuments) {
            observer.observe(doc, trailingSnapshot.dom)
          }
        }
      }
    })

    domTreeWalker.accept(iframeVisitor)
  }

  function createInteractionEvent(
    interaction: Interaction,
    transposition: number
  ): Box<InteractionEvent> {
    return new Box({
      time: performance.now() - transposition,
      type: SourceEventType.Interaction,
      data: interaction,
    })
  }

  function registerInteractionObserver() {
    observers.push(
      createInteractionObserver(options, (interaction, transposition = 0) => {
        const trailingInteraction = trailingSnapshot.interaction

        if (!trailingInteraction) {
          throw new Error(
            'RecordingStream~registerInteractionObserver: trailing interaction snapshot has not been created'
          )
        }

        interaction.apply(interaction => {
          switch (interaction.type) {
            case InteractionType.PointerMove:
              trailingInteraction.pointer = interaction.to
              break

            case InteractionType.PointerDown:
              trailingInteraction.pointer = interaction.at
              trailingInteraction.pointerState = PointerState.Down
              break

            case InteractionType.PointerUp:
              trailingInteraction.pointer = interaction.at
              trailingInteraction.pointerState = PointerState.Up
              break

            case InteractionType.Scroll:
              trailingInteraction.scroll[interaction.target] = interaction.to
              break

            case InteractionType.ViewportResize:
              trailingInteraction.viewport = interaction.to
              break

            case InteractionType.PageTransition:
              trailingInteraction.pageURL = interaction.to
              break
          }
        })

        addEvent(createInteractionEvent(interaction, transposition))
      })
    )
  }

  // @ts-ignore
  function registerScrollVisitor() {
    const scrollVisitor = createScrollVisitor()

    scrollVisitor.subscribe(scroll => {
      const scrollSnapshot = trailingSnapshot.interaction?.scroll

      if (scrollSnapshot) {
        for (const [nodeId, point] of Object.entries(scroll)) {
          // If element does not have previous recorded scroll position
          // and new scroll position is [0, 0], omit this. Playback
          // will default to [0, 0].
          if (!scrollSnapshot.hasOwnProperty(nodeId) && isZeroPoint(point)) {
            continue
          }

          scrollSnapshot[nodeId] = point
        }
      }
    })

    domTreeWalker.accept(scrollVisitor)
  }

  function registerViewportVisitor() {
    const viewportVisitor = createViewportVisitor()

    viewportVisitor.subscribe(viewport => {
      if (trailingSnapshot.interaction) {
        trailingSnapshot.interaction.viewport = viewport
      }
    })

    domTreeWalker.accept(viewportVisitor)
  }

  function createNetworkEvent(message: NetworkMessage): Box<NetworkEvent> {
    return new Box({
      type: SourceEventType.Network,
      time: performance.now(),
      data: message,
    })
  }

  function registerNetworkObserver() {
    observers.push(
      createNetworkObserver(message => {
        addEvent(createNetworkEvent(message))
      }, options.webSocket)
    )
  }

  function createConsoleEvent(message: ConsoleMessage): Box<ConsoleEvent> {
    return new Box({
      type: SourceEventType.Console,
      time: performance.now(),
      data: message,
    })
  }

  function registerConsoleObserver() {
    observers.push(
      createConsoleObserver(message => {
        addEvent(createConsoleEvent(message))
      }, options.maskedSelectors)
    )
  }

  function createPerformanceEvent(
    entry: PerformanceEntry
  ): Box<PerformanceEvent> {
    return new Box({
      type: SourceEventType.Performance,
      time: performance.now(),
      data: entry,
    })
  }

  function registerPerformanceObserver() {
    observers.push(
      createPerformanceObserver(entry => {
        addEvent(createPerformanceEvent(entry))
      })
    )
  }

  function createCustomMarkEvent(mark: CustomMark): Box<CustomMarkEvent> {
    return new Box({
      time: performance.now(),
      type: SourceEventType.CustomMark,
      data: mark,
    })
  }

  function registerCustomMarkObserver() {
    observers.push(
      createCustomMarkObserver(mark => {
        addEvent(createCustomMarkEvent(mark))
      })
    )
  }

  function createStateEvent(data: StateEvent): Box<StateSourceEvent> {
    return new Box({
      type: SourceEventType.State,
      time: performance.now(),
      data,
    })
  }

  function registerStateObservers() {
    if (frameworks.react) {
      reactObserverInstance = createReactObserver((event: ReactCommitEvent) => {
        addEvent(createStateEvent(new Box(event)))
      })
      observers.push(reactObserverInstance)
    }

    if (frameworks.redux) {
      reduxObserverInstance = createReduxObserver((event: StateSourceEvent) => {
        addEvent(new Box(event))
      })
      observers.push(reduxObserverInstance)
    }
  }

  function subscribeToBuffer() {
    bufferSubscriptions.onEvict = eventBuffer.onEvict(evicted => {
      for (const evictee of evicted) {
        const event = SourceEventView.over(evictee)

        // We rebuild a snapshot from incremental events after
        // eviction, so snapshots on the buffer can be discarded
        if (event.match(event => event.type === SourceEventType.Snapshot)) {
          continue
        }

        if (leadingSnapshot) {
          event
            .map(event => event.time)
            .apply(time => {
              applyEventToSnapshot(leadingSnapshot, event, time)
            })
        }

        // TODO: drop evicted console and network messages from snapshots
      }
    })
  }

  function unsubscribeFromBuffer() {
    if (bufferSubscriptions.onEvict) {
      bufferSubscriptions.onEvict()
      bufferSubscriptions.onEvict = null
    }
  }

  return {
    start,
    stop,
    injectBufferedEvents,
    $started,
    isStarted,
    peek,
    slice,
    snapshot,
    tail,
  }
}
