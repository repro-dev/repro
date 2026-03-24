import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { executeTool, tools } from "../index";
import {
  makeAccessor,
  makeEmptyAccessor,
  makeFetchRequestEvent,
  makeFetchRequestEventWithBody,
  makeFetchResponseEvent,
  makeFetchResponseEventWithBody,
  makeWebSocketCloseEvent,
  makeWebSocketOpenEvent,
} from "./helpers";

describe("tools array — getNetworkRequests", () => {
  it("includes getNetworkRequests tool definition", () => {
    const def = tools.find(
      (t) =>
        (t as { function: { name: string } }).function.name ===
        "getNetworkRequests",
    );
    assert.ok(def !== undefined);
  });

  it("includes detail parameter with summary/normal/full enum", () => {
    const def = tools.find(
      (t) =>
        (t as { function: { name: string } }).function.name ===
        "getNetworkRequests",
    ) as {
      function: {
        parameters: { properties: Record<string, { enum?: string[] }> };
      };
    };
    assert.ok(def !== undefined);
    assert.deepStrictEqual(def.function.parameters.properties["detail"]!.enum, [
      "summary",
      "normal",
      "full",
    ]);
  });
});

describe("executeTool — getNetworkRequests — basic", () => {
  it("returns empty requests array for empty event list", () => {
    const accessor = makeEmptyAccessor();
    const result = executeTool(accessor, "getNetworkRequests", {}) as {
      requests: unknown[];
      summary: unknown;
      _tokenEstimate: number;
    };
    assert.deepStrictEqual(result.requests, []);
    assert.ok(result.summary !== undefined);
    assert.ok(typeof result._tokenEstimate === "number");
  });

  it("returns fetch request with basic fields", () => {
    const events = [
      makeFetchRequestEvent(100, "req1", "https://example.com/api", "GET"),
      makeFetchResponseEvent(200, "req1", 200),
    ];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getNetworkRequests", {}) as {
      requests: Array<{
        timeMs: number;
        type: string;
        method: string;
        url: string;
        status: number;
        durationMs: number;
      }>;
    };
    assert.strictEqual(result.requests.length, 1);
    assert.strictEqual(result.requests[0]!.type, "fetch");
    assert.strictEqual(result.requests[0]!.method, "GET");
    assert.strictEqual(result.requests[0]!.status, 200);
    assert.strictEqual(result.requests[0]!.timeMs, 100);
    assert.strictEqual(result.requests[0]!.durationMs, 100);
  });

  it("returns fetch request without response when no response event exists", () => {
    const events = [
      makeFetchRequestEvent(100, "req1", "https://example.com/api", "POST"),
    ];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getNetworkRequests", {}) as {
      requests: Array<{
        type: string;
        status: number | undefined;
        durationMs: number | undefined;
      }>;
    };
    assert.strictEqual(result.requests.length, 1);
    assert.strictEqual(result.requests[0]!.status, undefined);
    assert.strictEqual(result.requests[0]!.durationMs, undefined);
  });

  it("returns websocket request with basic fields", () => {
    const events = [
      makeWebSocketOpenEvent(50, "ws1", "wss://example.com/socket"),
      makeWebSocketCloseEvent(550, "ws1"),
    ];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getNetworkRequests", {}) as {
      requests: Array<{
        timeMs: number;
        type: string;
        url: string;
        durationMs: number;
      }>;
    };
    assert.strictEqual(result.requests.length, 1);
    assert.strictEqual(result.requests[0]!.type, "ws");
    assert.strictEqual(result.requests[0]!.timeMs, 50);
    assert.strictEqual(result.requests[0]!.durationMs, 500);
  });

  it("returns websocket without durationMs when no close event", () => {
    const events = [
      makeWebSocketOpenEvent(50, "ws1", "wss://example.com/socket"),
    ];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getNetworkRequests", {}) as {
      requests: Array<{ durationMs: number | undefined }>;
    };
    assert.strictEqual(result.requests.length, 1);
    assert.strictEqual(result.requests[0]!.durationMs, undefined);
  });

  it("returns both fetch and websocket requests when no filters applied", () => {
    const events = [
      makeFetchRequestEvent(100, "req1", "https://example.com/api", "GET"),
      makeFetchResponseEvent(150, "req1", 200),
      makeWebSocketOpenEvent(200, "ws1", "wss://example.com/socket"),
    ];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getNetworkRequests", {}) as {
      requests: Array<{ type: string }>;
    };
    assert.strictEqual(result.requests.length, 2);
    assert.strictEqual(result.requests[0]!.type, "fetch");
    assert.strictEqual(result.requests[1]!.type, "ws");
  });
});

describe("executeTool — getNetworkRequests — filters", () => {
  it("filters by statusMin", () => {
    const events = [
      makeFetchRequestEvent(100, "req1", "https://example.com/ok", "GET"),
      makeFetchResponseEvent(150, "req1", 200),
      makeFetchRequestEvent(200, "req2", "https://example.com/notfound", "GET"),
      makeFetchResponseEvent(250, "req2", 404),
      makeFetchRequestEvent(300, "req3", "https://example.com/error", "GET"),
      makeFetchResponseEvent(350, "req3", 500),
    ];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getNetworkRequests", {
      statusMin: 400,
    }) as {
      requests: Array<{ status: number }>;
    };
    assert.strictEqual(result.requests.length, 2);
    assert.strictEqual(result.requests[0]!.status, 404);
    assert.strictEqual(result.requests[1]!.status, 500);
  });

  it("filters by statusMax", () => {
    const events = [
      makeFetchRequestEvent(100, "req1", "https://example.com/ok", "GET"),
      makeFetchResponseEvent(150, "req1", 200),
      makeFetchRequestEvent(200, "req2", "https://example.com/redir", "GET"),
      makeFetchResponseEvent(250, "req2", 301),
      makeFetchRequestEvent(300, "req3", "https://example.com/error", "GET"),
      makeFetchResponseEvent(350, "req3", 500),
    ];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getNetworkRequests", {
      statusMax: 399,
    }) as {
      requests: Array<{ status: number }>;
    };
    assert.strictEqual(result.requests.length, 2);
    assert.strictEqual(result.requests[0]!.status, 200);
    assert.strictEqual(result.requests[1]!.status, 301);
  });

  it("filters by both statusMin and statusMax", () => {
    const events = [
      makeFetchRequestEvent(100, "req1", "https://example.com/ok", "GET"),
      makeFetchResponseEvent(150, "req1", 200),
      makeFetchRequestEvent(200, "req2", "https://example.com/notfound", "GET"),
      makeFetchResponseEvent(250, "req2", 404),
      makeFetchRequestEvent(300, "req3", "https://example.com/error", "GET"),
      makeFetchResponseEvent(350, "req3", 500),
    ];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getNetworkRequests", {
      statusMin: 400,
      statusMax: 499,
    }) as {
      requests: Array<{ status: number }>;
    };
    assert.strictEqual(result.requests.length, 1);
    assert.strictEqual(result.requests[0]!.status, 404);
  });

  it("excludes fetch requests with no response when statusMin is set", () => {
    const events = [
      makeFetchRequestEvent(100, "req1", "https://example.com/pending", "GET"),
    ];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getNetworkRequests", {
      statusMin: 400,
    }) as {
      requests: unknown[];
    };
    assert.strictEqual(result.requests.length, 0);
  });

  it("filters by method (case-insensitive)", () => {
    const events = [
      makeFetchRequestEvent(100, "req1", "https://example.com/1", "GET"),
      makeFetchResponseEvent(150, "req1", 200),
      makeFetchRequestEvent(200, "req2", "https://example.com/2", "POST"),
      makeFetchResponseEvent(250, "req2", 201),
    ];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getNetworkRequests", {
      method: "post",
    }) as {
      requests: Array<{ method: string }>;
    };
    assert.strictEqual(result.requests.length, 1);
    assert.strictEqual(result.requests[0]!.method, "POST");
  });

  it("filters by urlPattern substring match", () => {
    const events = [
      makeFetchRequestEvent(
        100,
        "req1",
        "https://example.com/users/123",
        "GET",
      ),
      makeFetchResponseEvent(150, "req1", 200),
      makeFetchRequestEvent(
        200,
        "req2",
        "https://example.com/products/456",
        "GET",
      ),
      makeFetchResponseEvent(250, "req2", 200),
    ];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getNetworkRequests", {
      urlPattern: "/users/",
    }) as {
      requests: Array<{ url: string }>;
    };
    assert.strictEqual(result.requests.length, 1);
  });

  it("filters fetch requests by timeRangeStartMs", () => {
    const events = [
      makeFetchRequestEvent(100, "req1", "https://example.com/early", "GET"),
      makeFetchResponseEvent(150, "req1", 200),
      makeFetchRequestEvent(500, "req2", "https://example.com/late", "GET"),
      makeFetchResponseEvent(550, "req2", 200),
    ];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getNetworkRequests", {
      timeRangeStartMs: 400,
    }) as {
      requests: Array<{ url: string }>;
    };
    assert.strictEqual(result.requests.length, 1);
  });

  it("filters fetch requests by timeRangeEndMs", () => {
    const events = [
      makeFetchRequestEvent(100, "req1", "https://example.com/early", "GET"),
      makeFetchResponseEvent(150, "req1", 200),
      makeFetchRequestEvent(900, "req2", "https://example.com/late", "GET"),
      makeFetchResponseEvent(950, "req2", 200),
    ];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getNetworkRequests", {
      timeRangeEndMs: 500,
    }) as {
      requests: Array<{ url: string }>;
    };
    assert.strictEqual(result.requests.length, 1);
  });

  it("filters websocket requests by urlPattern", () => {
    const events = [
      makeWebSocketOpenEvent(50, "ws1", "wss://example.com/chat"),
      makeWebSocketOpenEvent(100, "ws2", "wss://example.com/notifications"),
    ];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getNetworkRequests", {
      urlPattern: "/chat",
    }) as {
      requests: Array<{ url: string }>;
    };
    assert.strictEqual(result.requests.length, 1);
  });

  it("excludes websocket requests when statusMin is set", () => {
    const events = [
      makeWebSocketOpenEvent(50, "ws1", "wss://example.com/socket"),
      makeFetchRequestEvent(100, "req1", "https://example.com/api", "GET"),
      makeFetchResponseEvent(150, "req1", 500),
    ];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getNetworkRequests", {
      statusMin: 400,
    }) as {
      requests: Array<{ type: string }>;
    };
    assert.strictEqual(result.requests.length, 1);
    assert.strictEqual(result.requests[0]!.type, "fetch");
  });

  it("excludes websocket requests when method is set", () => {
    const events = [
      makeWebSocketOpenEvent(50, "ws1", "wss://example.com/socket"),
      makeFetchRequestEvent(100, "req1", "https://example.com/api", "GET"),
      makeFetchResponseEvent(150, "req1", 200),
    ];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getNetworkRequests", {
      method: "GET",
    }) as {
      requests: Array<{ type: string }>;
    };
    assert.strictEqual(result.requests.length, 1);
    assert.strictEqual(result.requests[0]!.type, "fetch");
  });

  it("filters websocket requests by timeRangeStartMs", () => {
    const events = [
      makeWebSocketOpenEvent(100, "ws1", "wss://example.com/early"),
      makeWebSocketOpenEvent(800, "ws2", "wss://example.com/late"),
    ];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getNetworkRequests", {
      timeRangeStartMs: 500,
    }) as {
      requests: Array<{ url: string }>;
    };
    assert.strictEqual(result.requests.length, 1);
  });
});

describe("executeTool — getNetworkRequests — _hint", () => {
  it("returns _hint when requests are empty and filters were provided", () => {
    const accessor = makeEmptyAccessor();
    const result = executeTool(accessor, "getNetworkRequests", {
      urlPattern: "/nonexistent",
    }) as { requests: unknown[]; _hint?: string };
    assert.strictEqual(result.requests.length, 0);
    assert.ok(result._hint);
    assert.ok(result._hint.includes("getNetworkRequests"));
  });

  it("does not return _hint when no filters were provided and requests are empty", () => {
    const accessor = makeEmptyAccessor();
    const result = executeTool(accessor, "getNetworkRequests", {}) as {
      requests: unknown[];
      _hint?: string;
    };
    assert.strictEqual(result.requests.length, 0);
    assert.strictEqual(result._hint, undefined);
  });

  it("returns _hint when method filter yields zero results", () => {
    const accessor = makeEmptyAccessor();
    const result = executeTool(accessor, "getNetworkRequests", {
      method: "DELETE",
    }) as { requests: unknown[]; _hint?: string };
    assert.strictEqual(result.requests.length, 0);
    assert.ok(result._hint);
    assert.ok(result._hint.includes("getNetworkRequests"));
  });

  it("returns _hint when statusMin filter yields zero results", () => {
    const events = [
      makeFetchRequestEvent(100, "req1", "https://example.com/ok", "GET"),
      makeFetchResponseEvent(150, "req1", 200),
    ];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getNetworkRequests", {
      statusMin: 400,
    }) as { requests: unknown[]; _hint?: string };
    assert.strictEqual(result.requests.length, 0);
    assert.ok(result._hint);
    assert.ok(result._hint.includes("getNetworkRequests"));
  });

  it("returns _hint when statusMax filter yields zero results", () => {
    const events = [
      makeFetchRequestEvent(100, "req1", "https://example.com/error", "GET"),
      makeFetchResponseEvent(150, "req1", 500),
    ];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getNetworkRequests", {
      statusMax: 299,
    }) as { requests: unknown[]; _hint?: string };
    assert.strictEqual(result.requests.length, 0);
    assert.ok(result._hint);
    assert.ok(result._hint.includes("getNetworkRequests"));
  });
});

describe("executeTool — getNetworkRequests — token optimization / detail tiers", () => {
  it("summary tier: returns pathname-only URL for fetch", () => {
    const events = [
      makeFetchRequestEvent(
        100,
        "req1",
        "https://example.com/api/users?page=2",
        "GET",
      ),
      makeFetchResponseEvent(200, "req1", 200),
    ];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getNetworkRequests", {
      detail: "summary",
    }) as {
      requests: Array<{ url: string; method?: string }>;
    };
    assert.strictEqual(result.requests[0]!.url, "/api/users");
    assert.strictEqual(result.requests[0]!.method, undefined);
  });

  it("normal tier: returns pathname+query URL truncated to 100 chars for fetch", () => {
    const longPath = "/api/" + "a".repeat(200);
    const events = [
      makeFetchRequestEvent(
        100,
        "req1",
        `https://example.com${longPath}`,
        "GET",
      ),
      makeFetchResponseEvent(200, "req1", 200),
    ];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getNetworkRequests", {
      detail: "normal",
    }) as {
      requests: Array<{ url: string }>;
    };
    assert.ok(result.requests[0]!.url.length <= 100);
  });

  it("full tier: returns full URL for fetch", () => {
    const events = [
      makeFetchRequestEvent(
        100,
        "req1",
        "https://example.com/api/users?page=2",
        "GET",
      ),
      makeFetchResponseEvent(200, "req1", 200),
    ];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getNetworkRequests", {
      detail: "full",
    }) as {
      requests: Array<{ url: string }>;
    };
    assert.strictEqual(
      result.requests[0]!.url,
      "https://example.com/api/users?page=2",
    );
  });

  it("normal tier: includes errorBody for failed responses", () => {
    const events = [
      makeFetchRequestEvent(100, "req1", "https://example.com/api", "GET"),
      makeFetchResponseEventWithBody(200, "req1", 500, "Internal Server Error"),
    ];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getNetworkRequests", {
      detail: "normal",
    }) as {
      requests: Array<{ errorBody?: string }>;
    };
    assert.strictEqual(result.requests[0]!.errorBody, "Internal Server Error");
  });

  it("normal tier: does not include errorBody for successful responses", () => {
    const events = [
      makeFetchRequestEvent(100, "req1", "https://example.com/api", "GET"),
      makeFetchResponseEventWithBody(200, "req1", 200, "OK body"),
    ];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getNetworkRequests", {
      detail: "normal",
    }) as {
      requests: Array<{ errorBody?: string }>;
    };
    assert.strictEqual(result.requests[0]!.errorBody, undefined);
  });

  it("normal tier: errorBody is truncated to 500 chars", () => {
    const longBody = "e".repeat(600);
    const events = [
      makeFetchRequestEvent(100, "req1", "https://example.com/api", "GET"),
      makeFetchResponseEventWithBody(200, "req1", 500, longBody),
    ];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getNetworkRequests", {
      detail: "normal",
    }) as {
      requests: Array<{ errorBody?: string }>;
    };
    assert.ok(result.requests[0]!.errorBody !== undefined);
    assert.ok(result.requests[0]!.errorBody!.length <= 500);
  });

  it("full tier: errorBody is truncated to 2000 chars", () => {
    const longBody = "e".repeat(2500);
    const events = [
      makeFetchRequestEvent(100, "req1", "https://example.com/api", "GET"),
      makeFetchResponseEventWithBody(200, "req1", 500, longBody),
    ];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getNetworkRequests", {
      detail: "full",
    }) as {
      requests: Array<{ errorBody?: string }>;
    };
    assert.ok(result.requests[0]!.errorBody !== undefined);
    assert.ok(result.requests[0]!.errorBody!.length <= 2000);
  });

  it("full tier: includes requestBody for POST requests", () => {
    const events = [
      makeFetchRequestEventWithBody(
        100,
        "req1",
        "https://example.com/api",
        "POST",
        '{"name":"test"}',
      ),
      makeFetchResponseEvent(200, "req1", 201),
    ];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getNetworkRequests", {
      detail: "full",
    }) as {
      requests: Array<{ requestBody?: string }>;
    };
    assert.strictEqual(result.requests[0]!.requestBody, '{"name":"test"}');
  });

  it("full tier: does not include requestBody for GET requests", () => {
    const events = [
      makeFetchRequestEventWithBody(
        100,
        "req1",
        "https://example.com/api",
        "GET",
        "should-not-appear",
      ),
      makeFetchResponseEvent(200, "req1", 200),
    ];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getNetworkRequests", {
      detail: "full",
    }) as {
      requests: Array<{ requestBody?: string }>;
    };
    assert.strictEqual(result.requests[0]!.requestBody, undefined);
  });

  it("full tier: includes filtered headers (content-type, x-request-id only)", () => {
    const events = [
      makeFetchRequestEvent(100, "req1", "https://example.com/api", "GET"),
      makeFetchResponseEvent(200, "req1", 200, {
        "content-type": "application/json",
        "x-request-id": "abc123",
        authorization: "Bearer token",
        "set-cookie": "session=xyz",
        "x-custom-header": "custom-value",
      }),
    ];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getNetworkRequests", {
      detail: "full",
    }) as {
      requests: Array<{ headers?: Record<string, string> }>;
    };
    const headers = result.requests[0]!.headers;
    assert.ok(headers !== undefined);
    assert.strictEqual(headers["content-type"], "application/json");
    assert.strictEqual(headers["x-request-id"], "abc123");
    assert.strictEqual(headers["authorization"], undefined);
    assert.strictEqual(headers["set-cookie"], undefined);
    assert.strictEqual(headers["x-custom-header"], undefined);
  });

  it("never includes cookies at any tier", () => {
    for (const detail of ["summary", "normal", "full"] as const) {
      const events = [
        makeFetchRequestEvent(100, "req1", "https://example.com/api", "GET", {
          cookie: "session=abc",
        }),
        makeFetchResponseEvent(200, "req1", 200, {
          "set-cookie": "session=xyz",
        }),
      ];
      const accessor = makeAccessor(events);
      const result = executeTool(accessor, "getNetworkRequests", {
        detail,
      }) as {
        requests: Array<Record<string, unknown>>;
      };
      const req = result.requests[0]!;
      const jsonStr = JSON.stringify(req);
      assert.ok(
        !jsonStr.includes("cookie"),
        `detail=${detail} must not include cookie`,
      );
      assert.ok(
        !jsonStr.includes("set-cookie"),
        `detail=${detail} must not include set-cookie`,
      );
    }
  });

  it("always includes summary stats", () => {
    const events = [
      makeFetchRequestEvent(100, "req1", "https://example.com/api", "GET"),
      makeFetchResponseEvent(150, "req1", 200),
      makeFetchRequestEvent(200, "req2", "https://example.com/api", "POST"),
      makeFetchResponseEvent(250, "req2", 404),
      makeWebSocketOpenEvent(300, "ws1", "wss://example.com/socket"),
    ];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getNetworkRequests", {}) as {
      summary: {
        total: number;
        succeeded: number;
        failed: number;
        byMethod: Record<string, number>;
      };
      _tokenEstimate: number;
    };
    assert.strictEqual(result.summary.total, 3);
    assert.strictEqual(result.summary.succeeded, 1);
    assert.strictEqual(result.summary.failed, 1);
    assert.strictEqual(result.summary.byMethod["GET"], 1);
    assert.strictEqual(result.summary.byMethod["POST"], 1);
    assert.ok(typeof result._tokenEstimate === "number");
  });

  it("summary stats: byMethod excludes websocket requests", () => {
    const events = [
      makeWebSocketOpenEvent(50, "ws1", "wss://example.com/socket"),
    ];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getNetworkRequests", {}) as {
      summary: { byMethod: Record<string, number> };
    };
    assert.deepStrictEqual(result.summary.byMethod, {});
  });

  it("summary stats: pending fetch (no response) counts as succeeded", () => {
    const events = [
      makeFetchRequestEvent(100, "req1", "https://example.com/api", "GET"),
    ];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getNetworkRequests", {}) as {
      summary: { succeeded: number; failed: number };
    };
    assert.strictEqual(result.summary.succeeded, 1);
    assert.strictEqual(result.summary.failed, 0);
  });

  it("always includes _tokenEstimate", () => {
    const accessor = makeEmptyAccessor();
    const result = executeTool(accessor, "getNetworkRequests", {}) as {
      _tokenEstimate: number;
    };
    assert.ok(typeof result._tokenEstimate === "number");
    assert.ok(result._tokenEstimate >= 0);
  });

  it("urlPattern filter applies to original URL (not shortened)", () => {
    const events = [
      makeFetchRequestEvent(
        100,
        "req1",
        "https://api.example.com/users",
        "GET",
      ),
      makeFetchResponseEvent(150, "req1", 200),
      makeFetchRequestEvent(
        200,
        "req2",
        "https://api.example.com/products",
        "GET",
      ),
      makeFetchResponseEvent(250, "req2", 200),
    ];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getNetworkRequests", {
      detail: "summary",
      urlPattern: "/users",
    }) as {
      requests: unknown[];
    };
    assert.strictEqual(result.requests.length, 1);
  });

  it("summary tier: returns pathname-only URL for websocket", () => {
    const events = [
      makeWebSocketOpenEvent(50, "ws1", "wss://example.com/socket?token=abc"),
    ];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getNetworkRequests", {
      detail: "summary",
    }) as {
      requests: Array<{ url: string }>;
    };
    assert.strictEqual(result.requests[0]!.url, "/socket");
  });

  it("normal tier: does not include headers", () => {
    const events = [
      makeFetchRequestEvent(100, "req1", "https://example.com/api", "GET"),
      makeFetchResponseEvent(200, "req1", 200, {
        "content-type": "application/json",
      }),
    ];
    const accessor = makeAccessor(events);
    const result = executeTool(accessor, "getNetworkRequests", {
      detail: "normal",
    }) as {
      requests: Array<Record<string, unknown>>;
    };
    assert.strictEqual(result.requests[0]!["headers"], undefined);
    assert.strictEqual(result.requests[0]!["requestHeaders"], undefined);
    assert.strictEqual(result.requests[0]!["responseHeaders"], undefined);
  });
});
