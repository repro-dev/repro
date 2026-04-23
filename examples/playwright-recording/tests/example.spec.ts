import { test, expect } from "@playwright/test";
import { createRecorder } from "@repro/recorder-node";

const apiKey = process.env.REPRO_API_KEY ?? "";
const projectId = process.env.REPRO_PROJECT_ID ?? "";

const recorder = createRecorder({
  apiKey,
  projectId,
  baseUrl: process.env.REPRO_API_URL,
  appUrl: process.env.REPRO_APP_URL,
});

test("records a session", async ({ page }) => {
  await page.goto(
    'data:text/html,<html><body><main id="app">Initial</main></body></html>',
  );
  await recorder.startRecording(page);

  await page.evaluate(() => {
    const app = document.getElementById("app");
    if (app) {
      app.textContent = "Updated";
    }
    console.log("example log");
  });

  const result = await recorder.stopRecording({
    title: "Example recording",
    description: "Recorded during CI",
  });

  console.log("Recording URL:", result.recordingUrl);
  expect(result.recordingUrl).toContain("/recordings/");
});
