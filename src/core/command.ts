import type { CommandContext } from './types'
import type { PluginRegistry } from './registry'

export function tokenize(line: string): string[] {
  const out: string[] = []
  const re = /"([^"]+)"|(\S+)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(line))) {
    out.push(match[1] ?? match[2] ?? '')
  }
  return out
}

export function formatHelp(registry: PluginRegistry): string {
  return registry.commands().map((command) => `${command.name.toUpperCase().padEnd(8, ' ')} ${command.summary}`).join('\n')
}

export async function execute(line: string, registry: PluginRegistry, ctx: CommandContext): Promise<string> {
  const parts = tokenize(line.trim())
  if (!parts.length) return ''
  const name = parts[0]?.toLowerCase() ?? ''
  if (name === 'help') return formatHelp(registry)
  const command = registry.command(name)
  if (!command) return `NO SUCH VERB "${name.toUpperCase()}". TYPE HELP.`
  try {
    return await command.run(parts.slice(1), ctx)
  } catch (err) {
    return `FAULT ${err instanceof Error ? err.message : 'FAILED'}`
  }
}
