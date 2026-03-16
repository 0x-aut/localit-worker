import { exec, spawn, ChildProcess } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import net from 'net'
import { BuildResult, I18nSetup } from './types.js'
import { commands } from "./platform.js"

const execAsync = promisify(exec)

// ── Find a free port ──────────────────────────────────────────────────────────
async function findFreePort(start = 3100): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(start, () => {
      const port = (server.address() as net.AddressInfo).port
      server.close(() => resolve(port))
    })
    server.on('error', () => {
      // Port in use, try next
      findFreePort(start + 1).then(resolve).catch(reject)
    })
  })
}

// ── Wait for app to be ready ──────────────────────────────────────────────────
async function waitForPort(
  port: number,
  timeout = 60000
): Promise<void> {
  const start = Date.now()

  while (Date.now() - start < timeout) {
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = net.createConnection(port, 'localhost')
        socket.on('connect', () => { socket.destroy(); resolve() })
        socket.on('error', reject)
      })
      return // port is ready
    } catch {
      await new Promise((r) => setTimeout(r, 1000))
    }
  }

  throw new Error(`App did not start on port ${port} within ${timeout}ms`)
}

// ── Detect start command ──────────────────────────────────────────────────────
function getStartCommand(repoDir: string, port: number): string {
  const pkgPath = path.join(repoDir, 'package.json')
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  const scripts = pkg.scripts ?? {}

  // Prefer 'start' over 'preview' over 'dev'
  if (scripts.start) return `npm run start -- --port ${port}`
  if (scripts.preview) return `npm run preview -- --port ${port}`
  // Dev as last resort — slower but always works
  return `npm run dev -- --port ${port}`
}

// ── Install Lingo.dev if needed ───────────────────────────────────────────────
async function setupLingo(repoDir: string, i18nSetup: I18nSetup): Promise<void> {
  if (i18nSetup.hasLingoCompiler) {
    console.log('   ✓ Lingo.dev Compiler already in project')
    return
  }

  console.log('   Installing Lingo.dev Compiler...')

  // Install the compiler
  await execAsync('npm install @lingo.dev/compiler --save-dev', {
    cwd: repoDir,
    timeout: 60000,
  })

  // Check if next.config exists and patch it to use Lingo compiler
  const nextConfigCandidates = [
    { file: 'next.config.ts', isTs: true },
    { file: 'next.config.mjs', isTs: false },
    { file: 'next.config.js', isTs: false },
  ]

  for (const { file, isTs } of nextConfigCandidates) {
    const configPath = path.join(repoDir, file)
    if (!fs.existsSync(configPath)) continue

    const content = fs.readFileSync(configPath, 'utf8')

    // Skip if already has Lingo
    if (content.includes('@lingo.dev/compiler')) {
      console.log('   ✓ next.config already has Lingo Compiler')
      return
    }

    // Patch next.config to wrap with Lingo compiler
    const patched = patchNextConfig(content, isTs)
    fs.writeFileSync(configPath, patched)
    console.log(`   ✓ Patched ${file} with Lingo Compiler`)
    return
  }

  console.warn('   ⚠ Could not find next.config — Lingo Compiler not injected')
}

function patchNextConfig(content: string, isTs: boolean): string {
  const importLine = isTs
    ? `import { withLingo } from '@lingo.dev/compiler'\n`
    : `const { withLingo } = require('@lingo.dev/compiler')\n`

  // Wrap the default export with withLingo
  const patched = content
    .replace(
      /export default\s+(\w+)/,
      `export default withLingo($1)`
    )
    .replace(
      /module\.exports\s*=\s*(\w+)/,
      `module.exports = withLingo($1)`
    )

  return importLine + patched
}

// ── Write lingo.config.js if not present ─────────────────────────────────────
async function ensureLingoConfig(
  repoDir: string,
  sourceLocale: string,
  targetLocales: string[]
): Promise<void> {
  const lingoConfigPath = path.join(repoDir, 'lingo.config.js')

  if (fs.existsSync(lingoConfigPath)) {
    console.log('   ✓ lingo.config.js already exists')
    return
  }

  const config = `export default {
  sourceLocale: '${sourceLocale}',
  targetLocales: ${JSON.stringify(targetLocales)},
  localeStrategy: 'prefix',
}
`
  fs.writeFileSync(lingoConfigPath, config)
  console.log('   ✓ Created lingo.config.js')
}

// ── Main build function ───────────────────────────────────────────────────────
export async function buildAndStartApp(
  repoDir: string,
  i18nSetup: I18nSetup,
  sourceLocale: string,
  targetLocales: string[]
): Promise<BuildResult> {
  const port = await findFreePort(3100)
  console.log(`   Using port ${port}`)

  // ── 1. Install dependencies ────────────────────────────────────────────────
  // In buildAndStartApp, replace the npm install block:
  console.log('   Installing dependencies...')
  // Add this BEFORE npm install
  try {
    const { stdout } = await execAsync('npm --version', { cwd: repoDir })
    console.log(`   npm version: ${stdout.trim()}`)
  } catch (err: any) {
    throw new Error(`npm not found: ${err.message}`)
  }
  
  // Also log what's in the directory
  const { stdout: ls } = await execAsync(commands.ls(repoDir))
  console.log(`   Repo contents:\n${ls}`)
  try {
    const { stdout, stderr } = await execAsync('npm install', {
      cwd: repoDir,
      timeout: 900000,
    })
    if (stdout) console.log('   npm install stdout:', stdout.slice(0, 500))
    if (stderr) console.log('   npm install stderr:', stderr.slice(0, 500))
    console.log('   ✓ Dependencies installed')
  } catch (err: any) {
    // Log the full error output
    console.error('   npm install failed')
    console.error('   stdout:', err.stdout?.slice(0, 1000))
    console.error('   stderr:', err.stderr?.slice(0, 1000))
    console.error('   message:', err.message)
    throw new Error(`npm install failed: ${err.stderr ?? err.message}`)
  }

  // ── 2. Set up Lingo.dev ────────────────────────────────────────────────────
  console.log('   Setting up Lingo.dev...')
  try {
    await setupLingo(repoDir, i18nSetup)
    await ensureLingoConfig(repoDir, sourceLocale, targetLocales)
  } catch (err) {
    console.warn(`   ⚠ Lingo setup warning: ${(err as Error).message}`)
    // Non-fatal — continue without Lingo
  }

  // ── 3. Build ───────────────────────────────────────────────────────────────
  console.log('   Building app...')
  try {
    await execAsync('npm run build', {
      cwd: repoDir,
      timeout: 300000, // 5 min
      env: {
        ...process.env,
        NODE_ENV: 'production',
        PORT: String(port),
        LINGO_COMPILE: 'true',
      },
    })
    console.log('   ✓ Build complete')
  } catch (err) {
    throw new Error(`Build failed: ${(err as Error).message}`)
  }

  // ── 4. Start app ───────────────────────────────────────────────────────────
  console.log('   Starting app...')
  const startCmd = getStartCommand(repoDir, port)
  const [cmd, ...args] = startCmd.split(' ')

  const childProcess = spawn(cmd, args, {
    cwd: repoDir,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
    },
    detached: false,
    stdio: 'pipe',
  })

  // Log app output for debugging
  childProcess.stdout?.on('data', (data) => {
    process.stdout.write(`   [app] ${data}`)
  })
  childProcess.stderr?.on('data', (data) => {
    process.stderr.write(`   [app:err] ${data}`)
  })

  // ── 5. Wait for ready ──────────────────────────────────────────────────────
  try {
    await waitForPort(port, 60000)
    console.log(`   ✓ App ready on port ${port}`)
  } catch (err) {
    childProcess.kill()
    throw new Error(`App failed to start: ${(err as Error).message}`)
  }

  return {
    success: true,
    port,
    pid: childProcess.pid!,
    i18nSetup,
  }
}

// ── Kill the app process ──────────────────────────────────────────────────────
export async function killApp(pid: number): Promise<void> {
  try {
    process.kill(pid, 'SIGTERM')
    // Give it 5 seconds to gracefully shutdown
    await new Promise((r) => setTimeout(r, 5000))
    // Force kill if still running
    try { process.kill(pid, 'SIGKILL') } catch { /* already dead */ }
  } catch (err) {
    // Process already gone
  }
}