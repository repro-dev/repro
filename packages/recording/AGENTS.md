# packages/recording

This package captures DOM, network, and framework state for recordings.

## Observer test payloads

- Many observer tests in this package assert against `Box`-wrapped payloads rather than plain objects.
- Before writing a new assertion, read a nearby test and mirror its unwrap/access pattern instead of assuming the observer subscriber receives raw JSON-like data.
- If the payload access feels repetitive, prefer a tiny helper local to the shared testing utilities rather than ad hoc deep property traversal in every test.

## Fixtures and cross-project reuse

- Be careful when reusing recording fixtures across projects or framework adapters. Shared fixtures can encode assumptions about the source app that do not hold in a different consumer.
- When a fixture only works for one project shape, keep that constraint explicit in the test instead of silently broadening the fixture.
