import assert from 'node:assert/strict'
import test from 'node:test'

import { createJsonErrorEnvelope, createJsonSuccessEnvelope } from './index'

test('success envelopes use the documented stable shape', () => {
  const repo = {
    path: '/worktrees/autobot',
    state_dir: '.autobot',
  }

  const warnings = [
    {
      code: 'AUTOBOT-001',
      message: 'dry run only',
      severity: 'warning' as const,
    },
  ]

  const envelope = createJsonSuccessEnvelope({
    command: 'autobot-next list --json',
    repo,
    data: { items: [] },
    warnings,
  })

  assert.deepStrictEqual(envelope, {
    schema_version: 1,
    ok: true,
    command: 'autobot-next list --json',
    repo,
    data: { items: [] },
    warnings,
  })
})

test('error envelopes preserve recovery guidance and omit repo when absent', () => {
  const envelope = createJsonErrorEnvelope({
    command: 'autobot-next retry REP-123',
    error: {
      code: 'AUTOBOT-RETRY-NOT-ALLOWED',
      message: 'retry is only available after failed runs',
      what_failed: 'retry request',
      likely_cause: 'the item is not in failed state',
      recovery_commands: [
        'autobot-next status REP-123 --json',
        'autobot-next cancel REP-123',
      ],
      details: null,
    },
  })

  assert.deepStrictEqual(envelope, {
    schema_version: 1,
    ok: false,
    command: 'autobot-next retry REP-123',
    error: {
      code: 'AUTOBOT-RETRY-NOT-ALLOWED',
      message: 'retry is only available after failed runs',
      what_failed: 'retry request',
      likely_cause: 'the item is not in failed state',
      recovery_commands: [
        'autobot-next status REP-123 --json',
        'autobot-next cancel REP-123',
      ],
      details: null,
    },
    warnings: [],
  })
  assert.equal('repo' in envelope, false)
})
