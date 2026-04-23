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
  await page.goto("https://example.com");
  await recorder.startRecording(page);

  await page.click("text=More information");

  const result = await recorder.stopRecording(page, {
    title: "Example recording",
    description: "Recorded during CI",
  });

  console.log("Recording URL:", result.recordingUrl);
  expect(result.recordingUrl).toContain("/recordings/");
});
