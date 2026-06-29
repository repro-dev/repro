# Recording Privacy Behavior

This document describes what each recording privacy preset does, how the
`.repro-ignore` / `.repro-mask` CSS class mechanism works, the always-redact
credential floor, and known limitations.

## Presets

### Strict

- **Masked selectors**: `.repro-mask`, `input`, `textarea`, `select`,
  `[contenteditable]`, `img`
- **Redaction**: Full `DEFAULT_REDACTION_CONFIG` — auth headers, PII-like values,
  and sensitive input types are redacted.
- **Image masking**: `<img>` element `src` attributes are blanked. Other image
  types (CSS background-images, `<picture>` / `<source>`, `<video>`, `<canvas>`,
  SVG) are **not** masked in this version.
- **Use case**: Workspaces that need maximum privacy protection by default.

### Standard (default)

- **Masked selectors**: `.repro-mask`
- **Redaction**: Full `DEFAULT_REDACTION_CONFIG` — auth headers, PII-like values,
  and sensitive input types are redacted.
- **Image masking**: Off.
- **Use case**: General-purpose recording. Add `.repro-mask` to any element that
  should have its contents obscured.

### Off

- **Masked selectors**: (none)
- **Redaction**: Minimal — only `sensitiveHeaderNames` (authentication headers
  like `authorization`, `cookie`, `set-cookie`, `www-authenticate`,
  `proxy-authenticate`, `proxy-authorization`) are redacted. All other PII
  detection is disabled.
- **Image masking**: Off.
- **Use case**: Public-facing demos or internal tools with no sensitive data.
  **Not recommended** for pages that handle real user data.
- **Credential floor**: Even in Off mode, authentication headers are always
  redacted to prevent session token leakage.

## CSS Class Mechanism

### `.repro-ignore`

Add to any HTML element to exclude it (and its children) from recording entirely.

```html
<div class="repro-ignore">
  <!-- This entire subtree will not appear in recordings -->
</div>
```

### `.repro-mask`

Add to any HTML element to preserve its structure but mask its text content.
Masked text is replaced with `[MASKED]` in the recording.

```html
<span class="repro-mask">This text will be [MASKED]</span>
```

Both classes work with the Standard and Strict presets. The Strict preset also
automatically masks all `input`, `textarea`, `select`, `[contenteditable]`, and
`<img>` elements.

## Changing the Preset

Preset configuration is admin-only and managed in the workspace settings page
(`/settings/privacy-controls`). The change takes effect on the **next page
load** — `maskedSelectors` is applied at recording start, so a preset change
requires a page reload to take effect.

## Known Limitations

- **Image masking**: Strict preset masks `<img>` element `src` only. CSS
  background-images, `<picture>` / `<source>`, `<video>`, `<canvas>`, and SVG
  elements are not masked.
- **Preset change requires reload**: The recording engine applies
  `maskedSelectors` at stream construction time. Changing the preset in
  settings requires a page navigation or reload for the new preset to take
  effect.
- **Pre-start buffer**: Events captured before the preset resolves (the
  `drainRuntimeBuffer` path) use the default (Standard) config. This window
  is typically sub-100ms.

## Policy Reference

See [REP-1363](https://linear.app/repro/issue/REP-1363) for the product privacy
policy that defines these tiers. See [REP-972](https://linear.app/repro/issue/REP-972)
for the three-tier redaction audit that grounds the technical implementation.
