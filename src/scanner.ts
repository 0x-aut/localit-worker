import fs from 'fs'
import path from 'path'
import { ScanResults, LocaleScanResult } from './types.js'

const LOCALE_DIR_CANDIDATES = [
  'locales',
  'messages',
  'i18n',
  'lang',
  'translations',
  'public/locales',
  'src/locales',
  'src/messages',
  'src/i18n',
  'src/lang',
]

type ScanOptions = {
  repoDir: string
  sourceLocale: string
  targetLocales: string[]
  coverageThreshold: number
}

export async function scanLocales({
  repoDir,
  sourceLocale,
  targetLocales,
  coverageThreshold,
}: ScanOptions): Promise<ScanResults> {
  const localeDir = findLocaleDir(repoDir)

  if (!localeDir) {
    console.warn('   ⚠ No locale directory found — skipping scan')
    return buildFallback(targetLocales)
  }

  console.log(`   Found locale dir: ${localeDir}`)

  const sourceKeys = loadLocaleKeys(localeDir, sourceLocale)

  if (!sourceKeys) {
    console.warn(`   ⚠ Source locale (${sourceLocale}) not found`)
    return buildFallback(targetLocales)
  }

  const totalKeys = Object.keys(sourceKeys).length
  console.log(`   Source (${sourceLocale}): ${totalKeys} keys`)

  const byLocale: Record<string, LocaleScanResult> = {}
  let totalMissingKeys = 0

  for (const locale of targetLocales) {
    const targetKeys = loadLocaleKeys(localeDir, locale)

    if (!targetKeys) {
      byLocale[locale] = {
        locale,
        coveragePct: 0,
        missingKeys: totalKeys,
        missingKeyNames: Object.keys(sourceKeys),
        passed: false,
      }
      totalMissingKeys += totalKeys
      continue
    }

    const missingKeyNames = findMissingKeys(sourceKeys, targetKeys)
    const translated = totalKeys - missingKeyNames.length
    const coveragePct = totalKeys === 0
      ? 100
      : Math.round((translated / totalKeys) * 100)

    totalMissingKeys += missingKeyNames.length

    byLocale[locale] = {
      locale,
      coveragePct,
      missingKeys: missingKeyNames.length,
      missingKeyNames,
      passed: coveragePct >= coverageThreshold,
    }

    console.log(`   ${locale}: ${coveragePct}% (${missingKeyNames.length} missing)`)
  }

  return { totalMissingKeys, byLocale }
}

function findLocaleDir(repoDir: string): string | null {
  for (const candidate of LOCALE_DIR_CANDIDATES) {
    const fullPath = path.join(repoDir, candidate)
    if (fs.existsSync(fullPath)) return fullPath
  }
  return null
}

function loadLocaleKeys(
  localeDir: string,
  locale: string
): Record<string, unknown> | null {
  const candidates = [
    path.join(localeDir, `${locale}.json`),
    path.join(localeDir, locale, 'common.json'),
    path.join(localeDir, locale, 'index.json'),
    path.join(localeDir, locale, 'translation.json'),
    path.join(localeDir, locale, 'default.json'),
  ]

  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf8')
        return flattenKeys(JSON.parse(raw))
      } catch {
        return null
      }
    }
  }

  return null
}

function flattenKeys(
  obj: Record<string, unknown>,
  prefix = ''
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value)
    ) {
      Object.assign(result, flattenKeys(value as Record<string, unknown>, fullKey))
    } else {
      result[fullKey] = value
    }
  }
  return result
}

function findMissingKeys(
  source: Record<string, unknown>,
  target: Record<string, unknown>
): string[] {
  return Object.keys(source).filter(
    (key) => !(key in target) || target[key] === '' || target[key] === null
  )
}

function buildFallback(targetLocales: string[]): ScanResults {
  const byLocale: Record<string, LocaleScanResult> = {}
  for (const locale of targetLocales) {
    byLocale[locale] = {
      locale,
      coveragePct: 100,
      missingKeys: 0,
      missingKeyNames: [],
      passed: true,
    }
  }
  return { totalMissingKeys: 0, byLocale }
}