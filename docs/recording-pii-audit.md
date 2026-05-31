# REP-972: Recording Capture Channels PII Audit Report

**Date:** 2026-05-31
**Author:** REP-972 implementation agent
**Scope:** All recording observer channels in `packages/recording/src/` and corresponding domain types in `packages/domain/src/`
**Status:** Complete — no code changes, documentation only
**Reference:** REP-710 (privacy policy) not found in codebase; PII classification based on industry standards

---

## Table of Contents

1. [DOM Channel](#1-dom-channel)
2. [Network Channel](#2-network-channel)
3. [Console Channel](#3-console-channel)
4. [Interactions Channel](#4-interactions-channel)
5. [Performance Channel](#5-performance-channel)
6. [State (Framework) Channel](#6-state-framework-channel)
7. [Custom Mark Channel](#7-custom-mark-channel)
8. [Three-Tier Classification Model](#8-three-tier-classification-model)
9. [Dormant Channels](#9-dormant-channels)
10. [Cross-Cutting Risks](#10-cross-cutting-risks)
11. [Follow-Up Implementation Work](#11-follow-up-implementation-work)
12. [Risk Areas & Caveats](#12-risk-areas--caveats)

---

## 1. DOM Channel

### Source Files
- `packages/recording/src/dom/observe.ts` — `createDOMObserver()`, `internal__processMutationRecords()`, `createInputObserver()`, `createStyleSheetObserver()`
- `packages/recording/src/dom/factory.ts` — `createVNode()`, `createVElement()`, `createVText()`
- `packages/recording/src/dom/utils.ts` — `walkDOMTree()`, `isIgnoredByNode()`, `isIgnoredBySelector()`, `isMaskedBySelector()`

### Domain Types
- `vdom.tdls`: `VElement` (tagName, attributes, properties: {value, checked, selectedIndex}), `VText` (value), `VDocument`, `VDocType`, `VTree`, all `DOMPatch` variants
- `snapshot.tdls`: `Snapshot.dom: ?VTree`

### What Is Captured Verbatim

| Data | Detail | Mechanism |
|------|--------|-----------|
| Full DOM tree (VTree) | All elements, text nodes, attributes, document structure — serialised on snapshot and incrementally patched | `MutationObserver` with `subtree: true, childList: true, attributes: true, characterData: true` |
| Element attributes | All attributes except inline event handlers (filtered in `factory.ts:85`) | `AttributePatch` emitted on every attribute mutation |
| Text content | All `Text.data` values via `characterData` mutations | `TextPatch` emitted on text changes |
| Input values | `value`, `checked`, `selectedIndex` — both initial state and changes | Property descriptor overrides on `HTMLInputElement.prototype.value/checked`, `HTMLSelectElement.prototype.value/selectedIndex`, `HTMLTextAreaElement.prototype.value` + `"input"` event listener |
| CSS rule text | Inserted/removed rule CSS text captured verbatim via `CSSStyleSheet.insertRule`/`deleteRule` monkey patches | `createStyleSheetObserver()` emits `AddNodes`/`RemoveNodes` patches with `VText.value = rule.cssText` |
| Iframe content | Iframe `contentDocument` is walked as part of the same tree; all DOM observers fire on it | `createIFrameVisitor()` pushes iframe documents into `sourceDocuments` |

### Existing Masking

| Mask | Location | Detail |
|------|----------|--------|
| `maskedSelectors` | `dom/observe.ts:73-84`, `dom/factory.ts:88-94,107-115,153-155` | Selector-based masking via `element.closest(selector)`. Applies to: attribute values named `"value"`, `TextProperty` patches, text values in `characterData`, initial `VText.value` in `createVText()`. Uses `redactStringPreservingWhitespace()` which replaces each non-whitespace char with `*`. |
| Password auto-mask | `dom/observe.ts:75-76,82-85`, `dom/factory.ts:109-110` | Elements with `type === 'password'` are automatically added to a `maskedInputs` WeakSet on any `input` event, then their values are redacted. Initial `createVElement()` also checks for password type on input elements. |
| `ignoredNodes` | `dom/observe.ts:239-241,312-316,342-347` | Node references whose subtrees are excluded from mutation processing |
| `ignoredSelectors` | `dom/observe.ts:243-245,312-316,342-347` | CSS selectors for elements whose subtrees are excluded |
| Script exclusion | `dom/utils.ts:37-39` | `<script>` elements are skipped during tree walk |
| Inline event filtering | `dom/factory.ts:85` | Attributes matching inline event handler names (e.g., `onclick`) are excluded from `VElement.attributes` |
| Local stylesheet skip | `dom/utils.ts:49-51` | `<style>` CSS rules are already captured via `createStyleSheetObserver()`, so the tree walk skips them to avoid duplication |

### PII/Sensitive-Data Surfaces

| Surface | Risk | Explanation |
|---------|------|-------------|
| All text content | **High** — uncontrolled | Every `VText.value` and every `characterData` mutation is captured. User profile names, addresses, messages, financial data, medical info in rendered text are recorded. Only `maskedSelectors` provides opt-in protection. |
| Element attributes | **High** — uncontrolled | All HTML attributes (except inline event handlers) are captured. Custom data attributes (`data-*`), `aria-label`, `title`, `alt`, `href` values all go through unprotected. |
| Form input values | **High** — partially masked | Password inputs auto-masked; other form values (credit card numbers, SSNs, search queries) only masked if the element matches a `maskedSelector`. No default pattern-based masking. |
| Iframe content | **High** | Iframes are recursively walked — all text and attributes are captured just like the main document. Third-party iframe content (embeds, ads, payment iframes) is captured. |
| CSS rule text | **Medium** | Custom property values, URL references in CSS, or data URIs in stylesheets are captured verbatim. |
| `VElement.properties` | **High** | `value`, `checked`, `selectedIndex` on form elements captured separately from attributes. Password values redacted, but maskedSelector config is the only other guard. |

### Risk Rating: **High**

The DOM channel captures the entire page content — text, attributes, form values, CSS — with only selector-based or password-type masking. There is no automatic PII detection or pattern-based redaction for common sensitive data patterns.

---

## 2. Network Channel

### Source Files
- `packages/recording/src/network/observe.ts` — `createNetworkObserver()`, `createXHRObserver()`, `createFetchObserver()`, `createWebSocketObserver()`

### Domain Types
- `network.tdls`: `FetchRequest` (url, method, headers, body), `FetchResponse` (status, headers, body), `WebSocketOpen` (url), `WebSocketClose`, `WebSocketInbound`/`WebSocketOutbound` (data: buffer, messageType)

### What Is Captured Verbatim

| Data | Detail | Mechanism |
|------|--------|-----------|
| Fetch request URL, method, headers, body | Full request metadata + body up to 1 MB | Proxy on `globalThis.fetch` via `Proxy` handler |
| XHR request URL, method, headers, body | Full request metadata + body up to 1 MB | Proxy on `XMLHttpRequest` constructor + `open/setRequestHeader/send` prototype proxies |
| Fetch response status, headers, body | Full response metadata + body up to 1 MB | `.clone()` + `.arrayBuffer()` on fetch response |
| XHR response status, headers, body | Full response metadata + body up to 1 MB | `readystatechange` handler captures response at DONE state |
| WebSocket open/close events | URL captured on open | Constructor proxy + property overrides |
| WebSocket outbound messages | Text and binary data captured verbatim | `WebSocket.prototype.send` proxy |
| WebSocket inbound messages | Text and binary data captured verbatim | `MessageEvent.prototype.data` getter interceptor |

### Existing Masking

| Mask | Location | Detail |
|------|----------|--------|
| `redactHeaders()` | `redaction.ts:60-69` | Masks values for keys matching `SENSITIVE_HEADER_NAMES` set: `authorization`, `cookie`, `set-cookie`. Applied to both request and response headers in XHR, Fetch, and WebSocket paths. |
| Body size truncation | `network/observe.ts:125,243,308,358` | Request/response bodies exceeding `MAX_BODY_BYTE_LENGTH` (1,000,000 = ~1 MB) are replaced with `EMPTY_ARRAY_BUFFER`. Truncation applies to both request and response bodies. |

### PII/Sensitive-Data Surfaces

| Surface | Risk | Explanation |
|---------|------|-------------|
| JSON request/response bodies | **Very High** — unmasked | Bodies are captured as raw `ArrayBuffer`. No attempt to parse JSON, inspect content, or apply PII redaction. User data, secrets, API keys, auth tokens, credit card numbers in API payloads are captured verbatim. |
| URL query parameters | **High** — unmasked | URLs are captured as strings (`req.url`), meaning query parameters (e.g., `?token=abc&session=xyz`) are captured verbatim. No query-string parsing or redaction. |
| WebSocket text messages | **Very High** — unmasked | Every `WebSocketInbound` and `WebSocketOutbound` with `messageType: Text` captures the data buffer verbatim. Chat messages, real-time updates, auth handshake data. |
| Non-standard auth headers | **High** — unmasked | Only `authorization`, `cookie`, and `set-cookie` header names have their values masked. Any custom auth header (e.g., `X-API-Key`, `x-auth-token`) passes through unmasked. |
| WebSocket URL | **Medium** | WebSocket URL is captured on open — may contain query parameters with session identifiers. |
| Response bodies containing PII | **Very High** | `FetchResponse.body` and XHR response bodies include full API response payloads (user data, financial info, etc.) with no content inspection. |

### Risk Rating: **High**

The network channel captures all request/response bodies and URLs with minimal masking (headers only). Body content is completely unexamined for PII. 1 MB truncation prevents very large payloads but does not help with PII within the size limit.

---

## 3. Console Channel

### Source Files
- `packages/recording/src/console/observe.ts` — `createConsoleObserver()`

### Domain Types
- `console.tdls`: `ConsoleMessage` (level, parts: vector of `MessagePart`, stack: vector of `StackEntry`)
- `MessagePart` variants: `StringMessagePart` (value: string), `NodeMessagePart` (node: ?VNode), `UndefinedMessagePart`, `DateMessagePart`
- `StackEntry` (functionName, fileName, lineNumber, columnNumber)

### What Is Captured Verbatim

| Data | Detail | Mechanism |
|------|--------|-----------|
| `console.log/info/warn/error/debug` arguments | Each argument is serialised into a `MessagePart` | Proxy on each console method |
| String arguments | Serialised via `safeSerialize()` which calls `JSON.stringify(redactConsoleValue(value))` | String parts become `StringMessagePart` |
| DOM node arguments | Serialised as `NodeMessagePart` with full `VNode` tree | `createVNode()` from factory |
| Date arguments | Serialised with all date/time fields | Dedicated `DateMessagePart` |
| Error stacks | Extracted via `stacktrace-js` | `StackEntry[]` includes file paths, line/column numbers |
| Uncaught errors (`window.onerror`) | Error message string + stack trace | `catchError()` handler |
| Unhandled promise rejections | Serialised reason + stack | `catchUnhandledRejection()` handler |

### Existing Masking

| Mask | Location | Detail |
|------|----------|--------|
| `redactConsoleValue()` | `console/observe.ts:55` + `redaction.ts:71-73` | Applies `redactUnknown()` which recursively traverses objects and masks string values matching `SENSITIVE_FIELD_PATTERN` and values matching `SECRET_VALUE_PATTERN`. Masks values under sensitive keys (key pattern match). Replaces matching values with `[MASKED]`. |
| Circular reference guard | `redaction.ts:39-43` | Uses `WeakSet<object>` to detect and mask circular references. |
| DOM node maskedSelector support | `console/observe.ts:115` | When a DOM node is logged, `createVNode()` is called with `maskedSelectors`, so maskedSelectors are respected for console-logged DOM nodes. |
| Stack trace filter | `console/observe.ts:33-35` | Frames from `chrome-extension://` are excluded. |

### PII/Sensitive-Data Surfaces

| Surface | Risk | Explanation |
|---------|------|-------------|
| User objects under benign keys | **High** — bypasses redaction | `redactUnknown()` only masks values whose object key name matches `SENSITIVE_FIELD_PATTERN`. If an object `{user: {email: "..."}}` is logged, the key `"user"` does not match the pattern so the entire subtree is walked recursively but no value is masked — it requires a matching key at *some* depth. Actually, since the redactor recurses deeply, it would eventually check keys at every level, but nested values like an email string under a `user.name` key would not be masked because `name` is not in `SENSITIVE_FIELD_PATTERN`. |
| Error messages with PII | **Medium** | Error message strings (from `ev.message` in catchError) are serialised via `safeSerialize()` which only applies console value redaction. The message string itself is not inspected. If an error message contains PII (e.g., "User email@example.com not found"), it passes through. |
| Stack trace file paths | **Low** | `fileName` in `StackEntry` is a string path which could contain usernames or project paths with organisational info. Stack trace filter only removes `chrome-extension://` frames. |
| Serialised error objects | **Medium** | `serialize-error` library converts Error objects to `{name, message, stack}`. The `message` field is then serialised via `safeSerialize()` — no additional PII scanning on the message text. |

### Risk Rating: **Medium**

The console channel has the most sophisticated redaction of all channels — recursive object traversal with key-based value masking. However, it only masks values under specific key names and does not scan string values (error messages, log output) for PII patterns. The `NodeMessagePart` path passes through `createVNode()` which does apply `maskedSelectors`.

---

## 4. Interactions Channel

### Source Files
- `packages/recording/src/interaction/observe.ts` — Full set of interaction observers

### Domain Types
- `interaction.tdls`: `ViewportResize` (from, to, duration), `Scroll` (target, from, to, duration), `PointerMove` (from, to, duration), `PointerDown`/`PointerUp` (targets, at), `Click`/`DoubleClick` (button, targets, at, meta: {node: VElement, humanReadableLabel}), `KeyDown`/`KeyUp` (key), `PageTransition` (from, to)

### What Is Captured Verbatim

| Data | Detail | Mechanism |
|------|--------|-----------|
| Pointer coordinates | `clientX`/`clientY` adjusted for iframe offset | `pointermove`, `pointerdown`, `pointerup` event listeners |
| Click/double-click metadata | Full `VElement` snapshot of the clicked element, button, targets, human-readable label | `createClickObserver()` captures `createVElement(target)` with full attributes/text |
| Scroll positions | `scrollLeft`/`scrollTop` per scrollable element | `scroll` event sampling |
| Viewport dimensions | `innerWidth`/`innerHeight` | `resize` event sampling |
| Key identifiers | `evt.key` for non-form-input keydown/keyup | `shouldCaptureKeyEvent()` suppresses keys when form inputs are focused |
| Page navigation URLs | `globalThis.location.href` | `popstate`/`hashchange` events + initial capture |

### Existing Masking

| Mask | Location | Detail |
|------|----------|--------|
| `maskedSelectors` on click labels | `interaction/observe.ts:307-311` | For `<a>` and `<button>` elements, the `humanReadableLabel` field is set to `MASKED_VALUE` if the element matches a masked selector. This only applies to the label, not the full VElement. |
| `maskedSelectors` on click VElement | `interaction/observe.ts:321-323` | `createVElement()` is called with `maskedSelectors` for click targets, which propagates to `createVElement`'s internal masking. |
| `ignoredNodes`/`ignoredSelectors` on click targets | `interaction/observe.ts:296-300` | Click/dblclick events on ignored elements are dropped entirely. |
| Key suppression on form inputs | `interaction/observe.ts:376-383` | `KeyDown`/`KeyUp` events are only captured when the active element is NOT a text input, select, or textarea. This prevents capturing typed characters in form fields. |

### PII/Sensitive-Data Surfaces

| Surface | Risk | Explanation |
|---------|------|-------------|
| Click target VElement | **High** — full element snapshot | `createVElement(target)` captures all attributes and (via tree walk context) text content. While `maskedSelectors` is passed through, the VElement includes all HTML attributes (including `data-*`, `aria-label`, `title`, `href`, class names) and the element structure. A click on a user profile element exposes all its attributes. |
| Button/link labels | **Medium** — partially masked | Labels are redacted for masked elements, but the underlying `VElement` still contains the full attributes including text-like attributes. |
| Page URLs | **Medium** | `globalThis.location.href` is captured via `PageTransition` — may contain query parameters with tokens, session IDs, or user identifiers. |
| Scroll positions | **Low** | Scroll positions reveal which content a user viewed. |

### Risk Rating: **Medium**

Interaction events include snapshots of clicked elements (full VElement with attributes) and page URLs. Key events on input fields are suppressed, but click targets carry rich DOM data that `maskedSelectors` mitigate only if configured.

---

## 5. Performance Channel

### Source Files
- `packages/recording/src/performance/observe.ts` — `createPerformanceObserver()`, `createResourceTimingObserver()`

### Domain Types
- `performance.tdls`: `ResourceTiming` (id, initiatorType, url, all timing fields, encodedBodySize, decodedBodySize, transferSize)

### What Is Captured Verbatim

| Data | Detail | Mechanism |
|------|--------|-----------|
| Resource URLs | Full URL string including query parameters | `PerformanceObserver` with `type: 'resource'` |
| Initiator type | `script`, `link`, `img`, `fetch`, `xmlhttprequest`, etc. | `entry.initiatorType` |
| Timing metrics | `startTime`, `domainLookupStart/End`, `connectStart/End`, `secureConnectionStart`, `requestStart`, `responseStart/End` | All fields from `PerformanceResourceTiming` |
| Size metrics | `encodedBodySize`, `decodedBodySize`, `transferSize` | Size fields from Performance API |

### Existing Masking

**None.** The performance channel has zero redaction.

### PII/Sensitive-Data Surfaces

| Surface | Risk | Explanation |
|---------|------|-------------|
| Resource URL query parameters | **Medium** | `entry.name` (the URL) is captured verbatim. Query parameters like `?token=abc`, `?session=xyz`, or user identifiers in CDN URLs are captured with no redaction. |
| Timing data | **Low** | Timing information alone is generally not PII but can reveal business logic or infrastructure patterns. |

### Risk Rating: **Low-Medium**

The performance channel captures minimal data compared to others, but the URL field is completely unredacted. Query parameters in resource URLs (e.g., CDN URLs with signed tokens, analytics URLs with user IDs) are a concrete PII vector.

---

## 6. State (Framework) Channel

### Source Files
- `packages/recording/src/state/react.ts` — `createReactObserver()`
- `packages/recording/src/state/redux.ts` — `createReduxObserver()`
- `packages/recording/src/state/vuex.ts` — `createVuexObserver()`
- `packages/recording/src/state/vue3.ts` — `createVue3Observer()`
- `packages/recording/src/frameworks/detect.ts` — `detectFrameworks()`

### Domain Types
- `state.tdls`: `ReactCommitEvent` (componentName, propsDelta, hooksDelta), `ReduxDispatchEvent` (actionType, actionPayload, stateDiff), `VueComponentUpdateEvent` (componentName, propsDelta, setupStateDelta), `VuexMutationEvent` (mutationType, payload, stateDiff), `VuexActionEvent` (actionType, payload), `PiniaActionEvent` (storeId, actionName, args, stateDiff)
- `react.tdls`: `ReactComponentNode` (componentName, props), `ReactComponentTree`
- `snapshot.tdls`: `FrameworkState` (reactTree, reduxState)

### What Is Captured Verbatim

#### React Observer
| Data | Detail | Mechanism |
|------|--------|-----------|
| Component props deltas | Changed props are JSON-serialised via `safeSerialise()` (max depth 3, max 10,000 chars) | `getChangedProps()` compares `memoizedProps` across fiber alternates |
| Hooks state deltas | Hook memoizedState deltas (state, deps) via `safeSerialise()` (max depth 3, 100 hooks max, 10,000 chars max) | `getHooksDelta()` walks the hook linked list |
| Component tree | Accumulated component hierarchy with latest props on snapshot | `createSnapshotEvent()` calls `getComponentTree()` |
| All component names | Display names extracted from fiber type | Component name is always captured (no exclusions) |

#### Redux Observer
| Data | Detail | Mechanism |
|------|--------|-----------|
| Action payload | JSON-serialised action minus `type` field (max 10,000 chars) | `safeSerialize(payload, ACTION_PAYLOAD_MAX_CHARS)` |
| State diff | Shallow diff of `stateBefore` vs `stateAfter` (top-level keys, max 20,000 chars) | `computeStateDiff()` with `Object.is` comparison |
| Full store state | Entire Redux store state on snapshot (max 500,000 chars) | `createSnapshotEvent()` calls `getStoreState()` | 

#### Vuex Observer
| Data | Detail | Mechanism |
|------|--------|-----------|
| Mutation type and payload | `mutation.type` + serialised payload (max 10,000 chars) | `handleMutation()` handler on `__VUE_DEVTOOLS_GLOBAL_HOOK__` |
| State diff | Shallow diff across deep-clone snapshot (max 20,000 chars) | `computeStateDiff()` |
| Action type and payload | `action.type` + serialised payload (max 10,000 chars) | `handleAction()` handler |

#### Vue 3 Observer
| Data | Detail | Mechanism |
|------|--------|-----------|
| Component props | All props serialised via `safeSerialise()` (max depth 3, combined 10,000 chars) | `handleComponentUpdated()` from Vue devtools hook |
| Setup state | All `setupState` serialised as delta | Full setupState is serialised, not a diff |

### Existing Masking

**Essentially none.** The state channel has no PII-specific redaction. The truncation mechanisms (`MAX_PROPS_DELTA_SIZE`, `MAX_HOOKS_DELTA_SIZE`, `STATE_DIFF_MAX_CHARS`, `safeSerialise` depth limits) are anti-crash or performance guards, not privacy controls.

| "Mask" | Detail |
|--------|--------|
| `safeSerialise()` depth limit (3) | Prevents deeply nested objects from being serialised but does not inspect or mask content |
| `safeSerialise()` class instances | Class instances are converted to `[object ClassName]` strings — this masks the internal structure of class instances but not plain objects |
| `safeSerialise()` circular ref | Detects and masks circular references |
| `safeSerialise()` functions | Functions are replaced with `[function]` |
| Truncation limits | 10K/10K/20K/500K char limits prevent unbounded serialisation but do not remove PII |
| React: `children` prop excluded | The `children` key is skipped in `getChangedProps()` |
| Redux: state snapshot max 500K | If state exceeds 500K chars, the snapshot is `null` |
| Vue 3: combined delta max 10K | If `propsDelta + setupStateDelta > 10,000` chars, the event is dropped |

### PII/Sensitive-Data Surfaces

| Surface | Risk | Explanation |
|---------|------|-------------|
| Redux/Vuex store state | **Critical** — entire app state | The full Redux store state is serialised at snapshot intervals. This typically contains user profile objects, auth tokens, API keys, payment data, and any other application state. Stored as a string in the snapshot. |
| Redux action payloads | **Very High** | Every Redux action payload (minus the `type` field) is serialised. Form submissions, auth actions (login credentials), and data mutations are captured. |
| Redux state diff | **High** | Every dispatch produces a shallow diff of before/after state — this reveals the exact data being modified. |
| React props deltas | **High** | Component props carry user data between components (e.g., `user={user}`, `order={order}`, `authToken={token}`). Serialised at depth 3, which captures most meaningful data. |
| React hooks deltas | **High** | Hook state values (useState, useReducer) are delta-serialised. Auth state, form state, user data stored in hooks are captured. |
| Vue 3 component props | **High** | All props are serialised (not delta) — every component update emits the full props object. |
| Vue 3 setup state | **High** | All `setupState` is serialised as a delta — reactive data, computed values, and store references. |
| Vuex mutation payloads | **High** | Payload data included in mutations and actions is serialised. |
| Periodic state snapshots | **Critical** — accumulates over time | `createSnapshotEvent()` runs at `snapshotInterval` (default 10 seconds). Each one dumps the full Redux store state and React component tree. These accumulate in the buffer and survive buffer eviction if too large to fit. |

### Risk Rating: **Very High**

The state channel captures the most sensitive data of any channel — the full application state including user profiles, auth tokens, API keys, payment data, and form submissions — with zero PII-specific redaction. The truncation and safe-serialisation guards protect against crashes and unbounded serialisation but do nothing for privacy. The periodic snapshot mechanism compounds this by repeatedly serialising the full store state.

---

## 7. Custom Mark Channel

### Source Files
- `packages/recording/src/custom/observe.ts` — `createCustomMarkObserver()`

### Domain Types
- `customMark.tdls`: `CustomMark` (name: string, data: ?string, frameId)

### What Is Captured Verbatim

| Data | Detail | Mechanism |
|------|--------|-----------|
| Mark name | Developer-specified string name | `window.__REPRO__.mark(name, data)` |
| Mark data | Developer-specified JSON-serialised data | `safeSerializeCustomMarkData()` → `JSON.stringify(value)` |

### Existing Masking

None. This is an opt-in API — developers explicitly call `window.__REPRO__.mark()` so they are choosing what to record.

### PII/Sensitive-Data Surfaces

| Surface | Risk | Explanation |
|---------|------|-------------|
| Developer-passed data | **Low (opt-in)** | The API is opt-in — developers intentionally choose what data to pass. However, if they inadvertently pass PII, there is no redaction layer. The data field is JSON-serialised without inspection. |

### Risk Rating: **Low**

The custom mark channel is opt-in, so the primary risk is developers accidentally passing PII to `mark()`.

---

## 8. Three-Tier Classification Model

### Tier Definitions

| Tier | Label | Policy | Implementation Priority |
|------|-------|--------|------------------------|
| **Tier 1** | Always Redact | These fields must always be masked/modified before capture. No configuration toggle. Implementation must be automatic regardless of user settings. | Immediate — P1 |
| **Tier 2** | Redact by Default / Configurable | These fields should be redacted by default, but the user may configure which to allow. The default (strict) mode redacts them; a "recording mode" toggle can permit them. | Near-term — P2 |
| **Tier 3** | Capture by Default | These fields are intrinsically low-PII-risk by nature. Capture them unless a "maximum privacy" mode is enabled. | Default — no change needed |

### Classification Table with Concrete Examples

| Field / Artifact | Channel | Tier | Example | Rationale |
|------------------|---------|------|---------|-----------|
| `FetchRequest.headers.authorization` | Network | **Tier 1** | `Bearer eyJhbGciOiJIUzI1NiJ9...` | Direct credential — redacted via `redactHeaders()` (already done ✅) |
| `FetchRequest.headers.cookie`, `set-cookie` | Network | **Tier 1** | `session=abc123; token=xyz` | Session tokens — redacted via `redactHeaders()` (already done ✅) |
| `ReduxDispatchEvent.stateDiff` | State | **Tier 1** | Entire state tree with user profile, auth tokens | Full application state — no existing redaction ❌ |
| Redux periodic state snapshot | State | **Tier 1** | `{user: {email, name, ssn}, auth: {token}}` in `Snapshot.frameworkState.reduxState` | Full state dump at snapshot interval — no existing redaction ❌ |
| `WebSocketInbound.data` (text) | Network | **Tier 1** | Chat message containing PII, real-time auth data | Binary WebSocket frames are opaque but text frames carry readable data — no redaction ❌ |
| `VElement.properties.value` (password) | DOM | **Tier 1** | Password input value | Already auto-masked via `type === 'password'` ✅ |
| `FetchResponse.body` content | Network | **Tier 1** | `{"credit_card": "4111...", "ssn": "123-45-6789"}` in response body | Raw body content — no content inspection ❌ |
| `VuexMutationEvent.payload` | State | **Tier 1** | Mutation payload with user data | Framework state — no redaction ❌ |
| `VElement.properties.value` (non-password) | DOM | **Tier 2** | Credit card number typed into a form field not matching maskedSelector | Only masked if selector configured — should be auto-scanned ❌ |
| `VText.value` (text content) | DOM | **Tier 2** | `<div>User: john@example.com</div>` rendered on page | Only masked if parent matches maskedSelector — should be configurably scanned |
| Network request/response body | Network | **Tier 2** | Form data: `{name: "John", email: "..."}` sent to API | Raw buffer — no content inspection ❌ |
| URL query parameters | Network, Performance | **Tier 2** | `https://api.example.com/data?token=abc123` | Captured in `FetchRequest.url` and `ResourceTiming.url` — no query string redaction ❌ |
| Console-logged user objects | Console | **Tier 2** | `console.log({user: {email: "john@example.com"}})` | `redactUnknown()` only masks keys matching `SENSITIVE_FIELD_PATTERN` — `user.name` or `email` pattern does not match ❌ |
| `Click.meta.node.attributes` | Interactions | **Tier 2** | `<button data-user-id="123">John Smith</button>` attributes | Full VElement on click — maskedSelectors mitigates but only if configured ❌ |
| `PointerMove.to` | Interactions | **Tier 3** | `[450, 230]` | Coordinates alone are not PII |
| `Scroll.to` | Interactions | **Tier 3** | `[0, 1500]` | Scroll position is not PII |
| `ViewportResize.to` | Interactions | **Tier 3** | `[1920, 1080]` | Viewport dimensions are not PII |
| `ResourceTiming.startTime` | Performance | **Tier 3** | `12345.67` | Timing metric is not PII |
| `ReactCommitEvent.componentName` | State | **Tier 3** | `"UserProfile"` | Component name alone (without props) is not PII |
| `KeyDown.key` on non-input focus | Interactions | **Tier 3** | `"Enter"`, `"Escape"` | Non-character keys on non-input elements carry minimal data. Already suppressed on input fields. |
| Element `tagName` and structure | DOM | **Tier 3** | `DIV`, `SPAN`, `TABLE` | Tag names are structural, no content |
| `CustomMark.name` | Custom | **Tier 3** | `"checkout-complete"` | Opt-in, developer defined |

---

## 9. Dormant Channels

These channels are defined in the domain schema (`event.tdls`) but have no observer implementation in `packages/recording/src/`.

### 9.1 Storage Channel

- **Domain type:** `StorageMessage` in `storage.tdls` — captures localStorage/sessionStorage operations (key, oldValue, newValue) per frame
- **Observer status:** NOT IMPLEMENTED — no `createStorageObserver()` exists
- **Risk if implemented:** **Very High** — localStorage/sessionStorage commonly contains auth tokens, session identifiers, user preferences, serialised state, and API keys
- **Existing masking:** None — would need to be built from scratch with header-like redaction on known sensitive keys
- **Note:** The `StorageEvent` type is imported in `event.tdls` as part of the `SourceEvent` union (index 70), but the recording package never registers or implements a storage observer. The `RecordingOptions.types` set does not include a `'storage'` member.

### 9.2 Pinia (Vue 3 State Management)

- **Domain type:** `PiniaActionEvent` in `state.tdls` — captures storeId, actionName, args, stateDiff
- **Observer status:** NOT IMPLEMENTED — no `createPiniaObserver()` exists
- **Risk if implemented:** **Very High** — Pinia stores typically hold the same sensitive application state as Vuex (user data, tokens, etc.)
- **Note:** The `PiniaActionEvent` type is part of the `StateEvent` union (index 5), but there is no observer for it. The Vue devtools hook (`__VUE_DEVTOOLS_GLOBAL_HOOK__`) does emit Pinia events (`pinia:action`), which would be the integration point.

### 9.3 Zustand (React State Management)

- **Framework detection:** `detectFrameworks()` checks for `window.__zustand` or `window.__ZUSTAND_STORE__`
- **Observer status:** NOT IMPLEMENTED — no `createZustandObserver()` exists
- **Risk if implemented:** **Very High** — Zustand stores hold application state similar to Redux

---

## 10. Cross-Cutting Risks

### 10.1 Buffer Eviction and PII Accumulation

The event buffer (`eventBuffer` in `createRecordingStream.ts`) has a capacity of 32 MB (raw `DataView` bytes). When the buffer is full, older events are evicted and applied to the `leadingSnapshot` to maintain replay consistency. This means:

- PII captured in any channel persists in the `leadingSnapshot` even after the raw events are evicted
- The `leadingSnapshot` grows over time as it accumulates all state changes
- Network, console, and custom mark events are **not** applied to the leading snapshot on eviction (noted as TODO at `createRecordingStream.ts:740`)
- Network and console events are simply dropped on eviction — but the snapshot already accumulated PII from periodic state dumps

### 10.2 Periodic Snapshot Risk

`createSnapshotEvent()` runs every 10 seconds by default (`snapshotInterval: 10000`). Each snapshot includes:
- Full DOM VTree (all text content, attributes, form values)
- Full Redux store state (entire application state as string)
- Full React component tree (all component name-to-props mappings)

This means every 10 seconds, the full application state is re-serialised and pushed into the buffer. During a long recording session, this creates many copies of the same PII in the buffer.

### 10.3 Iframe Content Capture

The DOM observer captures all iframe content by pushing `contentDocument` into the `sourceDocuments` array. This means:

- Third-party iframes (analytics, ads, payment forms) have their DOM content captured
- If the extension has permission to access the iframe's `contentDocument`, it is recursively walked
- Cross-origin iframes (no `contentDocument` access) are skipped — but same-origin iframes within the recorded page are fully captured

### 10.4 Dormant StorageEvent Channel

The `StorageEvent` type exists in the domain schema (`event.tdls` index 70) and is part of the `SourceEvent` union. If an observer were implemented, it would capture localStorage/sessionStorage operations verbatim. This is a high-risk gap if the channel is activated later without PII redaction built into the observer.

### 10.5 Upload Flow Boundary

This audit covers only the capture (observer) phase. After capture, events are serialised via TDL codecs, stored in the buffer, and uploaded to the server. The upload/transport path has its own PII handling mechanisms that are outside the scope of this observer audit. This boundary means:

- All PII identified in this audit is currently stored in the buffer and would be uploaded as-is
- The absence of server-side PII scanning or re-redaction is a separate concern
- The `redactHeaders()` function and `redactStringPreservingWhitespace()` are client-side protections only — once data leaves the browser, the recording payloads contain everything described above

---

## 11. Follow-Up Implementation Work

### Channel-by-Channel Issues

#### DOM Channel (Tier 1 & 2 improvements)

| # | Issue | Priority | Description |
|---|-------|----------|-------------|
| DOM-1 | Auto-detect and redact common PII patterns in text content | P1 | Add a pattern-based redaction for common PII in `VText.value` and `characterData` mutations: email addresses, phone numbers, SSNs, credit card numbers. Should work alongside `maskedSelectors`. |
| DOM-2 | Pattern-based form field redaction | P1 | Extend password auto-masking to other sensitive input types (credit card, SSN number fields) using HTML input attributes or heuristics. |
| DOM-3 | Configurable attribute allowlist | P2 | Allow users to specify which HTML attributes to exclude from capture (e.g., `data-*`, `aria-*`, `title`). |
| DOM-4 | CSS content scanning for data URIs | P3 | CSS rule text may contain data URIs with embedded content. Consider truncating or masking data URIs in style patches. |

#### Network Channel (Tier 1 improvements)

| # | Issue | Priority | Description |
|---|-------|----------|-------------|
| NET-1 | JSON body content redaction | P1 | Parse JSON request/response bodies and apply the same key-based redaction as console (`redactUnknown()` or better). Key matching for `password`, `token`, `secret`, `api_key`, `ssn`, etc. |
| NET-2 | URL query parameter redaction | P1 | Parse URL query strings and redact known sensitive parameter values. Apply to `FetchRequest.url`, `ResourceTiming.url`, and `WebSocketOpen.url`. |
| NET-3 | WebSocket text message inspection | P1 | Apply content inspection to text-mode WebSocket messages (both inbound and outbound). For JSON WebSocket payloads, apply key-based redaction. |
| NET-4 | Custom auth header redaction | P2 | Expand `SENSITIVE_HEADER_NAMES` or make it configurable to cover common non-standard auth headers (`x-api-key`, `x-auth-token`, etc.). |

#### Console Channel (Tier 2 improvements)

| # | Issue | Priority | Description |
|---|-------|----------|-------------|
| CON-1 | Handle `email`, `name`, `phone` as sensitive keys | P2 | The current `SENSITIVE_FIELD_PATTERN` does not include `email`, `name`, `phone`, `address`, `ssn`. Add common PII key patterns to the redactor. But careful: false positives on `type: "email"` or `name: "submit"`. |
| CON-2 | String value pattern scanning | P2 | Apply regex-based pattern matching (email, phone, SSN) to string values found during `redactUnknown()` — currently only key names are matched, not the values themselves (except via `SECRET_VALUE_PATTERN` which looks for `key=value` patterns in string values). |
| CON-3 | Error message PII scanning | P2 | Apply pattern matching to `ErrorEvent.message` and serialised error messages before capture. |

#### Interactions Channel (Tier 2 improvements)

| # | Issue | Priority | Description |
|---|-------|----------|-------------|
| INT-1 | Click VElement attribute filtering | P2 | Allow excluding or pattern-masking specific attributes from the click-target VElement. Currently the full VElement (all attributes) is captured even if the element is masked. |
| INT-2 | Page URL query param redaction | P2 | Apply query parameter redaction to `PageTransition.to` and `PageTransition.from` URLs. |

#### Performance Channel (Tier 2 improvements)

| # | Issue | Priority | Description |
|---|-------|----------|-------------|
| PERF-1 | Resource URL query parameter redaction | P2 | Apply URL query parameter redaction to `ResourceTiming.url`. Resource URLs often carry signed tokens or session IDs. |

#### State Channel (Tier 1 — Critical)

| # | Issue | Priority | Description |
|---|-------|----------|-------------|
| ST-1 | Redux action payload redaction | P1 | Apply PII key scanning to `ReduxDispatchEvent.actionPayload`. The payload is JSON-serialised before entry into the buffer — redaction should happen before serialisation or on the serialised string. |
| ST-2 | Redux state diff redaction | P1 | Apply PII scanning to `ReduxDispatchEvent.stateDiff` — shallow diff values contain the actual data being modified (user objects, tokens, etc.). |
| ST-3 | Redux periodic snapshot redaction | P1 | The full Redux store state serialised in snapshots is the single highest-value PII target. Either exclude `reduxState` from snapshots by default or apply deep PII pattern-scanning. |
| ST-4 | React props delta redaction | P1 | Apply key-based scanning to `propsDelta` JSON strings. Component props carry user data as props (e.g., `user={currentUser}`, `order={orderData}`). |
| ST-5 | React hooks delta redaction | P1 | Apply key-based scanning to `hooksDelta` JSON strings. Hook state values can contain application state with PII. |
| ST-6 | Vue 3 props/setupState redaction | P1 | Apply key-based scanning to Vue 3 component update deltas (both propsDelta and setupStateDelta). |
| ST-7 | Vuex mutation/action payload redaction | P1 | Apply key-based scanning to Vuex payload serialised strings. |
| ST-8 | State channel redaction architecture | P1 | Define a shared redaction function that all framework observers call before serialisation. Currently each observer has its own `safeSerialise`/`safeSerialize` function. A single `redactStateValue()` would ensure consistency. |

#### Dormant Channel Issues

| # | Issue | Priority | Description |
|---|-------|----------|-------------|
| DORM-1 | Storage observer PII requirements | P1 | If storage observer is implemented, it must include key-based redaction for storage keys/values before the first release. Storage commonly contains auth tokens and serialised state. |
| DORM-2 | Pinia observer PII requirements | P1 | If Pinia observer is implemented, include state diff / payload redaction modeled after ST-1 through ST-7. |
| DORM-3 | Zustand observer PII requirements | P2 | If Zustand observer is implemented, bundle with the same redaction as Redux (since Zustand stores hold similar application state). |

#### Cross-Cutting Issues

| # | Issue | Priority | Description |
|---|-------|----------|-------------|
| CC-1 | Unified redaction key set | P1 | Create a single, auditable, well-documented set of sensitive field patterns used across ALL channels (DOM, network, console, interactions, state). Currently each channel has its own patterns/approach. |
| CC-2 | Snapshot PII avoidance | P1 | The periodic snapshot mechanism (every 10 seconds) captures full state including all PII-rich data. Either exclude PII-heavy fields from snapshots or ensure snapshot-time redaction. |
| CC-3 | Iframe content capture toggle | P2 | Add a configuration option to exclude iframe content from recording (or to apply stricter redaction to iframe-originated content). |
| CC-4 | Configurable redaction modes | P2 | Define recording modes: "strict" (Tier 1 always + Tier 2 redacted), "balanced" (Tier 1 always, Tier 2 configurable), "debug" (all tiers as-is). |
| CC-5 | Redaction audit trail | P3 | Log which fields/events were redacted during a recording session (for debugging and compliance). |
| CC-6 | Test coverage for redaction | P2 | Every redaction function should have dedicated unit tests verifying that known PII patterns are masked and non-PII data passes through unharmed. |

---

## 12. Risk Areas & Caveats

### 12.1 REP-710 (Privacy Policy) Not Found

The upstream privacy/sensitive-data policy that this audit should reference was not found in the codebase. The three-tier classification model is based on industry standards and common PII definitions rather than organisation-specific policy. If REP-710 exists or is created, the tier definitions should be adjusted to match.

### 12.2 Classification Subjectivity

Without a formal privacy policy (REP-710), the three-tier classification is based on general industry practice:
- Tier 1 (Always Redact): items that are universally considered sensitive (credentials, tokens, full store state)
- Tier 2 (Redact by Default): items that commonly contain PII but may be needed for debugging (text content, bodies, query params)
- Tier 3 (Capture by Default): items that are structurally non-sensitive (coordinates, timing, dimensions)

Some classifications may shift depending on the product's actual privacy posture and target market.

### 12.3 Masking Implementation Details

- DOM `maskedSelectors` uses `element.closest(selector)` which matches the element itself and all ancestors — this is broader than a direct match
- Console `redactUnknown()` only masks values under matching key names, not the values themselves — a string `"token: abc123"` in a log message is only masked if it matches `SECRET_VALUE_PATTERN` which has specific formatting requirements
- The `redactHeaders()` function only checks against a hardcoded Set of 3 header names — it does not support configuration
- `safeSerialise` in react.ts and vue3.ts truncates at depth 3, which means deeply nested PII (e.g., `user.profile.contact.email`) IS captured (depth 3 from root reaches `email`)
- `safeSerialize` in redux.ts and vuex.ts has no depth limit — it uses default `JSON.stringify` which traverses the entire object tree until a circular reference or truncation limit is hit

### 12.4 Missing Feature: Pinia and Zustand Observers

The `StateEvent` union includes `PiniaActionEvent` in the domain schema, but no Pinia observer is implemented. Similarly, Zustand is detected by `detectFrameworks()` but has no observer. When these are eventually implemented, they must include PII redaction from the start.

### 12.5 Performance Impact of Redaction

Redaction (especially deep object traversal and JSON parsing of bodies) has a performance cost. This audit does not evaluate performance implications. Implementation should benchmark redaction overhead, especially for:
- Large network bodies
- Deep Redux/Vuex state trees
- High-frequency console output

---

## Appendix A: File Inventory

### Observer Source Files Audited

| File | Lines | Channel |
|------|-------|---------|
| `packages/recording/src/dom/observe.ts` | 569 | DOM |
| `packages/recording/src/dom/factory.ts` | 210 | DOM |
| `packages/recording/src/dom/utils.ts` | 149 | DOM |
| `packages/recording/src/network/observe.ts` | 619 | Network |
| `packages/recording/src/console/observe.ts` | 170 | Console |
| `packages/recording/src/interaction/observe.ts` | 445 | Interactions |
| `packages/recording/src/performance/observe.ts` | 74 | Performance |
| `packages/recording/src/state/react.ts` | 430 | State (React) |
| `packages/recording/src/state/redux.ts` | 185 | State (Redux) |
| `packages/recording/src/state/vuex.ts` | 183 | State (Vuex) |
| `packages/recording/src/state/vue3.ts` | 285 | State (Vue 3) |
| `packages/recording/src/custom/observe.ts` | 84 | Custom Mark |
| `packages/recording/src/redaction.ts` | 73 | Cross-cutting |
| `packages/recording/src/createRecordingStream.ts` | 763 | Orchestration |
| `packages/recording/src/types.ts` | 38 | Types |
| `packages/recording/src/frameworks/detect.ts` | 39 | Framework detection |

### Domain Schema Files Audited

| File | Lines | Content |
|------|-------|---------|
| `packages/domain/src/network.tdls` | 72 | Network request/response/WebSocket types |
| `packages/domain/src/console.tdls` | 61 | Console message types |
| `packages/domain/src/interaction.tdls` | 115 | Interaction event types |
| `packages/domain/src/performance.tdls` | 26 | Performance entry types |
| `packages/domain/src/state.tdls` | 75 | Framework state event types |
| `packages/domain/src/vdom.tdls` | 134 | VNode, VTree, DOMPatch types |
| `packages/domain/src/snapshot.tdls` | 23 | Snapshot type |
| `packages/domain/src/react.tdls` | 11 | React component tree types |
| `packages/domain/src/customMark.tdls` | 5 | Custom mark type |
| `packages/domain/src/event.tdls` | 88 | Source event envelope types |
| `packages/domain/src/storage.tdls` | 19 | Storage message type (dormant) |

## Appendix B: Existing Redaction Functions Summary

| Function | File | What It Does | Used By |
|----------|------|-------------|---------|
| `redactStringPreservingWhitespace()` | `redaction.ts:3-4` | Replaces each non-whitespace character with `*` | DOM channel (masked selectors, password inputs) |
| `redactHeaders()` | `redaction.ts:60-69` | Masks values for `authorization`, `cookie`, `set-cookie` header keys | Network channel (all request/response headers) |
| `redactConsoleValue()` | `redaction.ts:71-73` | Recursive object traversal masking values under sensitive key names + matching `SECRET_VALUE_PATTERN` in string values | Console channel |
| `redactUnknown()` | `redaction.ts:30-58` | Core recursive redactor — checks keys against `SENSITIVE_FIELD_PATTERN`, masks matching values with `MASKED_VALUE` | Called by `redactConsoleValue()` |
| `redactString()` | `redaction.ts:26-28` | Tests single string against `SECRET_VALUE_PATTERN` — returns `MASKED_VALUE` if match | Called by `redactUnknown()` for string leaf values |
| `safeSerialise()` (react) | `state/react.ts:213-250` | Depth-limited JSON serialiser with circular ref + class instance guards | React props and hooks |
| `safeSerialise()` (vue3) | `state/vue3.ts:77-113` | Same pattern as React's safeSerialise | Vue 3 props and setupState |
| `safeSerialize()` (redux) | `state/redux.ts:61-76` | JSON.stringify with function/bigint guard + char limit | Redux action payload and state diff |
| `safeSerialize()` (vuex) | `state/vuex.ts:43-56` | Same as Redux's safeSerialize | Vuex payload and state diff |

## Appendix C: RecordingOptions Default Configuration

```typescript
const defaultOptions: RecordingOptions = {
  types: new Set(['dom', 'interaction']),  // network, performance, console, state, custom require explicit opt-in
  ignoredNodes: [],
  ignoredSelectors: [],
  maskedSelectors: [],
  snapshotInterval: 10000,  // 10 seconds
  eventSampling: {
    pointerMove: 50,     // ms
    resize: 200,         // ms
    scroll: 100,         // ms
  },
}
```

Note: By default, only `dom` and `interaction` channel types are enabled. Network, console, performance, state, and custom channels require explicit opt-in via `RecordingOptions.types`. However, when enabled, they carry the PII risks documented in this report.
