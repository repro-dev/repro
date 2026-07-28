#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const PEN_FILE = resolve(REPO_ROOT, 'repro.pen')
const OUTPUT_DIR = resolve(REPO_ROOT, 'tmp/repro-pen-exports')

interface PenNode {
  type: string
  id: string
  name: string
  reusable?: boolean
  [key: string]: unknown
}

interface PenFile {
  version: string
  children: PenNode[]
}

/** Convert a screen name into a safe filename (lowercase, no colons, hyphens for spaces). */
function sanitizeName(name: string): string {
  return name
    .replaceAll(':', '')
    .replaceAll(/\s+/g, '-')
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]/g, '')
}

/** Find top-level frame nodes that are NOT marked reusable — these are screen exports. */
function findScreens(nodes: PenNode[]): PenNode[] {
  return nodes.filter(n => n.type === 'frame' && !n.reusable)
}

async function main(): Promise<void> {
  // Auth check — non-blocking for local dev
  if (!process.env.PEN_CLI_KEY && !process.env.PENCIL_CLI_KEY) {
    console.error('PEN_CLI_KEY environment variable is not set.')
    console.error(
      'Skipping pen export. Set PEN_CLI_KEY to authenticate with pen.dev.'
    )
    process.exit(0)
  }

  // Ensure output directory
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true })
  }

  // Parse repro.pen
  let penData: PenFile
  try {
    const raw = readFileSync(PEN_FILE, 'utf-8')
    penData = JSON.parse(raw) as PenFile
  } catch (err) {
    console.error(`Failed to read or parse ${PEN_FILE}:`, err)
    process.exit(1)
  }

  const screens = findScreens(penData.children)

  if (screens.length === 0) {
    console.error('No screen frames found in repro.pen — nothing to export.')
    process.exit(0)
  }

  const nodeIds: string[] = []
  for (const screen of screens) {
    const filename = sanitizeName(screen.name) + '.png'
    const outPath = resolve(OUTPUT_DIR, filename)
    nodeIds.push(screen.id)
    // Log progress to stderr so stdout stays clean for piping
    console.error(`Queued: ${screen.name} (${screen.id}) → ${outPath}`)
  }

  console.error(
    `Exporting ${nodeIds.length} screen(s) via pencil interactive...`
  )

  // Build the command(s) to pipe into the pencil interactive session
  const exportCmd = `export_nodes({ nodeIds: ${JSON.stringify(
    nodeIds
  )}, outputDir: ${JSON.stringify(OUTPUT_DIR)}, format: "png" })`
  const commands = [exportCmd, 'exit()'].join('\n')

  await new Promise<void>((resolvePromise, reject) => {
    const pencil = spawn(
      'pencil',
      ['interactive', '-i', PEN_FILE, '-o', '/dev/null'],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      }
    )

    let stderr = ''

    pencil.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    pencil.on('error', err => {
      reject(new Error(`Failed to start pencil CLI: ${err.message}`))
    })

    pencil.on('close', code => {
      if (code !== 0) {
        const msg = `pencil interactive exited with code ${code}`
        console.error(msg)
        if (stderr) console.error('stderr:', stderr)
        reject(new Error(msg))
        return
      }
      if (stderr) console.error(stderr)
      console.error('Pen export complete.')
      resolvePromise()
    })

    // Pipe commands to the interactive session
    pencil.stdin.write(commands)
    pencil.stdin.end()
  })
}

main()
