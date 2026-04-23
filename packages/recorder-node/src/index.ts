import { createApiClient } from "@repro/api-client";
import { RecordingMode, SourceEvent, SourceEventView } from "@repro/domain";
import { createUploadWorker } from "@repro/recording-api";
import { fromByteString } from "@repro/wire-formats";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Page } from "playwright";

declare global {
  interface Window {
    __REPRO_RECORDER__: {
      start(): void;
      stop(): void;
      getEvents(): string[];
    };
  }
}

const INJECT_SCRIPT_PATH = existsSync(join(__dirname, "inject.js"))
  ? join(__dirname, "inject.js")
  : join(__dirname, "..", "dist", "inject.js");

export interface RecorderOptions {
  apiKey: string;
  projectId: string;
  baseUrl?: string;
  appUrl?: string;
}

export interface RecordingResult {
  recordingId: string;
  recordingUrl: string;
}

export interface Recorder {
  startRecording(page: Page): Promise<void>;
  stopRecording(
    page: Page,
    metadata?: { title?: string; description?: string },
  ): Promise<RecordingResult>;
}

export function createRecorder(options: RecorderOptions): Recorder {
  const baseUrl = options.baseUrl ?? "https://api.repro.localhost";
  const appUrl = options.appUrl ?? "https://app.repro.localhost";

  const apiClient = createApiClient({
    baseUrl,
    authStorage: "memory",
  });

  const uploadWorker = createUploadWorker(apiClient, {
    withEncryptionScheme: "none",
  });

  async function startRecording(page: Page): Promise<void> {
    await apiClient.wrapP(apiClient.authStore.setSessionToken(options.apiKey));

    await page.addScriptTag({ path: INJECT_SCRIPT_PATH });
    await page.evaluate(() => window.__REPRO_RECORDER__.start());
  }

  async function stopRecording(
    page: Page,
    metadata?: { title?: string; description?: string },
  ): Promise<RecordingResult> {
    const eventStrings = await page.evaluate(() =>
      window.__REPRO_RECORDER__.getEvents(),
    );

    const events: Array<SourceEvent> = eventStrings.map((str) =>
      SourceEventView.over(new DataView(fromByteString(str).buffer)),
    );

    const duration = events.reduce((max, event) => {
      const time = event.get("time").orElse(0);
      return time > max ? time : max;
    }, 0);

    const browser = page.context().browser();
    const browserName = browser?.browserType().name() ?? null;
    const browserVersion = browser?.version() ?? null;

    const url = page.url();

    const ref = uploadWorker.enqueue({
      projectId: options.projectId,
      title: metadata?.title ?? "Untitled recording",
      description: metadata?.description ?? "",
      url,
      mode: RecordingMode.Replay,
      duration,
      events,
      browserName,
      browserVersion,
      operatingSystem: null,
    });

    return new Promise((resolve, reject) => {
      const interval = setInterval(() => {
        const progress = uploadWorker.getProgress(ref);

        if (!progress) {
          clearInterval(interval);
          reject(new Error("Upload progress not found"));
          return;
        }

        if (progress.error) {
          clearInterval(interval);
          reject(
            new Error(
              `Upload failed: ${progress.error.name}: ${progress.error.message}`,
            ),
          );
          return;
        }

        if (progress.completed && progress.recordingId) {
          clearInterval(interval);
          resolve({
            recordingId: progress.recordingId,
            recordingUrl: `${appUrl}/recordings/${progress.recordingId}`,
          });
        }
      }, 250);
    });
  }

  return {
    startRecording,
    stopRecording,
  };
}
