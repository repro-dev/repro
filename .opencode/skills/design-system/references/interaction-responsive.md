# Interaction & responsiveness anti-pattern guardrail catalog

Use this catalog as shared vocabulary for feedback, timing, and device-fit review. These are guardrails, not rigid bans: a pattern can be acceptable when it is clearly deliberate and the user still gets clear feedback.

## Feedback and submission timing

### No immediate feedback

- **Why it is a problem:** when an action appears to do nothing, users repeat it or assume the app is broken.
- **When it is a real issue vs acceptable:** it is a real issue when the task has no visible state change, status text, or optimistic cue; it is acceptable only when the action is obviously inert or fully blocked by design.
- **Safer alternative:** show an immediate affordance change, inline status, or loading state the moment the action starts.

### Optimistic revert

- **Why it is a problem:** optimistic updates without a recovery signal can create a false sense of success and make rollback feel like data loss.
- **When it is a real issue vs acceptable:** it is a real issue when the revert is silent or unexplained; it is acceptable when the change is low-risk and a clear undo or error recovery path is present.
- **Safer alternative:** pair optimistic updates with undo, progress, or a visible error state that explains what changed back.

### No progress signal

- **Why it is a problem:** long-running work with no progress leaves users guessing whether they should wait, retry, or navigate away.
- **When it is a real issue vs acceptable:** it is a real issue when the action may take more than a moment and there is no spinner, skeleton, step indicator, or status text; it is acceptable only for very fast operations.
- **Safer alternative:** surface a progress bar, spinner, or plain-language status that matches the expected wait.

### Disabled without explanation

- **Why it is a problem:** disabled controls with no reason hide the next step and make the UI feel arbitrary.
- **When it is a real issue vs acceptable:** it is a real issue when the disabled state is the only signal and the user cannot tell what to fix; it is acceptable when the control is obviously unavailable because of a clearly explained prerequisite nearby.
- **Safer alternative:** keep the control disabled if needed, but explain the blocking condition in nearby copy or inline help.

### Double-submit

- **Why it is a problem:** repeated submission opportunities can create duplicate records, duplicate side effects, or racey UI state.
- **When it is a real issue vs acceptable:** it is a real issue when a primary action stays clickable after activation or there is no request lockout; it is acceptable when the action is idempotent and the UI still communicates in-flight state.
- **Safer alternative:** disable or lock the control during the request and show the in-flight state until completion.

## Modals and context breaks

### Modal by reflex

- **Why it is a problem:** reaching for a modal too early interrupts flow and often hides a simpler inline or drawer-based interaction.
- **When it is a real issue vs acceptable:** it is a real issue when the modal is used for ordinary page flow or shallow decisions; it is acceptable for focused confirmation, blocking errors, or genuinely temporary tasks that need full attention.
- **Safer alternative:** prefer inline expansion, a drawer, or a dedicated page when the user needs context while acting.

## Affordances and device fit

### Hover-only controls

- **Why it is a problem:** controls that only appear on hover disappear on touch devices and are easy to miss for keyboard and pointer users.
- **When it is a real issue vs acceptable:** it is a real issue when the action has no non-hover path or keyboard equivalent; it is acceptable when hover is only a progressive enhancement on top of an always-visible control.
- **Safer alternative:** keep the action discoverable without hover and use hover as a secondary polish layer.

### Touch-hostile affordances

- **Why it is a problem:** tiny targets, crowded hit areas, and hover-dependent affordances are unreliable on touch and mobile layouts.
- **When it is a real issue vs acceptable:** it is a real issue when the control cannot be tapped accurately or the layout assumes a mouse; it is acceptable when the target is already large enough and the surface is not intended for touch use.
- **Safer alternative:** increase tap targets, separate adjacent actions, and verify the layout on the smallest expected viewport.

### Responsive afterthought

- **Why it is a problem:** if the layout only works at one width, the task breaks when content wraps, controls collide, or actions move unpredictably.
- **When it is a real issue vs acceptable:** it is a real issue when the breakpoint change hides core actions, causes overflow, or changes task order; it is acceptable when the adaptation preserves hierarchy and simply reflows the same interaction.
- **Safer alternative:** design from the smallest usable viewport up, keep primary actions stable, and test both narrow and wide states.
