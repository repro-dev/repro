import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { createServer, IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'

type QueueState =
  | 'queued'
  | 'running'
  | 'needs_attention'
  | 'released'
  | 'removed'

type QueueItem = {
  issue_identifier: string
  state: QueueState
  workspace_path: string
  queued_by: string
  updated_at: string
  attempt_count: number
  last_observed_issue_state_name: string
  last_observed_issue_state_type: string
  conditions: Array<{ kind: string; value: string }>
  reason?: string
}

type QueueResponse = {
  schema_version: number
  items: QueueItem[]
  summary: Record<string, number>
  generated_at: string
}

type LogsResponse = {
  engine: { path: string; lines: string[] }
  issues: Array<{
    path: string
    issue_identifier: string
    lines: string[]
    events: Array<Record<string, unknown> | { kind: 'line'; text: string }>
  }>
}

const BOARD_STATES: QueueState[] = [
  'queued',
  'running',
  'needs_attention',
  'released',
  'removed',
]
const STATE_LABELS: Record<QueueState, string> = {
  queued: 'Queued',
  running: 'Running',
  needs_attention: 'Needs attention',
  released: 'Released',
  removed: 'Removed',
}

const repoRoot = path.resolve(__dirname, '..', '..', '..')
const queueScriptPath = path.join(repoRoot, 'scripts/lib/py/autobot_queue.py')

export function getAutobotRoot(cwd = process.cwd(), env = process.env): string {
  return path.resolve(
    env.REPRO_AUTOBOT_ROOT ?? path.resolve(cwd, '../../.autobot')
  )
}

export function getIssueLogPaths(
  root: string,
  issueIdentifier: string
): string[] {
  const runsDir = path.join(root, 'runs')
  if (!pathExists(runsDir)) {
    return []
  }

  const prefix = `${issueIdentifier}-attempt-`
  return readdirSync(runsDir)
    .filter(entry => entry.startsWith(prefix))
    .filter(entry => {
      const entryPath = path.join(runsDir, entry)
      return statSync(entryPath).isDirectory()
    })
    .map(entry => path.join(runsDir, entry, 'events.jsonl'))
    .filter(path => pathExists(path))
    .sort(sortByAttemptPath)
}

export function groupItemsByState(): Record<QueueState, QueueItem[]> {
  return BOARD_STATES.reduce(
    (groups, state) => {
      groups[state] = []
      return groups
    },
    {} as Record<QueueState, QueueItem[]>
  )
}

export function buildBoardColumns(items: QueueItem[]): Array<{
  state: QueueState
  label: string
  count: number
  items: QueueItem[]
}> {
  const groups = groupItemsByState()

  for (const item of items) {
    if (groups[item.state]) {
      groups[item.state].push(item)
    }
  }

  return BOARD_STATES.map(state => ({
    state,
    label: STATE_LABELS[state],
    count: groups[state].length,
    items: groups[state].sort(sortQueueItems),
  }))
}

export function renderHtml(queue: QueueResponse): string {
  const initialData = JSON.stringify({ queue })
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Autobot board</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #0b1020;
        --panel: #11182e;
        --panel-2: #18213b;
        --border: #243158;
        --text: #e6ecff;
        --muted: #8d97b8;
        --accent: #8ab4ff;
        --chip: #253055;
        --shadow: 0 14px 45px rgba(0, 0, 0, 0.35);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Inter, ui-sans-serif, system-ui, sans-serif;
        background: radial-gradient(circle at top, #16213f 0%, var(--bg) 52%);
        color: var(--text);
      }
      header {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        padding: 20px 24px 12px;
        align-items: end;
      }
      h1 { margin: 0; font-size: 24px; }
      .meta { color: var(--muted); font-size: 13px; }
      main { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(320px, 0.95fr); gap: 16px; padding: 12px 24px 24px; }
      .board, .detail { background: rgba(17, 24, 46, 0.94); border: 1px solid var(--border); border-radius: 16px; box-shadow: var(--shadow); }
      .board { padding: 14px; overflow-x: auto; }
      .columns { display: grid; grid-template-columns: repeat(5, minmax(220px, 1fr)); gap: 12px; min-width: 1120px; }
      .column { background: rgba(24, 33, 59, 0.8); border: 1px solid var(--border); border-radius: 14px; padding: 12px; display: flex; flex-direction: column; gap: 10px; min-height: 70vh; }
      .column header { padding: 0; display: flex; align-items: center; justify-content: space-between; }
      .column h2 { margin: 0; font-size: 14px; letter-spacing: 0.02em; text-transform: uppercase; }
      .count { color: var(--muted); font-size: 12px; }
      .task-list { display: flex; flex-direction: column; gap: 10px; }
      button.task {
        appearance: none;
        border: 1px solid var(--border);
        border-radius: 12px;
        background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01));
        color: var(--text);
        padding: 12px;
        text-align: left;
        cursor: pointer;
      }
      button.task:hover, button.task[aria-selected="true"] { border-color: var(--accent); box-shadow: 0 0 0 1px rgba(138, 180, 255, 0.22); }
      .task-top { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
      .issue { font-weight: 700; }
      .badge { background: var(--chip); color: var(--accent); padding: 2px 8px; border-radius: 999px; font-size: 11px; }
      .workspace, .reason, .condition { color: var(--muted); font-size: 12px; margin-top: 8px; word-break: break-word; }
      .condition-list { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
      .condition { margin: 0; padding: 4px 8px; background: rgba(37, 48, 85, 0.75); border-radius: 999px; }
      .detail { padding: 16px; display: flex; flex-direction: column; gap: 14px; }
      .detail pre {
        margin: 0;
        padding: 14px;
        border-radius: 12px;
        background: #091022;
        border: 1px solid var(--border);
        color: #d6ddf9;
        overflow: auto;
        white-space: pre-wrap;
        word-break: break-word;
        min-height: 140px;
      }
      .detail h2 { margin: 0; font-size: 18px; }
      .detail .muted { color: var(--muted); font-size: 13px; }
      .sections { display: grid; gap: 14px; }
      .section { display: grid; gap: 8px; }
      .section h3 { margin: 0; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--accent); }
      .empty { color: var(--muted); font-size: 14px; padding: 16px; }
      @media (max-width: 1100px) {
        main { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <header>
      <div>
        <h1>Autobot queue board</h1>
        <div class="meta" id="queue-meta"></div>
      </div>
      <div class="meta" id="queue-summary"></div>
    </header>
    <main>
      <section class="board" aria-label="Autobot queue board">
        <div class="columns" id="columns"></div>
      </section>
      <aside class="detail" aria-live="polite">
        <div>
          <h2 id="detail-title">Select a task</h2>
          <div class="muted" id="detail-subtitle">Task logs will appear here.</div>
        </div>
        <div class="sections" id="detail-body"></div>
      </aside>
    </main>
    <script>
      const initialData = ${initialData};
      const BOARD_STATES = ${JSON.stringify(BOARD_STATES)};
      const STATE_LABELS = ${JSON.stringify(STATE_LABELS)};
      const queueMeta = document.getElementById('queue-meta');
      const queueSummary = document.getElementById('queue-summary');
      const columns = document.getElementById('columns');
      const detailTitle = document.getElementById('detail-title');
      const detailSubtitle = document.getElementById('detail-subtitle');
      const detailBody = document.getElementById('detail-body');
      let selectedIssue = null;

      function textValue(value) {
        return String(value ?? '');
      }

      function escapeHtml(value) {
        return textValue(value).replace(/[&<>"']/g, char => ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[char]);
      }

      function renderQueue(queue) {
        queueMeta.textContent = 'Generated at ' + textValue(queue.generated_at || 'unknown');
        const summary = queue.summary || {};
        queueSummary.textContent = 'total ' + (summary.total || 0) + ' / queued ' + (summary.queued || 0) + ' / running ' + (summary.running || 0) + ' / attention ' + (summary.needs_attention || 0);

        const itemsByState = new Map(BOARD_STATES.map(state => [state, []]));
        for (const item of queue.items || []) {
          if (itemsByState.has(item.state)) {
            itemsByState.get(item.state).push(item);
          }
        }

        columns.innerHTML = BOARD_STATES.map(state => {
          const tasks = (itemsByState.get(state) || []).map(renderTask).join('') || '<div class="empty">No tasks</div>';
          return '<section class="column" data-state="' + state + '"><header><h2>' + STATE_LABELS[state] + '</h2><span class="count">' + (itemsByState.get(state) || []).length + '</span></header><div class="task-list">' + tasks + '</div></section>';
        }).join('');

        const firstTask = queue.items && queue.items[0];
        if (firstTask) {
          selectTask(firstTask.issue_identifier, firstTask);
        } else {
          detailTitle.textContent = 'No task selected';
          detailSubtitle.textContent = 'The queue is empty.';
          detailBody.innerHTML = '';
        }
      }

      function renderTask(task) {
        const conditions = (task.conditions || []).map(condition => '<span class="condition">' + escapeHtml(condition.kind) + ': ' + escapeHtml(condition.value) + '</span>').join('');
        const reason = task.reason ? '<div class="reason">' + escapeHtml(task.reason) + '</div>' : '';
        return '<button class="task" type="button" data-issue="' + escapeHtml(task.issue_identifier) + '" aria-selected="' + String(selectedIssue === task.issue_identifier) + '"><div class="task-top"><span class="issue">' + escapeHtml(task.issue_identifier) + '</span><span class="badge">' + escapeHtml(task.attempt_count) + ' attempt' + (task.attempt_count === 1 ? '' : 's') + '</span></div><div class="workspace">' + escapeHtml(task.workspace_path || 'No workspace') + '</div>' + reason + (conditions ? '<div class="condition-list">' + conditions + '</div>' : '') + '</button>';
      }

      async function selectTask(issueIdentifier, task) {
        selectedIssue = issueIdentifier;
        detailTitle.textContent = issueIdentifier;
        detailSubtitle.textContent = task ? task.state + ' / ' + (task.workspace_path || 'No workspace') + ' / ' + task.attempt_count + ' attempt' + (task.attempt_count === 1 ? '' : 's') : 'Loading logs...';
        detailBody.innerHTML = '<div class="empty">Loading logs...</div>';
        document.querySelectorAll('button.task').forEach(button => {
          button.setAttribute('aria-selected', String(button.dataset.issue === issueIdentifier));
        });

        const response = await fetch('/api/tasks/' + encodeURIComponent(issueIdentifier) + '/logs');
        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          detailBody.innerHTML = '<div class="empty">' + escapeHtml(error.error?.message || 'Failed to load logs') + '</div>';
          return;
        }

        const payload = await response.json();
        renderTaskDetails(task, payload);
      }

      function renderTaskDetails(task, payload) {
        const engineLines = (payload.engine && payload.engine.lines) || [];
        const issueBundles = payload.issues || [];
        const issueSections = issueBundles.map(bundle => '<div class="section"><h3>' + escapeHtml(bundle.issue_identifier) + ' logs</h3><pre>' + escapeHtml((bundle.lines || []).join('\n') || 'No issue logs found') + '</pre></div>').join('');
        detailBody.innerHTML = '<div class="section"><h3>Task summary</h3><pre>' + escapeHtml(JSON.stringify(task, null, 2)) + '</pre></div><div class="section"><h3>Engine log</h3><pre>' + escapeHtml(engineLines.join('\n') || 'No engine log found') + '</pre></div>' + (issueSections || '<div class="empty">No task logs found</div>');
      }

      columns.addEventListener('click', event => {
        const button = event.target.closest('button.task');
        if (!button) {
          return;
        }
        const issueIdentifier = button.dataset.issue;
        const task = (initialData.queue.items || []).find(item => item.issue_identifier === issueIdentifier);
        if (issueIdentifier && task) {
          void selectTask(issueIdentifier, task);
        }
      });

      renderQueue(initialData.queue);
    </script>
  </body>
</html>`
}

export function loadQueue(root = getAutobotRoot()): QueueResponse {
  const statusPath = path.join(root, 'status.json')
  const rawStatus = readTextFile(statusPath)
  const listResult = runAutobotQueue(['list'], rawStatus)
  if (!listResult.ok) {
    throw new Error(formatPythonFailure('queue list', listResult, statusPath))
  }

  const listPayload = parseJson<QueueResponse>(
    listResult.stdout,
    'queue list output'
  )
  const items = loadPublicItems(root, rawStatus)
  return {
    schema_version: listPayload.schema_version,
    items,
    summary: listPayload.summary,
    generated_at: listPayload.generated_at,
  }
}

export function loadTaskLogs(
  root = getAutobotRoot(),
  issueIdentifier: string
): LogsResponse {
  const statusPath = path.join(root, 'status.json')
  const rawStatus = readTextFile(statusPath)
  const issueLogPaths = getIssueLogPaths(root, issueIdentifier)
  const engineLogPath = path.join(root, 'engine.log')
  const args = [
    'logs',
    '--engine-log',
    engineLogPath,
    ...issueLogPaths.flatMap(path => ['--issue-log', path]),
  ]
  const result = runAutobotQueue(args, rawStatus)
  if (!result.ok) {
    throw new Error(formatPythonFailure('task logs', result, statusPath))
  }

  return parseJson<LogsResponse>(result.stdout, 'log bundle output')
}

function loadPublicItems(root: string, rawStatus: string): QueueItem[] {
  const code = [
    'import json, sys',
    `sys.path.insert(0, ${JSON.stringify(path.dirname(queueScriptPath))})`,
    'from autobot_queue import public_item',
    'payload = json.loads(sys.stdin.read() or "{}")',
    'print(json.dumps([public_item(item) for item in payload.get("items", []) if isinstance(item, dict)]))',
  ].join('\n')
  const result = spawnSync('python3', ['-c', code], {
    encoding: 'utf8',
    input: rawStatus,
  })
  if (result.status !== 0) {
    throw new Error(
      formatSpawnFailure('public queue items', result.stderr, root)
    )
  }
  return parseJson<QueueItem[]>(result.stdout, 'public item output')
}

function runAutobotQueue(args: string[], input: string) {
  const result = spawnSync('python3', [queueScriptPath, ...args], {
    encoding: 'utf8',
    input,
  })
  return {
    ok: result.status === 0,
    stdout: result.stdout,
    stderr: result.stderr,
    status: result.status,
  }
}

function parseJson<T>(text: string, description: string): T {
  try {
    return JSON.parse(text) as T
  } catch (error) {
    throw new Error(`Failed to parse ${description}`)
  }
}

function readTextFile(filePath: string): string {
  try {
    return readFileSync(filePath, 'utf8')
  } catch {
    throw new Error(`Missing autobot status file: ${filePath}`)
  }
}

function formatPythonFailure(
  action: string,
  result: { stderr: string; status: number | null },
  statusPath: string
): string {
  return `Failed to load ${action} from autobot queue (${statusPath}): ${
    result.stderr || `python exited with ${result.status}`
  }`
}

function formatSpawnFailure(
  action: string,
  stderr: string,
  root: string
): string {
  return `Failed to load ${action} for autobot root ${root}: ${
    stderr || 'python exited unsuccessfully'
  }`
}

function pathExists(target: string): boolean {
  try {
    return statSync(target).isFile() || statSync(target).isDirectory()
  } catch {
    return false
  }
}

function sortQueueItems(left: QueueItem, right: QueueItem): number {
  return (
    compareStrings(left.updated_at, right.updated_at) ||
    compareStrings(left.issue_identifier, right.issue_identifier)
  )
}

function compareStrings(left: string, right: string): number {
  if (left === right) {
    return 0
  }

  return left > right ? -1 : 1
}

function sortByAttemptPath(left: string, right: string): number {
  return (
    extractAttemptNumber(left) - extractAttemptNumber(right) ||
    compareStrings(left, right)
  )
}

function extractAttemptNumber(filePath: string): number {
  const match = filePath.match(/-attempt-(\d+)\//)
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY
}

function writeJson(
  res: ServerResponse,
  statusCode: number,
  payload: unknown
): void {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
  })
  res.end(JSON.stringify(payload))
}

function writeError(
  res: ServerResponse,
  statusCode: number,
  message: string,
  detail?: string
): void {
  writeJson(res, statusCode, {
    error: {
      message,
      detail: detail || message,
      recovery: [
        'Check REPRO_AUTOBOT_ROOT',
        'Verify .autobot/status.json exists',
        'Inspect scripts/lib/py/autobot_queue.py',
      ],
    },
  })
}

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  const requestUrl = new URL(req.url || '/', 'http://localhost')
  try {
    if (requestUrl.pathname === '/') {
      const queue = loadQueue()
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(renderHtml(queue))
      return
    }

    if (requestUrl.pathname === '/api/queue') {
      writeJson(res, 200, loadQueue())
      return
    }

    const taskMatch = requestUrl.pathname.match(/^\/api\/tasks\/([^/]+)\/logs$/)
    if (taskMatch) {
      const issueIdentifier = taskMatch[1]
      if (!issueIdentifier) {
        writeError(res, 400, 'Missing task issue identifier')
        return
      }

      writeJson(
        res,
        200,
        loadTaskLogs(undefined, decodeURIComponent(issueIdentifier))
      )
      return
    }

    writeError(res, 404, `No route for ${requestUrl.pathname}`)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown server error'
    writeError(res, 500, message)
  }
}

if (require.main === module) {
  const port = Number(process.env.PORT || 8082)
  createServer(handleRequest).listen(port, '0.0.0.0', () => {
    console.log(`Autobot board listening on http://localhost:${port}`)
  })
}
