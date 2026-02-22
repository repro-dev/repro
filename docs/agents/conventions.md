# Conventions

- Packages: `@repro/<name>` with workspace protocol (`workspace:*`)
- Always check existing imports/patterns before adding new dependencies
- Use existing design system components from `@repro/design`

## API Response Shapes

- **List endpoints** must return a response envelope: `{ items: Array<T> }` — never a bare array
- Use a generic `items` key (not resource-specific keys like `plans` or `projects`) so the shape is uniform across all endpoints
- A shared `ListResponse<T>` generic type in `packages/domain` should be used for all list response types
- **Note**: existing endpoints currently return bare arrays and are pending uplift in REP-129. New endpoints must follow the envelope convention from the outset.
