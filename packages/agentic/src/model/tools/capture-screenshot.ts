import { captureDocument, createOffscreenDocument } from "@repro/dom-to-image";
import {
  clearDocument,
  createDOMFromVTree,
  patchDocumentElement,
} from "@repro/vdom-renderer";
import { attemptP, resolve } from "fluture";
import { estimateTokens } from "../token-optimization";
import { RecordingDataAccessor } from "../../types";
import { createError, ToolHandler } from "./common";

export const TOOL_DEFINITION = {
  type: "function",
  function: {
    name: "captureScreenshot",
    description:
      "Capture a screenshot of the recording at a specific timestamp. Returns a base64 PNG data URL that can be embedded in a Linear issue description or comment.",
    parameters: {
      type: "object",
      properties: {
        timestampMs: {
          type: "number",
          description:
            "Timestamp in milliseconds from the start of the recording.",
        },
      },
      required: ["timestampMs"],
    },
  },
};

export const handler: ToolHandler = (
  recording: RecordingDataAccessor,
  args,
) => {
  const timestampMs = (args.timestampMs as number) ?? 0;

  const snapshot = recording.getSnapshotAtTime(timestampMs);

  if (!snapshot || !snapshot.dom) {
    return resolve({
      ...createError(
        "No DOM snapshot available at this timestamp",
        "The recording may not have a snapshot at the requested time",
        "Call getRecordingDuration() to check the valid range, then retry with a timestamp within bounds",
      ),
      _tokenEstimate: estimateTokens({ error: true }),
    });
  }

  const vtree = snapshot.dom;
  const pageURL = snapshot.interaction?.pageURL ?? "";
  const [viewportWidth, viewportHeight] = snapshot.interaction?.viewport ?? [
    1280, 720,
  ];
  const resourceMap = recording.getResourceMap();

  return attemptP(async () => {
    const { doc, cleanup } = await createOffscreenDocument(
      viewportWidth,
      viewportHeight,
    );

    try {
      clearDocument(doc);

      const [rootNode, nodeMap] = createDOMFromVTree({
        vtree,
        doc,
        rootNodeMap: {},
        currentPageURL: pageURL,
        resourceBaseURL: "",
        resourceMap,
        isUnderStyleRoot: false,
      });

      patchDocumentElement(vtree, nodeMap, doc.documentElement);

      if (rootNode !== null) {
        doc.documentElement.appendChild(rootNode);
      }

      const dataUrl = await captureDocument(doc, {
        width: viewportWidth,
        height: viewportHeight,
      });

      const result = { timestampMs, dataUrl };
      return { ...result, _tokenEstimate: estimateTokens(result) };
    } finally {
      cleanup();
    }
  });
};
