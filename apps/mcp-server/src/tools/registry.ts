import { executeTool, tools, RecordingDataAccessor } from '@repro/agentic'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { FutureInstance, fork } from 'fluture'
import z from 'zod'

export function registerTools(
  server: McpServer,
  createAccessor: (
    recordingId: string
  ) => FutureInstance<Error, RecordingDataAccessor>
): void {
  for (const tool of tools) {
    const toolName = tool.function.name
    const description = tool.function.description
    const properties = (tool.function.parameters as { properties?: Record<string, unknown> })?.properties ?? {}

    const shape: Record<string, z.ZodTypeAny> = {
      recordingId: z.string().describe('The encoded recording ID'),
    }

    for (const key of Object.keys(properties)) {
      shape[key] = z.unknown().optional()
    }

    server.tool(
      toolName,
      description,
      shape,
      async (args: Record<string, unknown>) => {
        const recordingId = args.recordingId as string
        const toolArgs = Object.fromEntries(
          Object.entries(args).filter(([k]) => k !== 'recordingId')
        )

        const result = await new Promise<unknown>((resolveP, rejectP) => {
          fork((err: Error) => rejectP(err))((accessor: RecordingDataAccessor) => {
            try {
              resolveP(executeTool(accessor, toolName, toolArgs))
            } catch (err) {
              rejectP(err)
            }
          })(createAccessor(recordingId))
        })

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result),
            },
          ],
        }
      }
    )
  }
}
