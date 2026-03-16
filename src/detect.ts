import fs from 'fs'
import path from 'path'
import { I18nSetup } from './types.js'

export function detectI18nSetup(repoDir: string): I18nSetup {
  const pkgPath = path.join(repoDir, 'package.json')

  if (!fs.existsSync(pkgPath)) {
    return {
      type: 'unknown',
      localeStrategy: 'prefix',
      hasLingoCompiler: false,
    }
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  const allDeps = {
    ...pkg.dependencies ?? {},
    ...pkg.devDependencies ?? {},
  }

  const hasLingoCompiler = '@lingo.dev/compiler' in allDeps
  const hasLingoCI = '@lingo.dev/cli' in allDeps
  const hasNextIntl = 'next-intl' in allDeps
  const hasI18next = 'i18next' in allDeps
  const hasReactI18next = 'react-i18next' in allDeps
  const hasNextI18nRouter = 'next-i18n-router' in allDeps

  // Detect locale strategy from config files
  const localeStrategy = detectLocaleStrategy(repoDir, allDeps)

  // Priority order: Lingo > next-intl > i18next > unknown
  if (hasLingoCompiler || hasLingoCI) {
    return {
      type: 'lingo',
      localeStrategy,
      hasLingoCompiler,
    }
  }

  if (hasNextIntl) {
    return {
      type: 'next-intl',
      localeStrategy: 'prefix', // next-intl defaults to prefix routing
      hasLingoCompiler: false,
    }
  }

  if (hasI18next || hasReactI18next) {
    return {
      type: hasReactI18next ? 'react-i18next' : 'i18next',
      localeStrategy,
      hasLingoCompiler: false,
    }
  }

  if (hasNextI18nRouter) {
    return {
      type: 'next-i18n-router',
      localeStrategy: 'prefix',
      hasLingoCompiler: false,
    }
  }

  return {
    type: 'unknown',
    localeStrategy,
    hasLingoCompiler: false,
  }
}

function detectLocaleStrategy(
  repoDir: string,
  deps: Record<string, string>
): I18nSetup['localeStrategy'] {
  // Check next.config.js/ts for i18n config
  const nextConfigCandidates = [
    'next.config.js',
    'next.config.ts',
    'next.config.mjs',
  ]

  for (const filename of nextConfigCandidates) {
    const fullPath = path.join(repoDir, filename)
    if (!fs.existsSync(fullPath)) continue

    const content = fs.readFileSync(fullPath, 'utf8')

    // Look for explicit locale routing hints
    if (content.includes('localePrefix') && content.includes('never')) {
      return 'cookie'
    }
    if (content.includes('localeDetection: false')) {
      return 'cookie'
    }
  }

  // Check lingo.config.js for localeStrategy
  const lingoConfig = path.join(repoDir, 'lingo.config.js')
  if (fs.existsSync(lingoConfig)) {
    const content = fs.readFileSync(lingoConfig, 'utf8')
    if (content.includes("localeStrategy: 'cookie'")) return 'cookie'
    if (content.includes("localeStrategy: 'query'")) return 'query'
    if (content.includes("localeStrategy: 'subdomain'")) return 'subdomain'
  }

  // Default to prefix — most common with next-intl and Lingo.dev
  return 'prefix'
}

export function logI18nSetup(setup: I18nSetup): void {
  const icons: Record<string, string> = {
    lingo: '🟢',
    'next-intl': '🔵',
    i18next: '🟡',
    'react-i18next': '🟡',
    'next-i18n-router': '🟡',
    unknown: '⚠️',
  }

  console.log(`   ${icons[setup.type]} i18n: ${setup.type}`)
  console.log(`   Strategy: ${setup.localeStrategy}`)
  console.log(`   Lingo Compiler: ${setup.hasLingoCompiler ? 'yes ✓' : 'no'}`)

  if (setup.type === 'unknown') {
    console.warn('   ⚠ No i18n package detected — screenshots may show untranslated UI')
  }
}