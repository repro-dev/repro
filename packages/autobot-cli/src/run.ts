import type { RepoRef } from '@repro/autobot-core'
import { Future, fork, type FutureInstance } from 'fluture'

import {
  AutobotCliError,
  autobotExitCodes,
  createUsageError,
  toErrorPayload,
} from './errors'
import { createAutobotProgram } from './program'
import {
  renderAutobotConfigList,
  renderAutobotConfigMutation,
  renderAutobotConfigValue,
  renderAutobotDiscoverResults,
  renderAutobotError,
  renderAutobotFlowcraftInspect,
  renderAutobotItemDetail,
  renderAutobotQueueList,
  renderAutobotQueueMutation,
  renderAutobotQueueStatus,
  renderAutobotSupervisorLogs,
  renderAutobotSupervisorStatus,
  renderAutobotWarnings,
  renderAutobotWorkflowDiagram,
  renderAutobotWorkflowList,
  renderAutobotWorkflowValidation,
} from './render/human'
import {
  renderJsonErrorEnvelope,
  renderJsonSuccessEnvelope,
} from './render/json'
import { createAutobotServices, type AutobotServices } from './services'
import type {
  AutobotCommandResult,
  AutobotGlobalOptions,
  AutobotInvocation,
} from './types'

export interface AutobotCliIO {
  stdout: Pick<NodeJS.WriteStream, 'write'>
  stderr: Pick<NodeJS.WriteStream, 'write'>
  isTTY?: boolean
}

function buildRepoRef(
  options: AutobotGlobalOptions,
  useCwdFallback = false
): RepoRef | undefined {
  if (options.repo === null) {
    if (!useCwdFallback) {
      return undefined
    }

    return {
      path: process.cwd(),
      state_dir: options.state_dir ?? '.autobot',
    }
  }

  return {
    path: options.repo,
    state_dir: options.state_dir ?? '.autobot',
  }
}

function buildCommand(commandPath: readonly string[]): string {
  return ['autobot-next', ...commandPath].join(' ')
}

function shouldShowHelp(args: readonly string[]): boolean {
  return args.some(arg => arg === '--help' || arg === '-h')
}

function extractCanonicalCommandPath(
  args: readonly string[],
  program = createAutobotProgram()
): string[] {
  const path: string[] = []
  let current = program

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]!

    if (token.startsWith('-')) {
      if (
        token === '--repo' ||
        token === '--state-dir' ||
        token === '--profile'
      ) {
        index += 1
      }

      continue
    }

    const next = current.commands.find(command => command.name() === token)

    if (next === undefined) {
      break
    }

    path.push(token)
    current = next
  }

  return path
}

function renderSuccess(
  result: AutobotCommandResult,
  json: boolean,
  io: AutobotCliIO,
  colorEnabled: boolean
): void {
  if (json) {
    io.stdout.write(
      renderJsonSuccessEnvelope({
        command: result.command,
        repo: result.repo,
        data: result.data,
        warnings: result.warnings,
      })
    )
    return
  }

  if (result.warnings !== undefined && result.warnings.length > 0) {
    io.stdout.write(`${renderAutobotWarnings(result.warnings)}\n\n`)
  }

  switch (result.kind) {
    case 'item-detail':
      io.stdout.write(
        `${renderAutobotItemDetail(result.data, {
          color: colorEnabled,
        })}\n`
      )
      return
    case 'queue-list':
      io.stdout.write(
        `${renderAutobotQueueList(result.data.items, {
          color: colorEnabled,
        })}\n`
      )
      return
    case 'queue-status':
      io.stdout.write(
        `${renderAutobotQueueStatus(result.data, {
          color: colorEnabled,
        })}\n`
      )
      return
    case 'supervisor-status':
      io.stdout.write(
        `${renderAutobotSupervisorStatus(result.data, {
          color: colorEnabled,
        })}\n`
      )
      return
    case 'supervisor-logs':
      io.stdout.write(
        `${renderAutobotSupervisorLogs(result.data, {
          color: colorEnabled,
        })}\n`
      )
      return
    case 'queue-mutation':
      io.stdout.write(
        `${renderAutobotQueueMutation(result.data, {
          color: colorEnabled,
        })}\n`
      )
      return
    case 'config-list':
      io.stdout.write(`${renderAutobotConfigList(result.data.config)}\n`)
      return
    case 'config-value':
      io.stdout.write(`${renderAutobotConfigValue(result.data.config)}\n`)
      return
    case 'config-mutation':
      io.stdout.write(`${renderAutobotConfigMutation(result.data)}\n`)
      return
    case 'discover':
      if (result.data.quiet) {
        io.stdout.write(
          `${result.data.issue_ids.join('\n')}${
            result.data.issue_ids.length > 0 ? '\n' : ''
          }`
        )
        return
      }

      io.stdout.write(`${renderAutobotDiscoverResults(result.data)}\n`)
      return
    case 'workflow-list':
      io.stdout.write(`${renderAutobotWorkflowList(result.data.workflows)}\n`)
      return
    case 'workflow-validation':
      io.stdout.write(
        `${renderAutobotWorkflowValidation(result.data.validations)}\n`
      )
      return
    case 'workflow-diagram':
      io.stdout.write(`${renderAutobotWorkflowDiagram(result.data.diagram)}\n`)
      return
    case 'flowcraft-inspect':
      io.stdout.write(`${renderAutobotFlowcraftInspect(result.data)}\n`)
      return
  }
}

export function runAutobotCli(
  argv: string[] = process.argv,
  io: AutobotCliIO = process,
  services: AutobotServices = createAutobotServices()
): FutureInstance<unknown, number> {
  return Future((reject, resolve) => {
    void reject
    let invocation: AutobotInvocation | null = null
    const args = argv.slice(2)
    const helpRequested = shouldShowHelp(args)
    const bareCommand = args.length === 0
    const program = createAutobotProgram({
      onInvocation(nextInvocation) {
        invocation = nextInvocation
      },
    })

    program.exitOverride()
    program.configureOutput({
      writeOut: () => undefined,
      writeErr: () => undefined,
      outputError: () => undefined,
    })

    try {
      program.parse(args, { from: 'user' })
    } catch (error) {
      if (helpRequested || (bareCommand && !argv.includes('--json'))) {
        io.stdout.write(`${program.helpInformation()}\n`)
        resolve(autobotExitCodes.ok)
        return () => undefined
      }

      const commandPath = extractCanonicalCommandPath(args)
      const command = buildCommand(commandPath)
      const usageError = createUsageError({
        command,
      })

      if (argv.includes('--json')) {
        io.stdout.write(
          renderJsonErrorEnvelope({
            command,
            error: usageError.toErrorPayload(),
          })
        )
      } else {
        io.stderr.write(`${renderAutobotError(usageError.toErrorPayload())}\n`)
      }

      resolve(usageError.exit_code)
      return () => undefined
    }

    if (invocation === null) {
      if (helpRequested || (bareCommand && !argv.includes('--json'))) {
        io.stdout.write(`${program.helpInformation()}\n`)
        resolve(autobotExitCodes.ok)
        return () => undefined
      }

      if (argv.includes('--json')) {
        const command = buildCommand(extractCanonicalCommandPath(args))
        const usageError = createUsageError({ command })

        io.stdout.write(
          renderJsonErrorEnvelope({
            command,
            error: usageError.toErrorPayload(),
          })
        )

        resolve(usageError.exit_code)
        return () => undefined
      }

      resolve(autobotExitCodes.ok)
      return () => undefined
    }

    const parsedInvocation = invocation as AutobotInvocation
    const shouldHandleShutdownSignals =
      parsedInvocation.command_path[0] === 'supervisor' &&
      parsedInvocation.command_path[1] === 'start'

    let invocationCancel: (() => void) | null = null
    let shutdownRequested = false
    const shutdownSignals: Array<NodeJS.Signals> = ['SIGINT', 'SIGTERM']

    const cleanupShutdownHandlers = () => {
      if (!shouldHandleShutdownSignals) {
        return
      }

      for (const signalName of shutdownSignals) {
        process.off(signalName, handleShutdownSignal)
      }
    }

    const cancelInvocation = () => {
      if (invocationCancel === null) {
        shutdownRequested = true
        return
      }

      const cancel = invocationCancel
      invocationCancel = null
      cleanupShutdownHandlers()
      cancel()

      if (shouldHandleShutdownSignals) {
        resolve(autobotExitCodes.ok)
      }
    }

    const handleShutdownSignal = () => {
      shutdownRequested = true
      cancelInvocation()
    }

    if (shouldHandleShutdownSignals) {
      for (const signalName of shutdownSignals) {
        process.on(signalName, handleShutdownSignal)
      }
    }

    try {
      const result = services.handleInvocation(parsedInvocation).pipe(
        fork(error => {
          cleanupShutdownHandlers()
          invocationCancel = null
          const payload = toErrorPayload(error)
          const command = buildCommand(parsedInvocation.command_path)

          if (parsedInvocation.options.json) {
            io.stdout.write(
              renderJsonErrorEnvelope({
                command,
                repo: buildRepoRef(parsedInvocation.options, true),
                error: payload,
              })
            )
          } else {
            io.stderr.write(
              `${renderAutobotError(payload, {
                color: parsedInvocation.options.color && io.isTTY === true,
              })}\n`
            )
          }

          resolve(
            error instanceof AutobotCliError
              ? error.exit_code
              : autobotExitCodes.failure
          )
        })(result => {
          cleanupShutdownHandlers()
          invocationCancel = null
          renderSuccess(
            result,
            parsedInvocation.options.json,
            io,
            parsedInvocation.options.color && io.isTTY === true
          )
          resolve(autobotExitCodes.ok)
        })
      )

      invocationCancel = result

      if (shutdownRequested) {
        cancelInvocation()
      }

      return cancelInvocation
    } catch (error) {
      cleanupShutdownHandlers()
      invocationCancel = null
      const payload = toErrorPayload(error)
      const command = buildCommand(parsedInvocation.command_path)

      if (parsedInvocation.options.json) {
        io.stdout.write(
          renderJsonErrorEnvelope({
            command,
            repo: buildRepoRef(parsedInvocation.options, true),
            error: payload,
          })
        )
      } else {
        io.stderr.write(
          `${renderAutobotError(payload, {
            color: parsedInvocation.options.color && io.isTTY === true,
          })}\n`
        )
      }

      resolve(
        error instanceof AutobotCliError
          ? error.exit_code
          : autobotExitCodes.failure
      )
      return () => undefined
    }
  })
}

export function main(argv: string[] = process.argv): void {
  runAutobotCli(argv).pipe(
    fork(() => {
      process.exitCode = autobotExitCodes.failure
    })(exitCode => {
      process.exitCode = exitCode
    })
  )
}
