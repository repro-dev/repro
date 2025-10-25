#!/usr/bin/env node

import * as fs from 'fs'
import path from 'path'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { compile } from './compiler'
import { parse } from './parser'

async function main() {
  const cli = yargs(hideBin(process.argv))
    .command('$0 [directory]', 'Compile TDLS files to TypeScript')
    .positional('directory', {
      describe: 'Directory to parse',
      type: 'string',
      demandOption: true,
    })
    .option('outdir', {
      alias: 'o',
      type: 'string',
      describe: 'Output directory',
    })
    .option('extension', {
      alias: 'e',
      type: 'string',
      describe: 'Output file extension',
      default: 'ts',
    })
    .help()

  const argv = await cli.argv

  if (!argv.directory) {
    yargs.showHelp()
    return
  }

  const directory = path.resolve(argv.directory)
  const outdir = argv.outdir ? path.resolve(argv.outdir) : directory
  const extension = argv.extension

  try {
    const program = parse({ directory })

    if (program) {
      const results = program.map(
        module => [module.name, compile(module.ast)] as const
      )

      if (!fs.existsSync(outdir)) {
        fs.mkdirSync(outdir, { recursive: true })
      }

      for (const [name, output] of results) {
        fs.writeFileSync(
          path.join(outdir, `${name}.${extension}`),
          await output
        )
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      console.log(error.message)
    }
  }
}

main()
