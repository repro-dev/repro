import { chromium, expect, test } from "@playwright/test";
import { createServer } from "node:http";
import { mkdtempSync } from "node:fs";
import path from "node:path";

test("loads runtime.js before page scripts execute", async () => {
  const repoRoot = process.cwd();
  const extensionPath = path.join(repoRoot, "apps/capture/dist");
  const userDataDir = mkdtempSync(path.join(repoRoot, "tmp", "rep-904-"));

  const server = createServer((_, response) => {
    response.writeHead(200, {
      "Content-Type": "text/html",
    });
    response.end(`<!doctype html>
      <html>
        <head>
          <script>
            document.documentElement.dataset.runtimeInstalledAtPageScript = String(
              window.__REPRO_RUNTIME_INSTALLED__ === true
            )
          </script>
        </head>
        <body>ok</body>
      </html>`);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("failed to bind local verification server");
  }

  const context = await chromium.launchPersistentContext(userDataDir, {
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
    headless: false,
  });

  try {
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${address.port}/`, {
      waitUntil: "load",
    });

    await expect(page.locator("html")).toHaveAttribute(
      "data-runtime-installed-at-page-script",
      "true",
    );
  } finally {
    await context.close();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }
});
