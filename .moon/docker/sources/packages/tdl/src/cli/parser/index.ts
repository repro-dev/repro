import chalk from 'chalk'
import fs from 'fs'
import { glob } from 'glob'
import { buildAST } from './buildAST'
import { MatchError, ValidationError } from './errors'
import { resolveReferences } from './resolveReferences'
import { topologicalSort } from './topologicalSort'
import { Program } from './types'
import { validate } from './validate'

interface ParserConfig {
  directory: string
  sourceLoader?: (directory: string) => Array<[string, string]>
}

export function defaultSourceLoader(
  directory: string
): Array<[string, string]> {
  const files = glob.sync(`${directory}/*.tdls`)
  return files.map(file => [file, fs.readFileSync(file, 'utf8')])
}

export function parse({
  directory,
  sourceLoader = defaultSourceLoader,
}: ParserConfig) {
  const sources = sourceLoader(directory)

  let program: Program = []

  for (const [filename, source] of sources) {
    const name = filename.replace(`${directory}/`, '').replace('.tdls', '')

    try {
      program.push({
        name,
        filename,
        ast: buildAST(source),
      })
    } catch (error) {
      if (error instanceof MatchError) {
        const message = `Error parsing ${filename}`
        const line = '-'.repeat(message.length)
        const contents = error.message

        console.error(chalk.gray(line))
        console.error(chalk.red(message))
        console.error(chalk.gray(line))
        console.error(contents)
        continue
      }

      throw error
    }
  }

  try {
    program = topologicalSort(program)
    resolveReferences(program)
    validate(program)
  } catch (error) {
    if (error instanceof ValidationError) {
      const message = error.message
      const line = '-'.repeat(message.length)
      const contents = error.interval.contents

      console.error(chalk.gray(line))
      console.error(chalk.red(message))
      console.error(chalk.gray(line))
      console.error(contents)
      return
    }

    throw error
  }

  return program
}
