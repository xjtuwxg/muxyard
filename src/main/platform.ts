import { win32 } from 'node:path'

export function sshExecutable(
  platform = process.platform,
  systemRoot = process.env.SystemRoot
): string {
  return platform === 'win32'
    ? win32.join(systemRoot || 'C:\\Windows', 'System32', 'OpenSSH', 'ssh.exe')
    : '/usr/bin/ssh'
}

export function requireLocalTmux(platform = process.platform): void {
  if (platform === 'win32')
    throw new Error(
      'Local tmux is not supported on Windows. Add an SSH machine running tmux on Linux or macOS. WSL integration is not implemented yet.'
    )
}
