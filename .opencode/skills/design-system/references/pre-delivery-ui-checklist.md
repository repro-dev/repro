# Pre-Delivery UI Checklist

Use this as the last shared pass before a UI change ships. It is a synthesis layer, not a replacement for `audit-ui-quality` or `ui-verification`.

## Check

- The implemented UI matches the captured direction and the intended surface scope.
- Layout, tokens, and component choices are consistent with `design-system` guidance.
- Critical states are present: loading, empty, error, disabled, and focus.
- Accessibility basics are intact: semantic HTML, keyboard reachability, labels, and announcements where needed.
- Copy reads like final product copy, not placeholder text.
- The change has a clear handoff note: what is ready, what remains, and which downstream check should still run.

## Cite

- In audit output, use this checklist as the short readiness summary after the full scan.
- In design handoffs, use it to explain whether the surface needs one more shipping pass.
- Do not restate the full audit or browser-verification workflow here; link back to those skills instead.

## Out of Scope

- Detailed audit scoring
- Full browser verification steps
- Repeating the design-system normalisation workflow verbatim
