import assert from 'node:assert/strict'
import test from 'node:test'

import { createAutobotProgram } from '../program'
import { collectCommandPaths } from './helpers'

test('operate commands and supervisor subcommands are present in the parser tree', () => {
  const program = createAutobotProgram()
  const topLevelNames = program.commands.map(command => command.name()).sort()

  assert.ok(topLevelNames.includes('cancel'))
  assert.ok(topLevelNames.includes('supervisor'))
  assert.ok(topLevelNames.includes('inspect'))
  assert.ok(topLevelNames.includes('reconcile'))
  assert.ok(topLevelNames.includes('retry'))

  assert.deepStrictEqual(
    collectCommandPaths(program)
      .filter(path => path.startsWith('supervisor '))
      .sort(),
    [
      'supervisor debug',
      'supervisor debug workflow',
      'supervisor debug workflow diagram',
      'supervisor debug workflow list',
      'supervisor debug workflow validate',
      'supervisor logs',
      'supervisor run-once',
      'supervisor start',
      'supervisor status',
      'supervisor stop',
    ]
  )

  const supervisorCommand = program.commands.find(
    command => command.name() === 'supervisor'
  )
  const runOnceCommand = supervisorCommand?.commands.find(
    command => command.name() === 'run-once'
  )

  assert.ok(runOnceCommand)
  assert.match(runOnceCommand!.description(), /scheduler tick/i)
  assert.match(runOnceCommand!.description(), /reconcile state/i)
  assert.ok(
    runOnceCommand!.options.some(option => option.flags.includes('--dry-run'))
  )

  const startCommand = supervisorCommand?.commands.find(
    command => command.name() === 'start'
  )

  assert.ok(startCommand)
  assert.match(startCommand!.description(), /bounded full-queue tick pass/i)
  assert.match(startCommand!.description(), /repeating/i)
})
