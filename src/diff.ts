import { createCanvas, loadImage } from 'canvas'
import pixelmatch from 'pixelmatch'
import fs from 'fs'
import path from 'path'
import {
  ScreenshotResult,
  DiffResults,
  LocaleDiffResult,
  IssueDetail,
} from './types.js'
import { analyzeDiffWithAI } from './imageservice.js';

type DiffOptions = {
  screenshots: ScreenshotResult[]
  sourceLocale: string
}

export async function runDiff({
  screenshots,
  sourceLocale,
}: DiffOptions): Promise<DiffResults> {
  const byLocale: Record<string, LocaleDiffResult> = {}
  let totalIssues = 0

  const byRoute: Record<string, Record<string, ScreenshotResult>> = {}
  for (const shot of screenshots) {
    if (!byRoute[shot.route]) byRoute[shot.route] = {}
    byRoute[shot.route][shot.locale] = shot
  }

  for (const [route, localeMap] of Object.entries(byRoute)) {
    const baseline = localeMap[sourceLocale]

    for (const [locale, shot] of Object.entries(localeMap)) {
      if (!byLocale[locale]) {
        byLocale[locale] = { issues: 0, issueDetails: [], screenshots: [] }
      }

      if (locale === sourceLocale) {
        byLocale[locale].screenshots.push({
          ...shot,
          route,
        })
        continue
      }

      if (!shot.success || !shot.filePath) {
        byLocale[locale].issues++
        totalIssues++
        byLocale[locale].issueDetails.push({
          type: 'missing_screenshot',
          route,
          locale,
          description: shot.error ?? 'Screenshot capture failed',
          diffPath: null,
          diffPct: null,
        })
        continue
      }

      if (!baseline?.success || !baseline?.filePath) continue

      try {
        const diffResult = await pixelDiff(
          baseline.filePath,
          shot.filePath,
          shot.outputDir,
          locale,
          route
        )

        byLocale[locale].screenshots.push({
          ...shot,
          baselineFilePath: baseline.filePath,
          diffFilePath: diffResult.diffPath,
          diffPct: diffResult.diffPct,
        })

        if (diffResult.diffPct > 5) {
          const aiAnalysis = await analyzeDiffWithAI(
            fs.readFileSync(baseline.filePath),
            fs.readFileSync(shot.filePath),
            fs.readFileSync(diffResult.diffPath),
            locale
          )
          byLocale[locale].issues++
          totalIssues++
          byLocale[locale].issueDetails.push({
            type: 'pixel_diff',
            route,
            locale,
            description: `${diffResult.diffPct.toFixed(1)}% pixel difference vs ${sourceLocale}`,
            diffPath: diffResult.diffPath,
            diffPct: diffResult.diffPct,
            aiAnalysis
          })
        }
      } catch (err) {
        console.warn(
          `   ⚠ Diff failed ${locale}${route}: ${(err as Error).message}`
        )
      }
    }
  }

  return { totalIssues, byLocale }
}

async function pixelDiff(
  baselinePath: string,
  currentPath: string,
  outputDir: string,
  locale: string,
  route: string
): Promise<{ diffPath: string; diffPct: number }> {
  const [baseImg, currImg] = await Promise.all([
    loadImage(baselinePath),
    loadImage(currentPath),
  ])

  const width = Math.max(baseImg.width, currImg.width)
  const height = Math.max(baseImg.height, currImg.height)

  const baseCanvas = createCanvas(width, height)
  const baseCtx = baseCanvas.getContext('2d')
  baseCtx.fillStyle = '#ffffff'
  baseCtx.fillRect(0, 0, width, height)
  baseCtx.drawImage(baseImg, 0, 0)

  const currCanvas = createCanvas(width, height)
  const currCtx = currCanvas.getContext('2d')
  currCtx.fillStyle = '#ffffff'
  currCtx.fillRect(0, 0, width, height)
  currCtx.drawImage(currImg, 0, 0)

  const diffCanvas = createCanvas(width, height)
  const diffCtx = diffCanvas.getContext('2d')

  const baseData = baseCtx.getImageData(0, 0, width, height)
  const currData = currCtx.getImageData(0, 0, width, height)
  const diffData = diffCtx.createImageData(width, height)

  const numDiffPixels = pixelmatch(
    baseData.data,
    currData.data,
    diffData.data,
    width,
    height,
    { threshold: 0.1, includeAA: false, diffColor: [255, 60, 60] }
  )

  diffCtx.putImageData(diffData, 0, 0)

  const safeRoute = route.replace(/\//g, '_').replace(/^_/, '') || 'home'
  const diffPath = path.join(outputDir, `diff__${locale}__${safeRoute}.png`)
  fs.writeFileSync(diffPath, diffCanvas.toBuffer('image/png'))

  return {
    diffPath,
    diffPct: (numDiffPixels / (width * height)) * 100,
  }
}