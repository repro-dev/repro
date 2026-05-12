import {
  configPath,
  discoverIssueIds,
  discoverIssues,
  ensureQueueEntry,
  getConfigValue,
  listConfigItems,
  loadConfigValues,
  publicItem,
  queueForStatus,
  readEngineLogLines,
  removeQueueEntry,
  requeueQueueEntry,
  setConfigValue,
  shapeStatus,
  summarizeIssueStatus,
  unsetConfigValue,
} from '../runtime'

function parseJsonFlag(args: string[]): { json: boolean; rest: string[] } {
  const rest: string[] = []
  let json = process.env.REPROCTL_JSON === 'true'
  for (const arg of args) {
    if (arg === '--json') {
      json = true
      continue
    }
    rest.push(arg)
  }
  return { json, rest }
}

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

function printHuman(lines: string[]): void {
  process.stdout.write(`${lines.join('\n')}\n`)
}

function isQuiet(rest: string[]): boolean {
  return (
    rest.includes('-q') ||
    rest.includes('--quiet') ||
    process.env.REPROCTL_QUIET === 'true'
  )
}

function renderDiscoverHeader(): string {
  return 'ID | TITLE | PRIORITY | ASSIGNEE | LABELS'
}

function renderDiscoverRow(item: {
  issue_identifier: string
  issue_title?: string
  issue_priority?: string
  issue_assignee?: string
  issue_labels?: string[]
}): string {
  return [
    item.issue_identifier,
    item.issue_title ?? '-',
    item.issue_priority ?? '-',
    item.issue_assignee ?? '-',
    (item.issue_labels ?? []).join(', ') || '-',
  ].join(' | ')
}

function renderStatusTable(
  items: Array<ReturnType<typeof shapeStatus>['items'][number]>
): void {
  console.table(
    items.map(item => ({
      ID: item.issue_identifier,
      STATE: item.state,
      TITLE: item.issue_title ?? '-',
      PRIORITY: item.issue_priority ?? '-',
      ASSIGNEE: item.issue_assignee ?? '-',
      LABELS: (item.issue_labels ?? []).join(', ') || '-',
      WORKSPACE: item.workspace_path || '-',
    }))
  )
}

function renderIssueDetail(
  issue: ReturnType<typeof summarizeIssueStatus>
): string[] {
  if (!issue.issue) {
    return ['STATUS', '  - not found']
  }

  return [
    `STATUS ${issue.issue.issue_identifier}`,
    'DETAIL',
    `  state: ${issue.issue.state}`,
    `  title: ${issue.issue.issue_title ?? '-'}`,
    `  priority: ${issue.issue.issue_priority ?? '-'}`,
    `  assignee: ${issue.issue.issue_assignee ?? '-'}`,
    `  labels: ${(issue.issue.issue_labels ?? []).join(', ') || '-'}`,
    `  workspace: ${issue.issue.workspace_path || '-'}`,
    `  reason: ${issue.issue.reason || '-'}`,
    `  updated: ${issue.issue.updated_at || '-'}`,
    `  attempts: ${issue.issue.attempt_count}`,
    'HISTORY',
    ...(issue.history.length > 0
      ? issue.history.map(line => `  - ${line}`)
      : ['  - none']),
    'LOGS',
    ...(issue.logs.length > 0
      ? issue.logs.map(line => `  - ${line}`)
      : ['  - none']),
  ]
}

export function runAutobot(argv: string[]): void {
  const subcmd = argv[2] ?? ''
  const { json, rest } = parseJsonFlag(argv.slice(3))

  switch (subcmd) {
    case 'help':
    case '--help':
    case '-h':
    case '':
      printHuman([
        'Usage: autobot <subcommand>',
        '',
        'Subcommands:',
        '  add <issue> [--json] [--dry-run]',
        '  remove <issue> [-f|--force] [--json] [--dry-run]',
        '  requeue <issue> [--json] [--dry-run]',
        '  list [--json]',
        '  status [<issue>] [--json]',
        '  logs [<issue>] [-t|--tail] [--json]',
        '  discover [--limit N] [--project NAME] [-q] [--json]',
        '  config get <key> [--json]',
        '  config set <key> <value> [--json]',
        '  config unset <key> [--json]',
        '  config list [--json]',
      ])
      return
    case 'config': {
      const action = rest[0] ?? ''
      const key = rest[1] ?? ''
      const value = rest[2] ?? ''
      switch (action) {
        case 'get': {
          const result = getConfigValue(key) as {
            value: unknown
            source: string
          }
          if (json) {
            print(result)
          } else {
            process.stdout.write(
              `${key} = ${result.value} (${result.source})\n`
            )
          }
          return
        }
        case 'set':
          if (json) {
            print(setConfigValue(key, value))
          } else {
            process.stdout.write(`set ${key}\n`)
          }
          return
        case 'unset':
          if (json) {
            print(unsetConfigValue(key))
          } else {
            process.stdout.write(`unset ${key}\n`)
          }
          return
        case 'list':
          if (json) {
            print({
              schema_version: 1,
              config_path: configPath(),
              items: listConfigItems(),
            })
          } else {
            printHuman(
              listConfigItems().map(
                item =>
                  `- ${item.key} = ${item.value} (${item.source}) - ${item.description}`
              )
            )
          }
          return
        default:
          throw new Error(`Unknown subcommand: ${action}`)
      }
    }
    case 'add': {
      const issue = rest[0] ?? ''
      if (!issue) throw new Error('Missing issue identifier')
      if (rest.includes('--dry-run')) {
        if (json) {
          print({ issue_identifier: issue, dry_run: true, queued: false })
          return
        }
        process.stdout.write(`Would queue item ${issue}\n`)
        return
      }
      const item = ensureQueueEntry(issue)
      if (json) {
        print(publicItem(item))
        return
      }
      process.stdout.write(`queued item ${issue}\n`)
      return
    }
    case 'remove': {
      const issue = rest.find(value => !value.startsWith('-')) ?? ''
      const force = rest.includes('-f') || rest.includes('--force')
      if (!issue) throw new Error('Missing issue identifier')
      if (rest.includes('--dry-run')) {
        if (json) {
          print({ issue_identifier: issue, dry_run: true, removed: false })
        } else {
          process.stdout.write(`Would remove queued item ${issue}\n`)
        }
        return
      }
      const result = removeQueueEntry(issue, force)
      if (!result.removed) {
        if (json) {
          print({
            removed: false,
            reason: result.reason,
            issue_identifier: issue,
          })
        } else {
          process.stdout.write(
            result.reason === 'active work'
              ? `not removed: active work ${issue}; use --force\n`
              : `not queued: ${issue}\n`
          )
        }
        return
      }
      if (json) {
        print({
          removed: true,
          issue_identifier: issue,
          state: result.item.claim_state,
        })
      } else {
        process.stdout.write(`removed queued item ${issue}\n`)
      }
      return
    }
    case 'requeue': {
      const issue = rest.find(value => !value.startsWith('-')) ?? ''
      if (!issue) throw new Error('Missing issue identifier')
      if (rest.includes('--dry-run')) {
        if (json) {
          print({ issue_identifier: issue, dry_run: true, requeued: false })
        } else {
          process.stdout.write(`Would requeue item ${issue}\n`)
        }
        return
      }
      const item = requeueQueueEntry(issue)
      if (json) {
        print(publicItem(item))
      } else {
        process.stdout.write(`requeued item ${issue}\n`)
      }
      return
    }
    case 'list': {
      const status = shapeStatus(queueForStatus(), undefined, true)
      if (json) {
        print(status)
      } else {
        process.stdout.write('QUEUE\n')
        renderStatusTable(status.items)
      }
      return
    }
    case 'status': {
      const issue = rest.find(value => !value.startsWith('-'))
      if (issue) {
        const detail = summarizeIssueStatus(issue)
        if (json) {
          print(detail)
        } else {
          printHuman(renderIssueDetail(detail))
        }
        return
      }

      const status = shapeStatus(queueForStatus())
      if (json) {
        print(status)
      } else {
        process.stdout.write('STATUS\n')
        renderStatusTable(status.items)
      }
      return
    }
    case 'logs': {
      const tail = rest.includes('-t') || rest.includes('--tail')
      const issue = rest.find(value => !value.startsWith('-'))
      const lines = readEngineLogLines(issue)
      const outputLines = tail ? lines.slice(-20) : lines
      if (json) {
        print({
          schema_version: 1,
          issue_identifier: issue ?? null,
          tail,
          lines: outputLines,
          generated_at: new Date().toISOString(),
        })
      } else {
        printHuman(outputLines)
      }
      return
    }
    case 'discover': {
      const limitIndex = rest.indexOf('--limit')
      const limit =
        limitIndex >= 0 ? Number.parseInt(rest[limitIndex + 1] ?? '10', 10) : 10
      const projectIndex = rest.indexOf('--project')
      const project =
        projectIndex >= 0 ? (rest[projectIndex + 1] ?? '').trim() : ''
      const quiet = isQuiet(rest)
      const queue = queueForStatus()
      const discovered = discoverIssues(
        queue,
        project.length > 0 ? project : undefined
      ).slice(0, Number.isFinite(limit) ? limit : 10)
      const records =
        discovered.length > 0
          ? discovered
          : discoverIssueIds(queue, project.length > 0 ? project : undefined)
              .slice(0, Number.isFinite(limit) ? limit : 10)
              .map(issue_identifier => ({ issue_identifier }))
      if (json) {
        print({
          schema_version: 1,
          project: project || undefined,
          config: {
            schema_version: 1,
            config_path: configPath(),
            values: loadConfigValues(),
          },
          items: records,
          generated_at: new Date().toISOString(),
        })
      } else {
        if (quiet) {
          process.stdout.write(
            `${records.map(item => item.issue_identifier).join('\n')}\n`
          )
        } else {
          printHuman([
            'DISCOVER',
            renderDiscoverHeader(),
            ...records.map(item => renderDiscoverRow(item)),
          ])
        }
      }
      return
    }
    default:
      throw new Error(`Unknown subcommand: ${subcmd}`)
  }
}
