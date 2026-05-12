import assert from "node:assert";
import { createServer } from "node:http";
import { describe, it } from "node:test";
import { chromium } from "playwright";
import { createRecorder, type RecorderPage } from "./index";
import { createRecorderFetchRouter } from "./internal";

function createMockApiServer(): Promise<{
  server: ReturnType<typeof createServer>;
  port: number;
}> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "*");
      res.setHeader("Access-Control-Allow-Headers", "*");
      res.setHeader("Connection", "close");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      const url = req.url ?? "";

      if (
        url.match(/\/projects\/[^/]+\/recordings$/) &&
        req.method === "POST"
      ) {
        res.writeHead(200);
        res.end(JSON.stringify({ id: "mock-recording-id" }));
        return;
      }

      if (
        url.match(/\/projects\/[^/]+\/recordings\/[^/]+\/data$/) &&
        req.method === "PUT"
      ) {
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (
        url.match(/\/projects\/[^/]+\/recordings\/[^/]+\/event-index$/) &&
        req.method === "PUT"
      ) {
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (
        url.match(/\/projects\/[^/]+\/recordings\/[^/]+\/resources\/[^/]+$/) &&
        req.method === "PUT"
      ) {
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (
        url.match(/\/projects\/[^/]+\/recordings\/[^/]+\/resource-map$/) &&
        req.method === "PUT"
      ) {
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      res.writeHead(404);
      res.end(JSON.stringify({ error: "Not found" }));
    });

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address === "object") {
        resolve({ server, port: address.port });
      } else {
        reject(new Error("Could not get server port"));
      }
    });
  });
}

function createResourceServer(): Promise<{
  server: ReturnType<typeof createServer>;
  port: number;
  requests: Array<{ authorization: string | null }>;
}> {
  return new Promise((resolve, reject) => {
    const requests: Array<{ authorization: string | null }> = [];

    const server = createServer((req, res) => {
      requests.push({ authorization: req.headers.authorization ?? null });

      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "*");
      res.setHeader("Connection", "close");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
    });

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address === "object") {
        resolve({ server, port: address.port, requests });
      } else {
        reject(new Error("Could not get resource server port"));
      }
    });
  });
}

function createPageServer(): Promise<{
  server: ReturnType<typeof createServer>;
  port: number;
}> {
  return new Promise((resolve, reject) => {
    const server = createServer((_req, res) => {
      res.setHeader("Content-Type", "text/html");
      res.setHeader("Connection", "close");
      res.writeHead(200);
      res.end("<html><body><div id='app'>Hello</div></body></html>");
    });

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address === "object") {
        resolve({ server, port: address.port });
      } else {
        reject(new Error("Could not get page server port"));
      }
    });
  });
}

function createMockRecorderPage(): RecorderPage & {
  started: number;
  stopped: number;
} {
  const state = {
    active: false,
    started: 0,
    stopped: 0,
  };

  const recorder = {
    start() {
      if (state.active) {
        throw new Error("Recorder already started");
      }

      state.active = true;
      state.started += 1;
    },
    stop() {
      state.active = false;
      state.stopped += 1;
    },
    getEvents() {
      return [];
    },
  };

  type RecorderWindowShim = {
    __REPRO_RECORDER__: typeof recorder;
  };

  const recorderWindow: RecorderWindowShim = {
    __REPRO_RECORDER__: recorder,
  };

  const globalWindow = globalThis as unknown as {
    window?: RecorderWindowShim;
  };

  return {
    get started() {
      return state.started;
    },
    get stopped() {
      return state.stopped;
    },
    addScriptTag: async () => {
      globalWindow.window = recorderWindow;
    },
    evaluate: async <R>(
      pageFunction: (...args: Array<unknown>) => R | Promise<R>,
      ...args: Array<unknown>
    ): Promise<R> => {
      const previousWindow = globalWindow.window;
      globalWindow.window = recorderWindow;

      try {
        return await pageFunction(...args);
      } finally {
        if (previousWindow === undefined) {
          delete globalWindow.window;
        } else {
          globalWindow.window = previousWindow;
        }
      }
    },
    url: () => "https://example.com/mock",
    context: () => ({
      browser: () => ({
        version: () => "120.0.0",
        browserType: () => ({
          name: () => "chromium",
        }),
      }),
    }),
  } satisfies RecorderPage & { started: number; stopped: number };
}

describe("recorder-node", () => {
  it("captures events and uploads without leaking the API key to resource fetches", async () => {
    const { server, port } = await createMockApiServer();
    const { server: pageServer, port: pagePort } = await createPageServer();
    const {
      server: resourceServer,
      port: resourcePort,
      requests,
    } = await createResourceServer();
    let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;

    try {
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext();
      const page = await context.newPage();

      await page.goto(`http://127.0.0.1:${pagePort}`);

      const recorder = createRecorder({
        apiKey: "mock-api-key",
        projectId: "mock-project-id",
        baseUrl: `http://127.0.0.1:${port}`,
        appUrl: "https://app.repro.localhost",
      });

      await recorder.startRecording(page);

      const resourceUrl = `http://127.0.0.1:${resourcePort}/asset.png`;
      const resourceResponse = page.waitForResponse(
        (response) =>
          response.url() === resourceUrl && response.status() === 200,
      );

      await page.evaluate((resourceUrl: string) => {
        const div = document.getElementById("app");
        if (div) {
          div.textContent = "World";
        }

        const img = document.createElement("img");
        img.id = "asset";
        document.body.appendChild(img);

        img.src = resourceUrl;
        console.log("test log");
      }, resourceUrl);

      await resourceResponse;
      await page.waitForTimeout(200);

      const result = await recorder.stopRecording({
        title: "Test recording",
        description: "Recorded during test",
      });

      assert.ok(
        result.recordingId && result.recordingId.length > 0,
        "recordingId should be non-empty",
      );
      assert.ok(
        result.recordingUrl.includes("/recordings/"),
        "recordingUrl should include /recordings/",
      );
      assert.ok(
        requests.length > 0,
        "resource server should receive at least one fetch",
      );
      assert.ok(
        requests.every((request) => request.authorization === null),
        "third-party resource fetches should not include the Repro API key",
      );
    } finally {
      if (browser) {
        await browser.close().catch(() => undefined);
      }
      pageServer.closeAllConnections?.();
      pageServer.close();
      resourceServer.closeAllConnections?.();
      resourceServer.close();
      server.closeAllConnections?.();
      server.close();
    }
  });

  it("stops the injected recorder so the same page can start again", async () => {
    const { server, port } = await createMockApiServer();
    const page = createMockRecorderPage();

    try {
      const recorder = createRecorder({
        apiKey: "mock-api-key",
        projectId: "mock-project-id",
        baseUrl: `http://127.0.0.1:${port}`,
        appUrl: "https://app.repro.localhost",
      });

      await recorder.startRecording(page);
      const first = await recorder.stopRecording({
        title: "First recording",
      });
      await recorder.startRecording(page);
      const second = await recorder.stopRecording({
        title: "Second recording",
      });

      assert.ok(first.recordingId.length > 0, "first recording should upload");
      assert.ok(
        second.recordingId.length > 0,
        "second recording should upload",
      );
      assert.equal(page.stopped, 2, "stop should be called for each lifecycle");
    } finally {
      server.closeAllConnections?.();
      server.close();
    }
  });

  it("routes recording API requests through the authenticated client only", () => {
    const calls: Array<{ client: string; url: string }> = [];

    const authClient = {
      fetch: ((url: string) => {
        calls.push({ client: "auth", url });
        return "auth" as never;
      }) as never,
    };

    const anonymousClient = {
      fetch: ((url: string) => {
        calls.push({ client: "anon", url });
        return "anon" as never;
      }) as never,
    };

    const fetch = createRecorderFetchRouter(
      authClient,
      anonymousClient,
      "https://api.repro.localhost",
    );

    assert.equal(
      fetch("https://api.repro.localhost/projects/proj-1/recordings"),
      "auth",
    );
    assert.equal(fetch("https://third-party.example/resource.png"), "anon");

    assert.deepEqual(calls, [
      {
        client: "auth",
        url: "https://api.repro.localhost/projects/proj-1/recordings",
      },
      {
        client: "anon",
        url: "https://third-party.example/resource.png",
      },
    ]);
  });
});
