# @repro/sdk

Thin browser SDK for the [Repro](https://repro.dev) session recording platform.

All methods are **graceful no-ops** when the Repro browser extension is absent — safe to ship unconditionally.

## Quick start

```ts
import { repro } from '@repro/sdk'

// Associate the current browser session with a known user
repro.identify('user-123', { plan: 'pro', email: 'alice@example.com' })

// Record a named event with optional metadata
repro.mark('checkout_started', { cart_value: 49.99 })

// Attach component state to the active recording snapshot
repro.captureState('ShoppingCart', {
  items: ['item-1', 'item-2'],
  total: 49.99,
})
```

## API

### `repro.identify(userId, traits?)`

Associate the current session with a known user.

- `userId` — stable unique identifier for the user
- `traits` — optional key/value metadata (e.g. plan, email)

### `repro.mark(name, data?)`

Record a named event with optional payload.

- `name` — event name (e.g. `"page_view"`, `"button_clicked"`)
- `data` — optional key/value metadata attached to the event

### `repro.captureState(component, state)`

Attach component state to the current recording snapshot for richer debugging.

- `component` — display name of the component (e.g. `"ShoppingCart"`)
- `state` — serialisable state object
