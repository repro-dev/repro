import { attemptP } from "fluture";
import { Context, StreamProvider, ToolDefinition } from "../types";

// Calls OpenRouter directly with the same model and parameters used by the
// production API server (apps/api-server/src/services/agentic.ts), bypassing
// the HTTP proxy so the eval harness can run standalone in Node.js.
export function createOpenRouterStreamProvider(
  apiKey: string,
  modelId: string,
): (systemPrompt: string) => StreamProvider {
  return (systemPrompt: string): StreamProvider => {
    return (
      context: Context,
      tools: ToolDefinition[],
      signal?: AbortSignal,
    ) => {
      const messages = [
        { role: "system" as const, content: systemPrompt },
        ...context,
      ];

      return attemptP(async () => {
        const response = await fetch(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: modelId,
              stream: true,
              tool_choice: "auto",
              tools,
              messages,
              // The `reasoning.effort` parameter is only supported by OpenAI
              // models (o1/o3/GPT-5 series). Sending it to other providers
              // (Qwen, Gemini, Kimi, etc.) causes them to suppress their final
              // response or behave unexpectedly. See OpenRouter reasoning docs.
              ...(modelId.startsWith("openai/") && {
                reasoning: {
                  effort: "medium",
                  exclude: true,
                },
              }),
            }),
            signal,
          },
        );

        if (!response.ok) {
          throw { status: response.status };
        }

        if (!response.body) {
          throw new Error("Response body is null");
        }

        // Transform the raw SSE byte stream into { data: string } objects.
        // Each text/event-stream line is "data: <json>" or "data: [DONE]".
        const decoder = new TextDecoder();
        let buffer = "";

        const transform = new TransformStream<Uint8Array, { data: string }>({
          transform(chunk, controller) {
            buffer += decoder.decode(chunk, { stream: true });
            const lines = buffer.split("\n");
            // Keep the last (possibly incomplete) line in the buffer
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                controller.enqueue({ data: line.slice(6) });
              }
            }
          },
          flush(controller) {
            // Handle any remaining buffered content
            if (buffer.startsWith("data: ")) {
              controller.enqueue({ data: buffer.slice(6) });
            }
          },
        });

        return response.body.pipeThrough(transform) as ReadableStream<{
          data: string;
        }>;
      });
    };
  };
}
