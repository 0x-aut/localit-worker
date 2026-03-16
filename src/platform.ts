import os from 'os'

export const isWindows = os.platform() === 'win32'

export const commands = {
  // List directory contents
  ls: (dir: string) => isWindows ? `dir "${dir}"` : `ls -la "${dir}"`,
  
  // Remove directory
  rmDir: (dir: string) => isWindows ? `rmdir /s /q "${dir}"` : `rm -rf "${dir}"`,
  
  // Kill process
  kill: (pid: number) => isWindows ? `taskkill /F /PID ${pid}` : `kill -SIGTERM ${pid}`,
  
  // Check if path exists (not needed as command, use fs.existsSync instead)
}