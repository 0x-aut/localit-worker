import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import { commands } from './platform.js'

const execAsync = promisify(exec)

export async function cleanup(dir: string): Promise<void> {
  if (!dir || !fs.existsSync(dir)) return
  try {
    await execAsync(commands.rmDir(dir))
  } catch (err) {
    console.warn(`Cleanup failed for ${dir}: ${(err as Error).message}`)
  }
}