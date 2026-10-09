import type { Contact } from './types'

export class EntityIndex {
  private layers = new Map<string, Contact[]>()
  private byId = new Map<string, Contact>()
  private flat: Contact[] = []
  private listeners = new Set<() => void>()

  set(layerId: string, contacts: Contact[]): void {
    this.layers.set(layerId, contacts)
    this.reindex()
    for (const fn of this.listeners) fn()
  }

  get(id: string): Contact | null {
    return this.byId.get(id) ?? null
  }

  of(layerId: string): readonly Contact[] {
    return this.layers.get(layerId) ?? []
  }

  all(): readonly Contact[] {
    return this.flat
  }

  count(): number {
    return this.flat.length
  }

  find(query: string): Contact | null {
    const q = query.trim().toLowerCase()
    if (!q) return null
    let loose: Contact | null = null
    for (const contact of this.flat) {
      const callsign = (contact.callsign ?? '').toLowerCase()
      const label = contact.label.toLowerCase()
      const id = contact.id.toLowerCase()
      if (id === q || callsign === q || label === q) return contact
      if (!loose && `${id} ${label} ${callsign}`.includes(q)) loose = contact
    }
    return loose
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private reindex(): void {
    this.byId.clear()
    const flat: Contact[] = []
    for (const list of this.layers.values()) {
      for (const contact of list) {
        this.byId.set(contact.id, contact)
        flat.push(contact)
      }
    }
    this.flat = flat
  }
}
