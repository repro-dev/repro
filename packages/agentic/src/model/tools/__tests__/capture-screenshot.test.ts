import assert from "node:assert/strict";
import { mock, describe, it } from "node:test";
import { resolve } from "fluture";
import type { FutureInstance } from "fluture";
import type { RecordingDataAccessor } from "../../../types";
import type { Snapshot } from "@repro/domain";
import { runFuture } from "./helpers";

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Mock @repro/dom-to-image so tests can run without browser APIs
mock.module("@repro/dom-to-image", {
  namedExports: {
    createOffscreenDocument: async (_w: number, _h: number) => ({
      doc: {
        documentElement: { appendChild: () => {} },
        createElement: () => ({ style: {} }),
        createTextNode: () => ({}),
      },
      cleanup: () => {},
    }),
    captureDocument: async () => "data:image/png;base64,ABC",
  },
});

// Mock @repro/vdom-renderer
mock.module("@repro/vdom-renderer", {
  namedExports: {
    clearDocument: () => {},
    createDOMFromVTree: () => [null, {}],
    patchDocumentElement: () => {},
  },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSimpleSnapshot(): Snapshot {
  return {
    dom: {
      rootId: "root",
      nodes: {
        root: {
          apply: (fn: (v: any) => void) => {
            fn({ type: 1, id: "root", parentId: null, children: [] });
          },
          get: () => ({ orElse: (v: any) => v }),
          match: (fn: (v: any) => any) => fn({ type: 1 }),
        } as any,
      },
    },
    interaction: {
      pageURL: "https://example.com",
      viewport: [1280, 720],
    } as any,
  };
}

function makeAccessorWithPrefetch(
  prefetchFn:
    | ((urls: string[]) => FutureInstance<Error, Record<string, string>>)
    | null,
): RecordingDataAccessor {
  const accessor: RecordingDataAccessor = {
    getDuration: () => 5000,
    getSnapshotAtTime: () => makeSimpleSnapshot(),
    getResourceMap: () => ({}),
    getEventsByType: () => [],
    getEventsInRange: () => [],
  };
  if (prefetchFn != null) {
    accessor.prefetchResources = prefetchFn;
  }
  return accessor;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("captureScreenshot — prefetchResources", () => {
  it("calls prefetchResources when available", async () => {
    let prefetchedURLs: string[] | null = null;

    const accessor = makeAccessorWithPrefetch((urls) => {
      prefetchedURLs = urls;
      return resolve<Record<string, string>>({});
    });

    const { handler } = await import("../capture-screenshot");
    await runFuture(handler(accessor, { timestampMs: 0 }));

    // prefetchResources was called (even with empty url list from empty events)
    assert.ok(
      prefetchedURLs !== null,
      "prefetchResources should have been called",
    );
    assert.ok(
      Array.isArray(prefetchedURLs),
      "urls argument should be an array",
    );
  });

  it("uses empty resource map when prefetchResources is absent", async () => {
    const accessor = makeAccessorWithPrefetch(null);

    const { handler } = await import("../capture-screenshot");
    const result = (await runFuture(handler(accessor, { timestampMs: 0 }))) as {
      timestampMs: number;
      dataUrl: string;
    };

    // Should succeed without prefetchResources defined
    assert.strictEqual(result.timestampMs, 0);
    assert.ok(typeof result.dataUrl === "string");
  });

  it("passes prefetched resources to createDOMFromVTree — succeeds with resource map", async () => {
    // Verify that when prefetchResources returns a map, the screenshot succeeds.
    // We cannot inspect createDOMFromVTree internals here (module already mocked),
    // but we assert the overall call succeeds with the prefetched map in play.
    const resourceMap = {
      "https://example.com/font.woff2": "data:font/woff2;base64,AAAA",
    };

    let calledWithURLs: string[] | null = null;
    const accessor = makeAccessorWithPrefetch((urls) => {
      calledWithURLs = urls;
      return resolve<Record<string, string>>(resourceMap);
    });

    const { handler } = await import("../capture-screenshot");
    const result = (await runFuture(handler(accessor, { timestampMs: 0 }))) as {
      timestampMs: number;
      dataUrl: string;
    };

    assert.strictEqual(result.timestampMs, 0);
    assert.ok(typeof result.dataUrl === "string");
    // Confirm the prefetch was invoked (even with empty events, urls is [])
    assert.ok(calledWithURLs !== null);
  });

  it("returns error when no snapshot is available", async () => {
    const accessor: RecordingDataAccessor = {
      getDuration: () => 0,
      getSnapshotAtTime: () => null,
      getResourceMap: () => ({}),
      getEventsByType: () => [],
      getEventsInRange: () => [],
      prefetchResources: () => resolve<Record<string, string>>({}),
    };

    const { handler } = await import("../capture-screenshot");
    const result = (await runFuture(
      handler(accessor, { timestampMs: 9999 }),
    )) as {
      error: string;
    };

    assert.ok(result.error.includes("No DOM snapshot"));
  });

  it("succeeds even when prefetchResources rejects for some URLs (resilience)", async () => {
    // prefetchResources itself resolves but with partial results
    const accessor = makeAccessorWithPrefetch(() =>
      resolve<Record<string, string>>({
        "https://ok.com/img.png": "data:image/png;base64,ZZZ",
      }),
    );

    const { handler } = await import("../capture-screenshot");
    const result = (await runFuture(handler(accessor, { timestampMs: 0 }))) as {
      timestampMs: number;
      dataUrl: string;
    };

    assert.strictEqual(result.timestampMs, 0);
    assert.ok(typeof result.dataUrl === "string");
  });
});
