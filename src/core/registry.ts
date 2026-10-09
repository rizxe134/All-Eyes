import type { AllEyesPlugin, CommandDefinition, LayerDefinition, PanelDefinition } from './types'

export class PluginRegistry {
  private plugins: AllEyesPlugin[] = []
  private layerIds = new Set<string>()
  private panelIds = new Set<string>()
  private commandNames = new Set<string>()

  register(plugin: AllEyesPlugin): void {
    if (!plugin.id || this.plugins.some((item) => item.id === plugin.id)) {
      throw new Error(`Duplicate plugin id: ${plugin.id}`)
    }
    for (const layer of plugin.layers ?? []) {
      if (this.layerIds.has(layer.id)) throw new Error(`Duplicate layer id: ${layer.id}`)
    }
    for (const panel of plugin.panels ?? []) {
      if (this.panelIds.has(panel.id)) throw new Error(`Duplicate panel id: ${panel.id}`)
    }
    for (const command of plugin.commands ?? []) {
      const name = command.name.toLowerCase()
      if (this.commandNames.has(name)) throw new Error(`Duplicate command: ${name}`)
    }
    this.plugins.push(plugin)
    for (const layer of plugin.layers ?? []) this.layerIds.add(layer.id)
    for (const panel of plugin.panels ?? []) this.panelIds.add(panel.id)
    for (const command of plugin.commands ?? []) this.commandNames.add(command.name.toLowerCase())
  }

  list(): readonly AllEyesPlugin[] {
    return this.plugins
  }

  layers(): LayerDefinition[] {
    return this.plugins.flatMap((plugin) => plugin.layers ?? [])
  }

  panels(): PanelDefinition[] {
    return this.plugins.flatMap((plugin) => plugin.panels ?? [])
  }

  commands(): CommandDefinition[] {
    return this.plugins.flatMap((plugin) => plugin.commands ?? [])
  }

  command(name: string): CommandDefinition | null {
    const key = name.toLowerCase()
    return this.commands().find((command) => command.name.toLowerCase() === key) ?? null
  }
}
