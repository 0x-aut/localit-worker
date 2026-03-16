import { SupabaseClient } from '@supabase/supabase-js'
import { cloneRepo } from './clone.js'
import { scanLocales } from './scanner.js'
import { captureScreenshots } from './screenshots.js'
import { runDiff } from './diff.js'
import { uploadResults } from './uploader.js'
import { cleanup } from './cleanup.js'
import { detectI18nSetup, logI18nSetup } from './detect.js'
import { buildAndStartApp, killApp } from './builder.js'
import { AuditRun } from './types.js'
import path from 'path'
import os from 'os'

export async function processRun(
  run: AuditRun,
  supabase: SupabaseClient
): Promise<void> {
  const runId = run.id
  const project = run.projects
  const tmpDir = path.join(os.tmpdir(), `localit-${runId}`)

  console.log(`\n🚀 Processing run ${runId}`)
  console.log(`   Repo: ${project.repo_url}`)
  console.log(`   Target URL: ${project.target_url ?? 'none — will build locally'}`)

  await supabase
    .from('audit_runs')
    .update({ status: 'running' })
    .eq('id', runId)

  let appPid: number | null = null

  try {
    // ── Step 1: Clone ──────────────────────────────────────────────────────
    console.log('\n📦 Step 1/5 — Cloning repo...')
    await cloneRepo({
      repoUrl: project.repo_url,
      branch: project.branch ?? 'main',
      targetDir: tmpDir,
    })
    console.log('   ✓ Cloned')

    // ── Step 2: Detect i18n setup ──────────────────────────────────────────
    console.log('\n🔍 Step 2/5 — Detecting i18n setup...')
    const i18nSetup = detectI18nSetup(tmpDir)
    logI18nSetup(i18nSetup)

    // ── Step 3: Scan locale files ──────────────────────────────────────────
    console.log('\n📋 Step 3/5 — Scanning locale files...')
    const scanResults = await scanLocales({
      repoDir: tmpDir,
      sourceLocale: project.source_locale ?? 'en',
      targetLocales: project.target_locales ?? [],
      coverageThreshold: project.coverage_threshold ?? 90,
    })
    console.log(`   ✓ ${scanResults.totalMissingKeys} missing keys`)

    // ── Step 4: Build + screenshot ─────────────────────────────────────────
    console.log('\n🏗️  Step 4/5 — Building and starting app...')

    let appBaseUrl: string
    let localeStrategy = i18nSetup.localeStrategy

    if (project.target_url) {
      // Use provided target URL — skip build
      appBaseUrl = project.target_url
      localeStrategy = project.locale_strategy ?? i18nSetup.localeStrategy
      console.log(`   Using provided target URL: ${appBaseUrl}`)
    } else {
      // Build and start locally
      const buildResult = await buildAndStartApp(
        tmpDir,
        i18nSetup,
        project.source_locale ?? 'en',
        project.target_locales ?? []
      )
      appBaseUrl = `http://localhost:${buildResult.port}`
      appPid = buildResult.pid
      // Use detected strategy unless user overrode it
      localeStrategy = project.locale_strategy ?? buildResult.i18nSetup.localeStrategy
    }
    
    // ── Step 5: Screenshots + diff ─────────────────────────────────────────
    console.log('\n📸 Step 5/5 — Capturing screenshots...')
    const screenshotResults = await captureScreenshots({
      targetUrl: appBaseUrl,
      sourceLocale: project.source_locale ?? 'en',
      targetLocales: project.target_locales ?? [],
      routes: project.auto_detect_routes
        ? ['/']
        : (project.routes ?? ['/']),
      runId,
      localeStrategy,
    })
    console.log(`   ✓ ${screenshotResults.length} screenshots captured`)

    console.log('\n🔎 Running diff engine...')
    const diffResults = await runDiff({
      screenshots: screenshotResults,
      sourceLocale: project.source_locale ?? 'en',
    })
    console.log(`   ✓ ${diffResults.totalIssues} visual issues`)

    // ── Upload ─────────────────────────────────────────────────────────────
    console.log('\n🗄️  Uploading results...')
    await uploadResults({
      supabase,
      runId,
      projectId: project.id,
      scanResults,
      diffResults,
      screenshotResults,
      coverageThreshold: project.coverage_threshold ?? 90,
    })

    // ── Final status ───────────────────────────────────────────────────────
    const allPassed = (project.target_locales ?? []).every((locale) => {
      const scan = scanResults.byLocale[locale]
      const diff = diffResults.byLocale[locale]
      return (
        (scan?.coveragePct ?? 100) >= (project.coverage_threshold ?? 90) &&
        (diff?.issues ?? 0) === 0
      )
    })

    await supabase
      .from('audit_runs')
      .update({ status: allPassed ? 'passed' : 'failed' })
      .eq('id', runId)

    console.log(`\n${allPassed ? '✅' : '❌'} Run ${runId} ${allPassed ? 'passed' : 'failed'}`)

  } catch (err) {
    const message = (err as Error).message
    console.error(`\n💥 Run ${runId} failed:`, message)

    await supabase
      .from('audit_runs')
      .update({
        status: 'failed',
      })
      .eq('id', runId)

  } finally {
    // Kill app process if we started one
    if (appPid) {
      await killApp(appPid)
      console.log('   ✓ App process killed')
    }
    await cleanup(tmpDir)
    console.log(`🧹 Cleaned up ${tmpDir}`)
  }
}