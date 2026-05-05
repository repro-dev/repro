#!/bin/bash

set -euo pipefail

TESTS_DIR="$(cd "$(dirname "$0")" && pwd -P)"
REPO_ROOT="$(cd "$TESTS_DIR/../../.." && pwd -P)"

PASS=0
FAIL=0
TESTS_RUN=0

_pass() { printf '  ✔ %s\n' "$1"; PASS=$((PASS + 1)); TESTS_RUN=$((TESTS_RUN + 1)); }
_fail() { printf '  ✖ %s\n  %s\n' "$1" "${2:-}" >&2; FAIL=$((FAIL + 1)); TESTS_RUN=$((TESTS_RUN + 1)); }

_run_node() {
  node --input-type=module - "$REPO_ROOT" <<'NODE'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'

const repoRoot = process.argv[2]
const cli = await import(pathToFileURL(`${repoRoot}/scripts/lib/linear/cli.mjs`))
const helpers = await import(
  pathToFileURL(`${repoRoot}/scripts/lib/linear/tests/issue-list.test.mjs`)
)

function makeRecords() {
  return {
    teams: [],
    states: [],
    labels: [],
    projects: [],
    issues: [],
    users: [],
    projectMilestones: [],
    issueLabels: [],
    comments: [],
    relations: [],
    inverseRelations: [],
  }
}

const records = makeRecords()
const result = await cli.execute(['issue', 'list', '--json'], {
  env: { LINEAR_API_KEY: 'api', LINEAR_TEAM: 'REP' },
  clientFactory: async () => helpers.makeClient(records),
})

assert.equal(result.code, 0)
const payload = JSON.parse(result.stdout)
assert.deepEqual(Object.keys(payload), ['items', 'pageInfo'])
assert.equal(payload.items.length, 1)
assert.equal(payload.pageInfo.hasNextPage, true)
assert.equal(payload.pageInfo.endCursor, 'abc123')
assert.equal(payload.items[0].identifier, 'REP-875')
NODE
}

test_default_json_envelope_is_preserved() {
  if _run_node; then
    _pass 'issue list keeps the full JSON envelope without a projection'
  else
    _fail 'issue list keeps the full JSON envelope without a projection' 'node assertion failed'
  fi
}

test_flat_json_projection_returns_requested_fields_only() {
  if node --input-type=module - "$REPO_ROOT" <<'NODE'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'

const repoRoot = process.argv[2]
const cli = await import(pathToFileURL(`${repoRoot}/scripts/lib/linear/cli.mjs`))
const helpers = await import(
  pathToFileURL(`${repoRoot}/scripts/lib/linear/tests/issue-list.test.mjs`)
)

const records = {
  teams: [],
  states: [],
  labels: [],
  projects: [],
  issues: [],
  users: [],
  projectMilestones: [],
  issueLabels: [],
  comments: [],
  relations: [],
  inverseRelations: [],
}

const result = await cli.execute(
  ['issue', 'list', '--json', 'id,identifier,title,priority'],
  {
    env: { LINEAR_API_KEY: 'api', LINEAR_TEAM: 'REP' },
    clientFactory: async () => helpers.makeClient(records),
  },
)

assert.equal(result.code, 0)
const payload = JSON.parse(result.stdout)
assert.equal(Array.isArray(payload), true)
assert.equal(payload.length, 1)
assert.deepEqual(Object.keys(payload[0]), [
  'id',
  'identifier',
  'title',
  'priority',
])
assert.deepEqual(payload[0], {
  id: 'issue-1',
  identifier: 'REP-875',
  title: 'Backlog item',
  priority: 3,
})
NODE
  then
  _pass 'issue list projects flat JSON fields in the requested order'
  else
    _fail 'issue list projects flat JSON fields in the requested order' 'node assertion failed'
  fi
}

test_issue_list_help_mentions_json_projection_syntax() {
  if node --input-type=module - "$REPO_ROOT" <<'NODE'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'

const repoRoot = process.argv[2]
const cli = await import(pathToFileURL(`${repoRoot}/scripts/lib/linear/cli.mjs`))

const result = await cli.execute(['help', 'issue', 'list'], {
  env: { LINEAR_API_KEY: 'api', LINEAR_TEAM: 'REP' },
})

assert.equal(result.code, 0)
assert.match(result.stdout, /--json \[<fields>\]/)
assert.match(result.stdout, /Flat projection only/)
assert.match(result.stdout, /--json id,identifier,title,priority/)
NODE
  then
  _pass 'issue list help documents the flat JSON projection syntax'
  else
    _fail 'issue list help documents the flat JSON projection syntax' 'node assertion failed'
  fi
}

test_default_json_envelope_is_preserved
test_flat_json_projection_returns_requested_fields_only
test_issue_list_help_mentions_json_projection_syntax

echo ""
echo "Results: $PASS passed, $FAIL failed out of $TESTS_RUN tests"

if [ $FAIL -ne 0 ]; then
  exit 1
fi
