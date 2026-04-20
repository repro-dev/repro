# @repro/sdk

Tiny browser SDK for the Repro extension.

Install:

```sh
pnpm add @repro/sdk
```

30-second quickstart:

```ts
import { repro } from '@repro/sdk'

repro.mark('checkout_started', { cartValue: 49.99 })

repro.captureState('ShoppingCart', {
  items: ['item-1', 'item-2'],
  total: 49.99,
})
```

API:

- `repro.mark(name, data?)` records a named event with optional metadata.
- `repro.captureState(component, state)` attaches component state to the current recording snapshot.

All methods are safe no-ops when the Repro browser extension is absent.
