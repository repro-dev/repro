import { describe, it } from "node:test";
import assert from "node:assert";
import { chromium } from "playwright";
import { createServer } from "node:http";
import { createRecorder } from "./index";

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

describe("recorder-node", () => {
  it("captures events and returns a recording result", async () => {
    const { server, port } = await createMockApiServer();
    let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;

    try {
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext();
      const page = await context.newPage();

      await page.goto(
        `data:text/html,<html><body><div id="app">Hello</div></body></html>`,
      );

      const recorder = createRecorder({
        apiKey: "mock-api-key",
        projectId: "mock-project-id",
        baseUrl: `http://127.0.0.1:${port}`,
        appUrl: "https://app.repro.localhost",
      });

      await recorder.startRecording(page);

      await page.evaluate(() => {
        const div = document.getElementById("app");
        if (div) {
          div.textContent = "World";
        }
        console.log("test log");
      });

      await page.waitForTimeout(200);

      const result = await recorder.stopRecording(page, {
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

      await browser.close();
      browser = null;
    } finally {
      if (browser) {
        await browser.close().catch(() => undefined);
      }
      server.closeAllConnections?.();
      server.close();
    }
  });
});
