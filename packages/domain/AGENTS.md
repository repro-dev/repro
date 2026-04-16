# packages/domain

Wire-format types live in `.tdls` schema files and are compiled by `tdlc` into `src/generated/*.ts`. These generated files **must never be edited directly** — the header says `// This file is generated — do not edit directly`.

## TDL schema pipeline

```
src/*.tdls  →  tdlc  →  src/generated/*.ts
```

- **Schema files** (`src/*.tdls`): the source of truth for all wire-format types. Every type that is serialised over the network or persisted to disk must be defined here.
- **Generated files** (`src/generated/*.ts`): auto-produced by `tdlc`. Do not hand-write or patch these.
- **Hand-written interface files** (`src/css.ts`, `src/account.ts`, etc.): domain types that are **not** serialised through TDL codecs. These are fine to edit.
- **Build command**: `pnpm run build` in this package = `tdlc src --outdir src/generated`.

## When adding new types

1. **Is it a wire type?** If yes → add a `.tdls` definition, run `pnpm run build`, and import from `./generated/<name>`.
2. **Is it a plain domain interface?** If yes → add a hand-written `.ts` file and export from `index.ts`.
3. **Does a new patch type need to join a union?** Add it to the relevant union in the `.tdls` file (e.g. `DOMPatch` in `vdom.tdls`), then regenerate. Cross-file imports within the same package are supported — a type in `css.tdls` can be referenced in `vdom.tdls`.

## Common mistakes

- **Editing `src/generated/*.ts` directly** — changes will be overwritten on next `tdlc` run.
- **Adding an interface that references a TDL-serialised type but defining it as a hand-written TS file** — the type won't have a TDL codec, so it can't be serialised. Define it in `.tdls` instead.
- **Forgetting to add a new patch type to its parent union** — e.g. adding `StyleSheetMutationPatch` as a struct but not adding it to `DOMPatch` in `vdom.tdls`. This causes `as unknown as DOMPatch` casts and broken codecs.
