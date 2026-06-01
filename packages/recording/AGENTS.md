# packages/recording

This package captures DOM, network, and framework state for recordings.

## Observer test payloads

- Many observer tests in this package assert against `Box`-wrapped payloads rather than plain objects.
- Categorical rule: when the underlying TDL value is a `union`, the decoded inner struct is wrapped as `Box<T>` rather than returned as a plain object. See `packages/tdl/src/lib/decoders.ts` `decodeUnion()` and `decodeUnionLazy()`, which both return `new Box(decodeStruct(...))` / `new Box(decodeStructLazy(...))`.
- Before writing a new assertion, check whether the fixture or subscriber payload originates from a union-typed descriptor. If it does, expect `Box` wrapping even when the inner value is a struct-like object.
- If the payload access feels repetitive, prefer a tiny helper local to the shared testing utilities rather than ad hoc deep property traversal in every test.

## `--experimental-test-module-mocks` policy

This package intentionally omits the `--experimental-test-module-mocks` flag from its test script in `package.json`. No test in this package uses `t.mock.module()` (confirmed by grep), and the flag is known to trigger indefinite hangs with tsx 4.19.3 on files exceeding ~500 lines (see REP-436, REP-1009). Removing it avoids unnecessary overhead and hang risk. Do not reintroduce the flag unless a new test genuinely uses `t.mock.module()`.

## Fixtures and cross-project reuse

- Be careful when reusing recording fixtures across projects or framework adapters. Shared fixtures can encode assumptions about the source app that do not hold in a different consumer.
- When a fixture only works for one project shape, keep that constraint explicit in the test instead of silently broadening the fixture.
