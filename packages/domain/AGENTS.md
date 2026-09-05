# packages/domain

Wire-format types live in `.tdls` schema files and are compiled by `tdlc` into `generated/*.ts`. These generated files **must never be edited directly** — the header says `// This file is generated — do not edit directly`.

## Runtime nullability contract (REP-1662)

- Optional (nullable) struct fields are spelled `field: T | null` in generated TS types — strictly nullable, never optional (`?:`).
- At runtime, the `@repro/tdl` encoder treats omitted (`undefined`) nullable fields **the same as explicit `null`**: one null-marker byte, no payload, decodes as `null`. This is a deliberate two-pass contract — the size pass and write pass must both agree (see `packages/tdl/src/lib/utils.ts` and `encoders.ts`).
- Consequence: hand-written payload literals may omit nullable fields, but the compiler will not accept that at typecheck time (missing property) — explicit `null` is still the only type-correct spelling. Unchecked call sites (story files) rely on the runtime tolerance; typechecked code must spell `null`.
- There is no wire representation for `undefined` — it never round-trips; decode always yields `null`.

## TDL schema pipeline

```
src/*.tdls  →  tdlc  →  generated/*.ts
```

- **Schema files** (`src/*.tdls`): the source of truth for all wire-format types. Every type that is serialised over the network or persisted to disk must be defined here.
- **Generated files** (`generated/*.ts`): auto-produced by `tdlc`. Do not hand-write or patch these.
- **Hand-written interface files** (`src/account.ts`, `src/project.ts`, etc.): domain types that are **not** serialised through TDL codecs. These are fine to edit.
- **Build command**: `pnpm run build` in this package = `tdlc src --outdir generated`.

## When adding new types

1. **Is it a wire type?** If yes → add a `.tdls` definition, run `pnpm run build`, and import from `../generated/<name>` when referencing it from `src/*` files.
2. **Is it a plain domain interface?** If yes → add a hand-written `.ts` file and export from `index.ts`.
3. **Does a new patch type need to join a union?** Add it to the relevant union in the `.tdls` file (e.g. `DOMPatch` in `vdom.tdls`), then regenerate. Cross-file imports within the same package are supported — a type in `css.tdls` can be referenced in `vdom.tdls`.

## Common mistakes

- **Editing `generated/*.ts` directly** — changes will be overwritten on next `tdlc` run.
- **Adding an interface that references a TDL-serialised type but defining it as a hand-written TS file** — the type won't have a TDL codec, so it can't be serialised. Define it in `.tdls` instead.
- **Forgetting to add a new patch type to its parent union** — e.g. adding `StyleSheetMutationPatch` as a struct but not adding it to `DOMPatch` in `vdom.tdls`. This causes `as unknown as DOMPatch` casts and broken codecs.
