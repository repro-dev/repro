import assert from 'node:assert/strict'
import test from 'node:test'

import { createAutobotProgram } from '../program'

test('observe commands are present in the parser tree', () => {
  const program = createAutobotProgram()
  const topLevelNames = program.commands.map(command => command.name()).sort()

  assert.ok(topLevelNames.includes('inspect'))
  assert.ok(topLevelNames.includes('logs'))
  assert.ok(topLevelNames.includes('status'))
})
