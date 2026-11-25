import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import type { Host } from '../shared/types'
import { validateHost } from './tmux'

export const LOCAL_HOST: Host = { id: 'local', name: 'This Mac', kind: 'local', address: '' }

export class HostStore {
  private hosts: Host[] = [LOCAL_HOST]
  private writes: Promise<unknown> = Promise.resolve()
  constructor(private file: string) {}
  async load(): Promise<Host[]> {
    try {
      const value: unknown = JSON.parse(await readFile(this.file, 'utf8'))
      if (!Array.isArray(value)) throw new Error('Invalid host configuration.')
      this.hosts = [LOCAL_HOST, ...value.map(validateHost).filter((host) => host.id !== 'local')]
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    return this.list()
  }
  list(): Host[] {
    return this.hosts.map((host) => ({ ...host }))
  }
  get(id: string): Host {
    const host = this.hosts.find((item) => item.id === id)
    if (!host) throw new Error('Host not found.')
    return host
  }
  async save(value: Host): Promise<Host[]> {
    const host = validateHost(value)
    if (host.id === 'local') throw new Error('The built-in local host cannot be edited.')
    return this.mutate(async () => {
      await this.persist([...this.hosts.filter((item) => item.id !== host.id), host])
      return this.list()
    })
  }
  async remove(id: string): Promise<Host[]> {
    if (id === 'local') throw new Error('The built-in local host cannot be removed.')
    return this.mutate(async () => {
      await this.persist(this.hosts.filter((item) => item.id !== id))
      return this.list()
    })
  }
  private mutate(operation: () => Promise<Host[]>): Promise<Host[]> {
    const result = this.writes.then(operation)
    this.writes = result.catch(() => {})
    return result
  }
  private async persist(next: Host[]): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true })
    const temporary = `${this.file}.tmp`
    await writeFile(temporary, JSON.stringify(next, null, 2), { mode: 0o600 })
    await rename(temporary, this.file)
    this.hosts = next
  }
}

export function parseSSHConfig(config: string): string[] {
  const aliases = new Set<string>()
  for (const line of config.split('\n')) {
    const match = line.match(/^\s*Host\s+(.+?)\s*(?:#.*)?$/i)
    if (!match) continue
    for (const alias of match[1].split(/\s+/)) {
      if (/^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/.test(alias)) aliases.add(alias)
    }
  }
  return [...aliases]
}

export async function sshAliases(): Promise<string[]> {
  try {
    return parseSSHConfig(await readFile(join(homedir(), '.ssh', 'config'), 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}
