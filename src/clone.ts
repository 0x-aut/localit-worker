import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import { commands } from "./platform.js";

const execAsync = promisify(exec)

type CloneOptions = {
  repoUrl: string
  branch: string
  targetDir: string
}

export async function cloneRepo({
  repoUrl,
  branch,
  targetDir,
}: CloneOptions): Promise<void> {
  if (fs.existsSync(targetDir)) {
    await execAsync(commands.rmDir(targetDir))
  }

  try {
    await execAsync(
      `git clone --depth 1 --single-branch --branch ${branch} ${repoUrl} ${targetDir}`,
      { timeout: 60000 }
    )
  } catch {
    // Branch not found — try without specifying branch
    await execAsync(
      `git clone --depth 1 ${repoUrl} ${targetDir}`,
      { timeout: 60000 }
    )
  }
}