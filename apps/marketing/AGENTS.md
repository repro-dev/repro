# apps/marketing

This app mixes server-rendered shells with client-only UI primitives.

## Client boundary conventions

- Keep `JsxstyleRegistry` client-side.
- Marketing shell components that depend on client-only styling or runtime DOM behavior should keep an explicit client boundary instead of being opportunistically moved server-side.
- When changing rendering boundaries, verify the current app pattern first; seemingly safe server conversions can reintroduce FOUC or hydration regressions here.
