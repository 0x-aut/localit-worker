export type RunStatus = 'pending' | 'running' | 'passed' | 'failed'

export type I18nSetup = {
  type: 'lingo' | 'next-intl' | 'i18next' | 'react-i18next' | 'next-i18n-router' | 'unknown'
  localeStrategy: 'prefix' | 'cookie' | 'query' | 'subdomain'
  hasLingoCompiler: boolean
}

export type BuildResult = {
  success: boolean
  port: number
  pid: number
  error?: string
  i18nSetup: I18nSetup
}

export type Project = {
  id: string
  repo_url: string
  repo_name: string
  branch: string | null
  target_url: string | null
  source_locale: string
  target_locales: string[]
  routes: string[]
  auto_detect_routes: boolean
  coverage_threshold: number
  locale_strategy: 'prefix' | 'cookie' | 'query' | 'subdomain'
}

export type AuditRun = {
  id: string
  project_id: string
  commit_sha: string
  status: RunStatus
  coverage_threshold: number
  projects: Project
}

export type LocaleScanResult = {
  locale: string
  coveragePct: number
  missingKeys: number
  missingKeyNames: string[]
  passed: boolean
}

export type ScanResults = {
  totalMissingKeys: number
  byLocale: Record<string, LocaleScanResult>
}

export type AIAnalysisResult = {
  message: string[];
};

export type IssueDetail = {
  type: 'pixel_diff' | 'missing_screenshot'
  route: string
  locale: string
  description: string
  diffPath: string | null
  diffPct: number | null
  aiAnalysis?: AIAnalysisResult | null
}

export type LocaleDiffResult = {
  issues: number
  issueDetails: IssueDetail[]
  screenshots: ScreenshotResult[]
}

export type DiffResults = {
  totalIssues: number
  byLocale: Record<string, LocaleDiffResult>
}

export type ScreenshotResult = {
  locale: string
  route: string
  filePath: string | null
  outputDir: string
  success: boolean
  error: string | null
  baselineFilePath?: string
  diffFilePath?: string
  diffPct?: number
}