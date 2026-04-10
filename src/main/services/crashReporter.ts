import log from 'electron-log/main'
import { app } from 'electron'
import { join } from 'path'
import { writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync, readFileSync } from 'fs'

const CRASH_DIR = join(app.getPath('userData'), 'crash-reports')
const MAX_REPORTS = 20

export interface CrashReportData {
  message: string
  stack?: string
  componentStack?: string
  context?: string
}

export interface CrashReport extends CrashReportData {
  id: string
  timestamp: number
  appVersion: string
  platform: string
}

export class CrashReporterService {
  constructor() {
    try { mkdirSync(CRASH_DIR, { recursive: true }) } catch {}
    this.pruneOldReports()
    this.setupGlobalHandlers()
  }

  save(report: CrashReportData): string {
    const full: CrashReport = {
      ...report,
      id: Date.now().toString(36),
      timestamp: Date.now(),
      appVersion: app.getVersion(),
      platform: process.platform,
    }
    try {
      writeFileSync(join(CRASH_DIR, `${full.id}.json`), JSON.stringify(full, null, 2), 'utf8')
    } catch {}
    log.error('Crash reported:', full.message)
    return full.id
  }

  list(): CrashReport[] {
    if (!existsSync(CRASH_DIR)) return []
    return readdirSync(CRASH_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => JSON.parse(readFileSync(join(CRASH_DIR, f), 'utf8')))
      .sort((a, b) => b.timestamp - a.timestamp)
  }

  private pruneOldReports(): void {
    try {
      const files = readdirSync(CRASH_DIR).filter(f => f.endsWith('.json')).sort().reverse()
      files.slice(MAX_REPORTS).forEach(f => unlinkSync(join(CRASH_DIR, f)))
    } catch {}
  }

  private setupGlobalHandlers(): void {
    process.on('uncaughtException', (err) => {
      this.save({ message: err.message, stack: err.stack, context: 'main-process' })
      log.error('Uncaught exception:', err.message)
    })
    process.on('unhandledRejection', (reason) => {
      const msg = reason instanceof Error ? reason.message : String(reason)
      this.save({ message: `Unhandled rejection: ${msg}`, context: 'main-process' })
    })
  }
}

export const crashReporter = new CrashReporterService()
