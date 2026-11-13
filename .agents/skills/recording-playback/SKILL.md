---
name: recording-playback
description: Architecture, data flow, and conventions for session recording and playback — execution contexts, observer pipeline, ring buffer, playback seek algorithm, and upload flow. Load when working in apps/capture, packages/recording, packages/playback, packages/recording-api, packages/buffer-utils, packages/vdom-renderer, packages/source-utils, packages/observer-utils, or packages/wire-formats.
---

# Recording & Playback

Reference for the session recording and playback subsystem. Load this skill before implementing anything in `apps/capture` or the packages listed above.

---

## Execution Contexts

The capture extension runs in **four distinct contexts**. Understanding the boundary between them is critical — code, APIs, and message channels differ per context.

| Context                         | Entry point                                | What runs here                                                                                  |
| ------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| **Page world**                  | `apps/capture/src/index.tsx`               | `<repro-capture>` custom element, React widget, `RecordingStream`, `Playback`                   |
| **Content script**              | `apps/capture/src/extension/content.ts`    | Injects `capture.js` and `bridgeHost.html` iframe; bridges messages between page and background |
| **Background (service worker)** | `apps/capture/src/extension/background.ts` | Extension toggle, upload queue, `RuntimeAgent` for Chrome runtime messaging                     |
| **Bridge host (hidden iframe)** | `apps/capture/src/extension/bridgeHost.ts` | `MessagingAgent` + `apiBridge.html` for API proxying (bypasses page-world CORS)                 |

### Communication channels

- **Page ↔ content**: `MessagingAgent` over `postMessage` (see `packages/messaging`)
- **Content ↔ background**: `RuntimeAgent` over `chrome.runtime.sendMessage`
- **Background ↔ bridge host**: `MessagingAgent` over `postMessage` inside the hidden iframe

The bridge host exists specifically to route API calls from the page world through the extension's fetch permissions, avoiding CORS restrictions on the target page's origin.

### Enable/disable lifecycle

1. User clicks extension icon → `chrome.action.onClicked` in `background.ts`
2. Background flips `chrome.storage.local` key `enabled`, swaps toolbar icon, sends `enable` intent to active tab via `RuntimeAgent`
3. Content script receives intent, injects `capture.js` (page world) and `bridgeHost.html` iframe in parallel
4. Page script defines `<repro-capture>` custom element (if not already defined), appends to `document.body`
5. Custom element `connectedCallback` creates Shadow DOM, mounts React tree, creates `RecordingStream`

---

## Recording Phase

### `RecordingStream` (`packages/recording/src/createRecordingStream.ts`)

The core recording engine. Created once per page load in `apps/capture/src/index.tsx`:

```ts
createRecordingStream(document, {
  types: new Set([
    "dom",
    "interaction",
    "network",
    "console",
    "performance",
    "state",
  ]),
});
```

Calling `stream.start()` activates all observers. The stream is **lazy** — no observation happens until `start()`.

### Internal storage

- **Ring buffer**: `createBuffer<DataView>(32 MB)` from `packages/buffer-utils/src/createBuffer.ts`. All events are binary-encoded (`SourceEventView.encode`) and pushed as `DataView` entries.
- **`leadingSnapshot`**: mutated by replaying evicted events when the ring buffer rolls over. Always represents the oldest reconstructable state.
- **`trailingSnapshot`**: mutated in-place by every observer callback. Always represents the live current state.
- **Periodic snapshot**: `setInterval` (default 10 s) re-inserts a full `SnapshotEvent` if the last event isn't already one. These are seek checkpoints used by the playback seek algorithm.

### Observer pipeline

`start()` builds an initial VTree snapshot via `createDOMTreeWalker`, writes a `SnapshotEvent`, then activates six observers:

| Observer        | Package                                                   | Mechanism                                                                                                     | What it captures                                                                                                  |
| --------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **DOM**         | `packages/recording/src/dom/observe.ts`                   | `MutationObserver` + `CSSStyleSheet.prototype` monkey-patch + `input`/`change` listeners                      | Node add/remove, attribute changes, text changes, stylesheet rule mutations, form input values                    |
| **Interaction** | `packages/recording/src/interaction/observe.ts`           | Native DOM events (rate-limited via `sampleEventsByKey`)                                                      | Pointer move/down/up, click, double-click, scroll, resize, key down/up, page navigation (`popstate`/`hashchange`) |
| **Network**     | `packages/recording/src/network/observe.ts`               | XHR constructor proxy, `fetch` proxy, `WebSocket` constructor proxy + `MessageEvent.data` descriptor override | XHR/Fetch request+response pairs, WebSocket open/send/receive/close                                               |
| **Console**     | `packages/recording/src/console/observe.ts`               | `console.*` method proxies + `window.onerror`/`unhandledrejection`                                            | log/info/warn/error/debug, uncaught errors, unhandled rejections (with async stack traces via `stacktrace-js`)    |
| **Performance** | `packages/recording/src/performance/observe.ts`           | `PerformanceObserver` for `resource` entries                                                                  | Resource timing data                                                                                              |
| **State**       | `packages/recording/src/state/react.ts`, `state/redux.ts` | `__REACT_DEVTOOLS_GLOBAL_HOOK__.onCommitFiberRoot`; Redux middleware detection                                | React fiber commit diffs (props delta per component), Redux action/state patches                                  |

Every observer callback:

1. Mutates `trailingSnapshot` to keep it current
2. Calls `SourceEventView.encode(new Box({ type, time: performance.now(), data }))` to produce a `DataView`
3. Pushes the `DataView` to the ring buffer

**Buffer eviction**: when the 32 MB ceiling is hit, `requestIdleCallback` evicts the oldest entries. Each evicted non-snapshot event is replayed into `leadingSnapshot` via `applyEventToSnapshot` (from `packages/source-utils`), so the leading snapshot always stays reconstructable.

### Recording modes

The `$recordingMode` atom (in `apps/capture/src/state/createState.ts`) drives data collection in `Controller.tsx`:

| Mode         | `RecordingMode` value    | Collection method                                                                                                                              | Returns                           |
| ------------ | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| **Replay**   | `RecordingMode.Replay`   | `stream.slice()` — copies ring buffer, sorts by time, normalises offsets, prepends leading snapshot                                            | `List<SourceEventView>`           |
| **Snapshot** | `RecordingMode.Snapshot` | `stream.snapshot()` — deep-copies `trailingSnapshot` as a single `SnapshotEvent` at t=0                                                        | `List<SourceEventView>` (1 event) |
| **Live**     | `RecordingMode.Live`     | `stream.tail(InterruptSignal)` — RxJS Observable of events; clicking Done fires `interrupt()`, completes Observable, collected via `toArray()` | `List<SourceEventView>`           |

---

## Playback Phase

### `Playback` interface (`packages/playback/src/types.ts`)

After `Controller.tsx` collects `List<SourceEventView>`, it calls `createSourcePlayback(events, duration, {})` and passes the result to `<PlaybackProvider>`. The `Playback` object is the contract between the recording engine and the rendering layer.

Key reactive atoms (from `@repro/atom`):

| Atom                  | Type                          | Purpose                                                                          |
| --------------------- | ----------------------------- | -------------------------------------------------------------------------------- |
| `$elapsed`            | `Atom<number>`                | Current time cursor (ms)                                                         |
| `$playbackState`      | `Atom<PlaybackState>`         | `Playing \| Paused`                                                              |
| `$snapshot`           | `Atom<Snapshot>`              | Reconstructed state (VTree + interaction + network/console/perf data)            |
| `$buffer`             | `Atom<List<SourceEventView>>` | Events processed in the latest tick (drives incremental DOM patches)             |
| `$latestControlFrame` | `Atom<ControlFrame>`          | `SeekToEvent \| SeekToTime \| Flush` — signals renderer to do a full DOM rebuild |
| `$activeIndex`        | `Atom<number>`                | Index of the current event in the source list                                    |
| `$latestEventTime`    | `Atom<number>`                | Timestamp of the last event (used for loading state)                             |

### Seek algorithm (`createSourcePlayback.ts`)

The seek algorithm avoids full replay from the start on every seek:

1. `buildSnapshotIndex()` pre-scans all events once, building an array of indices pointing to `SnapshotEvent` entries.
2. On `seekToTime(ms)` or `seekToEvent(index)`:
   - Walk `snapshotIndex` backwards to find the nearest preceding snapshot checkpoint
   - Load all events from that checkpoint forward
   - Call `partitionEvents(...)` to split at the seek target: "before" events are applied to the snapshot, "after" events remain queued
   - Apply the "before" partition via `applyEventToSnapshot` (from `packages/source-utils`)
   - Set `$snapshot`, `$elapsed`, `$activeIndex`, `$latestControlFrame = SeekToEvent/SeekToTime`

### Playback loop

When `$playbackState` is `Playing`, an `animationFrames()` RxJS observable drives `$elapsed` forward using delta time. A resync loop polls every 100 ms to append new events to the source `List` (supports live-streaming). `$elapsed` changes trigger `partitionEvents` to advance `$buffer` and `$snapshot`.

### `createLivePlayback` (`packages/playback/src/createLivePlayback.ts`)

Implements the same `Playback` interface for a live Observable stream. Skips until the first `SnapshotEvent`, then applies each event immediately — no buffering, no seek support. Used for the Live recording mode preview in the widget.

---

## DOM Rendering (`packages/playback/src/PlaybackCanvas/`)

`PlaybackCanvas.tsx` renders an `<iframe>` via `<FrameRealm>` and passes its `contentDocument` to `NativeDOMRenderer.tsx`.

`NativeDOMRenderer.tsx` subscribes to three streams from the `Playback` object:

1. **`$latestControlFrame` (not Idle)** → full DOM rebuild:
   - `createDOMFromVTree(...)` reconstructs live DOM nodes from the VTree
   - `clearDocument(ownerDocument)` wipes the iframe document
   - `patchDocumentElement(...)` applies document-level patches
   - `updateAllScrollStates(nodeMap, scrollMap)` restores all scroll positions
   - `updateHoverTargets(doc, pointer)` adds `HOVER_CLASS` to elements under the recorded pointer

2. **`$buffer`** → incremental event application:
   - `SourceEventType.DOMPatch` → `applyDOMPatchEvent(event, ownerDocument, nodeMap, ...)` from `packages/vdom-renderer`
   - `SourceEventType.Interaction` → `applyInteractionEvent(event, nodeMap, elapsed, trackScroll)` for scroll updates

3. **`$snapshot`** (pointer changes only) → `updateHoverTargets(doc, pointer)`

`PointerOverlay.tsx` renders a separate cursor layer above the iframe for mouse pointer visualisation.

`PlaybackCanvas` renders a loading spinner until both `loaded` (nodeMap built) and `!waitingForEvents` (`elapsed ≤ latestEventTime`).

---

## Upload Flow

### In-page serialisation (`apps/capture/src/components/Widget/PostRecordingSurface/useRecordingActions.ts`)

1. `playback.getSourceEvents()` → `List<SourceEventView>`
2. `getSelectedRecording()` centralizes the selected recording for upload and local download. The capture extension's Agentic panel was removed in REP-1702; this selection helper remains shared by those recording actions.
3. For Replay mode, trim to user-selected duration via `sliceEventsAtRange(events, [minTime, maxTime])`; expose `startTimeMs` as the same source-time offset used by slice normalization (the leading snapshot timestamp after applying leading events), and expose `duration` as `maxTime - startTimeMs`.
4. Serialise each `DataView` to base-64 byte string: `toByteString(new Uint8Array(view.buffer, ...))`
5. Raise `agent.raiseIntent({ type: 'upload:enqueue', payload: { projectId, title, description, url, mode, duration, events: string[] } })`
6. Message travels: postMessage → content script → `chrome.runtime.sendMessage` → background service worker

### Upload worker (`packages/recording-api/src/createUploadWorker.ts`)

Runs a serial queue (one upload at a time):

1. **`createRecording`** — POST `/projects/{id}/recordings` → receives `RecordingInfo` with recording ID
2. **`saveEvents`** (parallel with `saveResources`):
   - Re-encode events via `SourceEventView.encode`, pack into binary vector via `toBinaryWireFormat` (from `packages/wire-formats`)
   - `gzipSync` compress
   - PUT to `/projects/{projectId}/recordings/{recordingId}/data` (`Content-Type: application/octet-stream`)
   - Write JSON event index (byte offsets + timestamps) to `.../event-index`
3. **`saveResources`** (parallel with `saveEvents`):
   - Scan events via `createResourceMap` to find referenced asset URLs
   - Fetch each asset from origin (`apiClient.fetch(url, {}, 'binary')`)
   - PUT each to `.../resources/{resourceId}`
   - Write resource map JSON to `.../resource-map`

Progress is tracked in `progressMap` (keyed by upload `ref`). The widget polls every 250 ms via `upload:progress` intent to update `ProgressOverlay`.

---

## The Binary Codec

`SourceEventView` (generated in `packages/domain/generated/event.ts`) is the **single artifact** that flows through the entire pipeline — from observer callback to wire format to DOM renderer. It is a `@repro/tdl`-based binary codec.

```
Observer callback
  → SourceEventView.encode(event) → DataView
  → ring buffer
  → stream.slice() / .snapshot() / .tail()
  → List<SourceEventView>
  → createSourcePlayback(events)
  → $buffer atom → NativeDOMRenderer (incremental patches)
  → $snapshot atom → NativeDOMRenderer (full rebuild)
  → toByteString() → upload:enqueue intent
  → gzipSync(toBinaryWireFormat(...)) → PUT /recordings/{id}/data
```

The `Snapshot` type (from `packages/domain`) is the shared state currency: mutated in-place during recording (`trailingSnapshot`), rebuilt at seek points during playback (`applyEventToSnapshot`).

---

## Package Responsibility Map

| Package                   | Responsibility                                                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/capture`            | Extension entry points, UI widget, `RecordingStream` wiring, upload serialisation                                                            |
| `packages/recording`      | `RecordingStream`, all six observers, `createBuffer` wiring, snapshot management                                                             |
| `packages/buffer-utils`   | Generic ring buffer (`createBuffer`) with eviction callbacks                                                                                 |
| `packages/observer-utils` | Shared observer utilities (rate-limiting, proxy helpers)                                                                                     |
| `packages/playback`       | `Playback` interface, `createSourcePlayback`, `createLivePlayback`, `PlaybackCanvas`, `PlaybackEditor`, `NativeDOMRenderer`                  |
| `packages/source-utils`   | `applyEventToSnapshot` — the reducer that reconstructs a `Snapshot` from a stream of events                                                  |
| `packages/vdom-renderer`  | `applyDOMPatchEvent`, `createDOMFromVTree` — live DOM mutation from VTree patches                                                            |
| `packages/recording-api`  | `createUploadWorker`, `createApiClient` — API integration for upload                                                                         |
| `packages/wire-formats`   | `toBinaryWireFormat`, `fromBinaryWireFormat` — binary packing of event lists                                                                 |
| `packages/domain`         | `SourceEventView` codec, `SourceEventType` enum, `Snapshot` type, all event types, `ListResponse<T>`, DOM/VTree patches — see TDL note below |
| `packages/messaging`      | `createMessagingAgent` — postMessage bus with routing and tab linking                                                                        |

---

## Key Files Quick Reference

| File                                                         | Key exports                                                               |
| ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `apps/capture/src/index.tsx`                                 | `ReproCapture` custom element, `createRecordingStream` wiring             |
| `apps/capture/src/extension/background.ts`                   | `toggleEnabledState`, `upload:enqueue` handler                            |
| `apps/capture/src/extension/content.ts`                      | `initializePageHost`, `initializeBridgeHost`                              |
| `apps/capture/src/state/createState.ts`                      | `$readyState`, `$recordingMode` atoms                                     |
| `apps/capture/src/components/Widget/Widget.tsx`              | Post-recording surface composition trigger                                |
| `apps/capture/src/components/Widget/PostRecordingSurface/useRecordingActions.ts` | Shared selected recording, upload, download, and event serialisation orchestration |
| `packages/recording/src/createRecordingStream.ts`            | `createRecordingStream`, `start`, `stop`, `slice`, `snapshot`, `tail`     |
| `packages/recording/src/dom/observe.ts`                      | `createDOMObserver`                                                       |
| `packages/recording/src/interaction/observe.ts`              | `createInteractionObserver`                                               |
| `packages/recording/src/network/observe.ts`                  | `createXHRObserver`, `createFetchObserver`, `createWebSocketObserver`     |
| `packages/buffer-utils/src/createBuffer.ts`                  | `createBuffer<T>(maxSizeInBytes)`                                         |
| `packages/playback/src/createSourcePlayback.ts`              | `createSourcePlayback`, `seekToTime`, `seekToEvent`, `buildSnapshotIndex` |
| `packages/playback/src/createLivePlayback.ts`                | `createLivePlayback`                                                      |
| `packages/playback/src/types.ts`                             | `Playback` interface, `PlaybackState`, `ControlFrame`                     |
| `packages/playback/src/PlaybackCanvas/NativeDOMRenderer.tsx` | Full rebuild + incremental patch rendering                                |
| `packages/source-utils/src/mutations/index.ts`               | `applyEventToSnapshot`                                                    |
| `packages/recording-api/src/createUploadWorker.ts`           | `createUploadWorker`, `saveEvents`, `saveResources`                       |
| `packages/domain/generated/event.ts`                         | `SourceEventView`, `SourceEventType`, all event types                     |
| `packages/domain/generated/vdom.ts`                          | `DOMPatch`, `PatchType`, `VTree`, all VNode and patch codecs              |

---

## Domain Schema Warning

All types in `packages/domain/generated/*.ts` are **auto-generated from `.tdls` files**. The pipeline is:

```
packages/domain/src/*.tdls  →  tdlc  →  packages/domain/generated/*.ts
```

**Never edit generated files directly.** Changes will be overwritten on the next `tdlc` run. Instead:

1. Edit the corresponding `.tdls` schema file (e.g. `vdom.tdls` for patch types).
2. Run `pnpm run build` in `packages/domain` (which runs `tdlc src --outdir generated`).
3. The generated `.ts` files will be updated with correct codecs and type definitions.

When adding a new **patch type** that should be part of an existing union (e.g. a new `DOMPatch` variant):

1. Define the struct in the relevant `.tdls` file.
2. Add it to the parent union (e.g. `DOMPatch` union in `vdom.tdls`).
3. Add the enum value to `PatchType` in the same `.tdls` file.
4. Regenerate with `pnpm run build`.
5. Remove any hand-written interfaces that the generated code now replaces — update imports accordingly.

Cross-file imports within `packages/domain/src/*.tdls` are supported. If a type in `css.tdls` needs to be referenced in `vdom.tdls`, it can be imported.

Hand-written files like `css.ts`, `account.ts`, `project.ts` are for **domain interfaces that are NOT serialised through TDL codecs**. If a type needs to be in a wire format (sent over the network or persisted), it must be defined in `.tdls`.
