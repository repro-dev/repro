import { existsSync, mkdirSync, watch } from 'fs'

const nextDir = '.next'
const exportDir = '.next/export'
const pagesDir = '.next/server/pages'

function ensurePagesDir() {
  mkdirSync(pagesDir, { recursive: true })
  process.exit(0)
}

function watchExportDir() {
  if (existsSync(`${exportDir}/500.html`)) {
    ensurePagesDir()
  }

  try {
    const exportWatcher = watch(exportDir, (_eventType, filename) => {
      if (filename === '500.html') {
        ensurePagesDir()
      }
    })

    exportWatcher.on('error', () => {})
  } catch {
    // The directory may not exist yet; fall back to polling below.
  }
}

try {
  const nextWatcher = watch(nextDir, (_eventType, filename) => {
    if (filename === 'export' && existsSync(exportDir)) {
      watchExportDir()
    }
  })

  nextWatcher.on('error', () => {})
} catch {
  // The directory may not exist yet; fall back to polling below.
}

const poll = setInterval(() => {
  if (existsSync(exportDir)) {
    clearInterval(poll)
    watchExportDir()
  }
}, 5)
