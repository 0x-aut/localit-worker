import { SupabaseClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { ScanResults, DiffResults, ScreenshotResult } from './types.js'

const BUCKET = 'locale-audit-screenshots'

type UploadOptions = {
  supabase: SupabaseClient
  runId: string
  projectId: string
  scanResults: ScanResults
  diffResults: DiffResults
  screenshotResults: ScreenshotResult[]
  coverageThreshold: number
}

export async function uploadResults({
  supabase,
  runId,
  scanResults,
  diffResults,
  coverageThreshold,
}: UploadOptions): Promise<void> {
  const targetLocales = Object.keys(scanResults.byLocale)

  for (const locale of targetLocales) {
    const scan = scanResults.byLocale[locale]
    const diff = diffResults.byLocale[locale]

    const passed =
      (scan?.coveragePct ?? 100) >= coverageThreshold &&
      (diff?.issues ?? 0) === 0

    await supabase.from('locale_results').insert({
      run_id: runId,
      locale,
      coverage_pct: scan?.coveragePct ?? 100,
      missing_keys: scan?.missingKeys ?? 0,
      missing_key_names: scan?.missingKeyNames ?? [],
      visual_issues: diff?.issues ?? 0,
      issue_details: diff?.issueDetails ?? [],
      passed,
    })

    for (const shot of diff?.screenshots ?? []) {
      const row: Record<string, unknown> = {
        run_id: runId,
        locale,
        route: shot.route,
        has_regression: (shot.diffPct ?? 0) > 3,
        diff_pct: shot.diffPct ?? null,
      }

      if (shot.filePath && fs.existsSync(shot.filePath)) {
        row.current_url = await uploadFile(supabase, shot.filePath, runId)
      }
      if (shot.baselineFilePath && fs.existsSync(shot.baselineFilePath)) {
        row.baseline_url = await uploadFile(supabase, shot.baselineFilePath, runId)
      }
      if (shot.diffFilePath && fs.existsSync(shot.diffFilePath)) {
        row.diff_url = await uploadFile(supabase, shot.diffFilePath, runId)
      }

      await supabase.from('screenshots').insert(row)
    }
  }
}

async function uploadFile(
  supabase: SupabaseClient,
  filePath: string,
  runId: string
): Promise<string | null> {
  const filename = path.basename(filePath)
  const storagePath = `${runId}/${filename}`
  const buffer = fs.readFileSync(filePath)

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType: 'image/png',
      upsert: true,
    })

  if (error) {
    console.warn(`   ⚠ Upload failed ${filename}: ${error.message}`)
    return null
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)
  
  console.info(`${filename} uploaded successfully`)
  return data.publicUrl
}