---
name: dev-toolbar
description: Browser-extension and standalone-toolbar workflows for the Dev Toolbar.
---

# Dev Toolbar Skill

Load this skill when working in `apps/dev-toolbar` — the browser extension and standalone toolbar that provides in-page recording controls and the DevTools panel.

## Dual-mode build system

`apps/dev-toolbar` produces two distinct output modes, controlled by the `MODE` env var:

| `MODE`                | Entry selected by `VITE_ENTRY`  | Output                                     |
| --------------------- | ------------------------------- | ------------------------------------------ |
| `extension` (default) | `background`, `content`, `page` | Chrome extension (3 separate IIFE bundles) |
| `standalone`          | `toolbar-standalone`            | Embeddable standalone toolbar bundle       |

Each build target is a separate `vite build` invocation. The `VITE_ENTRY` env var selects exactly one entry; Vite throws if it is missing or invalid. All outputs use IIFE format with `inlineDynamicImports: true` (everything in one file).

React is only included when `VITE_ENTRY` is `page` or `toolbar-standalone` — background and content scripts do not pull in React.

## Extension architecture (3 bundles)

```
background.ts   ← Service worker / background page
    ↕ chrome.runtime messaging
content.ts      ← Content script injected into every page
    ↕ window.postMessage / chrome.runtime
page (index.tsx) ← Injected into the page by content.ts
    — renders ReproDevToolbar custom element
```

### background.ts

Manages extension lifecycle state in `chrome.storage.local` using three keys:

| `StorageKeys` key                 | Purpose                            |
| --------------------------------- | ---------------------------------- |
| `INSTALLER_ID` / `'installed_id'` | Tracks first-run state             |
| `ENABLED` / `'enabled'`           | Whether the toolbar is active      |
| `RECORDING` / `'recording'`       | Whether a recording is in progress |

Key behaviours:

- On first install (`isFirstRun()`), automatically enables the toolbar.
- Clicking the extension icon toggles enabled state, then syncs the active tab.
- On tab navigation (`changeInfo.status === 'loading'`), re-syncs the toolbar into the tab.
- All async work uses `FutureInstance` via `run(future)` — not Promises.

### content.ts

Injected into every matching page by the manifest. It:

1. Creates a `createMessagingAgent` (postMessage bridge) and a `createRuntimeAgent` (chrome.runtime bridge).
2. Injects `page.js` as a `<script>` tag via `addPageScript()` when the extension is enabled.
3. Bridges messages between the page world and the extension background.

### page / ReproDevToolbar custom element

`ReproDevToolbar` is a **custom element** (`<repro-dev-toolbar>`). It:

- Creates a **Shadow DOM** for style isolation.
- Handles jsxstyle's CSS-in-JS via `styleCache.injectOptions({ onInsertRule })` — rules are inserted into a `<style>` tag inside the shadow root rather than `<head>`.
- The `refs.activeStyleRoot` sentinel must be set before rendering — jsxstyle uses it as the injection target.
- Calls `styleCache.reset()` on connect to prevent multiple invocations of `cache.injectOptions`.
- Starts recording immediately if `dataset.recording === 'true'`.
- Ignores the `<repro-dev-toolbar>` node itself (and its shadow root) in the recording stream to prevent self-recording.

```
Shadow DOM
├── <style>          ← jsxstyle CSS-in-JS rules injected here
└── <div#toolbar-root>
    └── React tree:
        PortalRootProvider
        └── RecordingStreamProvider
            └── StateProvider
                └── MessagingProvider
                    └── Controller
```

## Attach / detach lifecycle

Two module-level functions control embedding:

```ts
attach(recording?: boolean): FutureInstance<Error, void>
// Registers the custom element if needed, creates instance, appends to <body>.
// Safe to call multiple times — no-ops if element is already present.
// Pass recording=true to start capturing immediately.

detach(): void
// Removes the element from the document.
```

## Messaging layer (`createRuntimeAgent`)

`createRuntimeAgent` wraps `chrome.runtime.sendMessage` / `chrome.runtime.onMessage` as an `Agent` interface:

```ts
const agent = createRuntimeAgent()

// Send a message to the background page, returns a Future
agent.raiseIntent<ResponseType>(intent, options?)

// Register a handler for incoming intents (in background.ts)
agent.subscribeToIntent(type, resolver)

agent.destroy()  // Unregister all listeners
```

Only `http://` and `https://` URLs are supported (`isSupportedURL` check). Chrome extension pages (`chrome-extension://`) are excluded.

## UI state (`createState` / `StateContext`)

The toolbar's React state is minimal:

```ts
interface State {
  selectedEvent: ...  | null
  selectedIndex: number | null
  visiblePane: 'event-log' | 'instant-replay' | 'playback' | null
}
```

`createState()` returns observable atoms. The state object is created once inside `ReproDevToolbar` and passed down via `StateProvider`. Use `hooks.ts` hooks to read state in components.

## Panels / panes

| Pane directory       | Purpose                                           |
| -------------------- | ------------------------------------------------- |
| `EventLogPane/`      | Live event log during recording                   |
| `InstantReplayPane/` | Instant-replay playback of recent events          |
| `PlaybackPane/`      | Full playback of a saved recording                |
| `Toolbar/`           | The toolbar chrome (record button, pane switcher) |

`Controller.tsx` is the root component that renders the correct pane based on `visiblePane` state.

## Gotchas

- **jsxstyle in Shadow DOM**: jsxstyle's default behaviour injects styles into `document.head`. Inside a Shadow DOM this breaks because Shadow DOM has its own style scope. Always use `styleCache.injectOptions({ onInsertRule })` and redirect rules to the shadow root's `<style>` element. `styleCache.reset()` must be called before `injectOptions` on reconnect.
- **Three separate builds**: Never import background-only or content-only modules into the page entry, and vice versa. Check `vite.config.ts` `extensionEntries` to understand what each bundle includes.
- **IIFE + inlineDynamicImports**: Dynamic imports are not supported — all code is statically bundled. Avoid `import()` in toolbar code.
- **Recording exclusion**: The toolbar element and its shadow root must be in `ignoredNodes` when constructing `createRecordingStream`, or the toolbar's own DOM mutations will appear in the recording stream.
- **Standalone mode**: When `MODE=standalone`, the toolbar runs without the extension infrastructure. The `agent` is a page-scoped `createMessagingAgent` rather than `createRuntimeAgent`. Use standalone mode for local development of the toolbar UI.
