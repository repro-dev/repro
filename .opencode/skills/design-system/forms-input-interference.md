# Forms and Input Interference

Use this reference for forms, text inputs, editing surfaces, and wizard flows where the UI can accidentally fight the browser.

## Guardrails

- Do **not** block paste by default. Only constrain paste for a concrete security or compliance reason, and provide a clear fallback.
- Match input semantics to the data: use the right `type`, `name`, `autocomplete`, `autocorrect`, `spellcheck`, and `inputMode` so autofill and mobile keyboards work naturally.
- Preserve the caret, selection, undo/redo, and standard text editing behavior. Avoid keystroke-time rewrites that make the cursor jump.
- Persist wizard and multi-step draft state across navigation, tab switches, validation failures, and back/forward flows.
- Apply formatting on blur or submit when possible; if live formatting is required, keep it caret-safe and predictable.

## Named patterns

- **Good**: paste-friendly input, semantic autofill, caret-safe masking, draft-persistent wizard, progressive disclosure.
- **Anti-patterns**: paste trap, hostile formatter, caret jump, keystroke rewriter, validation lockdown, wizard state amnesia.
