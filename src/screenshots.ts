import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { ScreenshotResult } from './types.js'

type ScreenshotOptions = {
  targetUrl: string
  sourceLocale: string
  targetLocales: string[]
  routes: string[]
  runId: string
  localeStrategy: 'prefix' | 'cookie' | 'query' | 'subdomain'
}

function buildLocaleUrl(
  baseUrl: string,
  locale: string,
  route: string,
  strategy: 'prefix' | 'cookie' | 'query' | 'subdomain'
): string {
  const base = baseUrl.replace(/\/$/, '')
  const cleanRoute = route === '/' ? '' : route

  switch (strategy) {
    case 'prefix':
      return `${base}/${locale}${cleanRoute}`
    case 'cookie':
      return `${base}${cleanRoute}`
    case 'query':
      return `${base}${cleanRoute}?locale=${locale}`
    case 'subdomain': {
      const url = new URL(base)
      return `${url.protocol}//${locale}.${url.host}${cleanRoute}`
    }
    default:
      return `${base}/${locale}${cleanRoute}`
  }
}

export async function captureScreenshots({
  targetUrl,
  sourceLocale,
  targetLocales,
  routes,
  runId,
  localeStrategy,
}: ScreenshotOptions): Promise<ScreenshotResult[]> {
  const allLocales = [
    sourceLocale,
    ...targetLocales.filter((l) => l !== sourceLocale),
  ]

  const outputDir = path.join(os.tmpdir(), `localit-screenshots-${runId}`)
  fs.mkdirSync(outputDir, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const results: ScreenshotResult[] = []

  try {
    for (const locale of allLocales) {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        extraHTTPHeaders: {
          'Accept-Language': `${locale},en;q=0.9`,
        },
      })

      // Always set cookie — harmless if not used
      const urlObj = new URL(targetUrl)
      await context.addCookies([{
        name: 'NEXT_LOCALE',
        value: locale,
        domain: urlObj.hostname,
        path: '/',
      }])

      const page = await context.newPage()

      for (const route of routes) {
        const url = buildLocaleUrl(targetUrl, locale, route, localeStrategy)
        const safeRoute = route.replace(/\//g, '_').replace(/^_/, '') || 'home'
        const filename = `${locale}__${safeRoute}.png`
        const filePath = path.join(outputDir, filename)

        console.log(`   📸 ${locale} ${route} → ${url}`)

        try {
          const response = await page.goto(url, {
            waitUntil: 'networkidle',
            timeout: 20000,
          })

          // If prefix URL gives 404, fallback to cookie strategy
          if (
            response?.status() === 404 &&
            localeStrategy === 'prefix'
          ) {
            console.log(`   → 404 on prefix, trying cookie fallback`)
            await context.addCookies([{
              name: 'NEXT_LOCALE',
              value: locale,
              domain: urlObj.hostname,
              path: '/',
            }])
            const fallbackUrl = `${targetUrl.replace(/\/$/, '')}${route === '/' ? '' : route}`
            await page.goto(fallbackUrl, {
              waitUntil: 'networkidle',
              timeout: 20000,
            })
          }

          await page.waitForTimeout(800)
          await page.screenshot({ path: filePath, fullPage: true })

          results.push({
            locale,
            route,
            filePath,
            outputDir,
            success: true,
            error: null,
          })
        } catch (err) {
          console.warn(
            `   ⚠ Screenshot failed ${locale}${route}: ${(err as Error).message}`
          )
          results.push({
            locale,
            route,
            filePath: null,
            outputDir,
            success: false,
            error: (err as Error).message,
          })
        }
      }

      await context.close()
    }
  } finally {
    await browser.close()
  }

  return results
}