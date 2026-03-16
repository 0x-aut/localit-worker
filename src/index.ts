import 'dotenv/config'
import http from 'http'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { processRun } from './runner.js'
import { AuditRun, Project } from './types.js'

const supabase: SupabaseClient = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_PUBLISHABLE_KEY!
)

// ── Health check server (required by Koyeb) ───────────────────────────────────
const PORT = process.env.PORT ?? 3001

const healthServer = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', worker: 'localit' }))
  } else {
    res.writeHead(404)
    res.end()
  }
})

healthServer.listen(PORT, () => {
  console.log(`🟢 Health server listening on port ${PORT}`)
})

// ── Polling loop ──────────────────────────────────────────────────────────────
console.log('🌍 Localit worker starting...')

async function pollPendingRuns(): Promise<void> {
  try {
    const { data: runs, error } = await supabase
      .from('audit_runs')
      .select(`
        id,
        project_id,
        commit_sha,
        status,
        coverage_threshold,
        projects (
          id,
          repo_url,
          repo_name,
          branch,
          target_url,
          source_locale,
          target_locales,
          routes,
          auto_detect_routes,
          coverage_threshold
        )
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)

    if (error) {
      console.error('Poll error:', error.message)
      return
    }

    if (!runs || runs.length === 0) return
    
    const raw = runs[0] as unknown as Omit<AuditRun, 'projects'> & { projects: Project }
    const run: AuditRun = {
      ...raw,
      projects: raw.projects,
    }
    console.log(`\n📋 Picked up run ${run.id}`)
    await processRun(run, supabase)
  } catch (err) {
    console.error('Unexpected poll error:', (err as Error).message)
  }
}

setInterval(pollPendingRuns, 10000)
pollPendingRuns()

console.log('✅ Worker listening for pending runs...')