/**
 * Tile bytes in memory, mirrored to IndexedDB when the browser has it.
 * Electron stores that database in the app user-data directory.
 */

const DB = 'alleyes.tiles.v1'
const STORE = 'blobs'
const CAP = 48 * 1024 * 1024

interface Entry {
  bytes: number
  at: number
  blob: Blob
}

const mem = new Map<string, Entry>()
let memBytes = 0
let dbp: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (dbp) return dbp
  dbp = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') {
        resolve(null)
        return
      }
      const req = indexedDB.open(DB, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbp
}

function evict(cap = CAP): void {
  if (memBytes <= cap) return
  const rows = [...mem.entries()].sort((a, b) => a[1].at - b[1].at)
  for (const [key, entry] of rows) {
    if (memBytes <= cap) break
    mem.delete(key)
    memBytes -= entry.bytes
  }
}

export function tileCacheBytes(): number {
  return memBytes
}

export async function tileCacheGet(key: string): Promise<Blob | null> {
  const hit = mem.get(key)
  if (hit) {
    hit.at = Date.now()
    return hit.blob
  }
  const db = await openDb()
  if (!db) return null
  const blob = await new Promise<Blob | null>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(key)
      req.onsuccess = () => {
        const value = req.result as Blob | undefined
        resolve(value instanceof Blob ? value : null)
      }
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  if (!blob) return null
  mem.set(key, { blob, bytes: blob.size, at: Date.now() })
  memBytes += blob.size
  evict()
  return blob
}

export async function tileCachePut(key: string, blob: Blob): Promise<void> {
  const prev = mem.get(key)
  if (prev) memBytes -= prev.bytes
  mem.set(key, { blob, bytes: blob.size, at: Date.now() })
  memBytes += blob.size
  evict()
  const db = await openDb()
  if (!db) return
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(blob, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
}

export async function clearTileCache(): Promise<void> {
  mem.clear()
  memBytes = 0
  const db = await openDb()
  if (!db) return
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
}

/** Test hook. Production eviction uses the 48 MB cap. */
export function evictTileCacheForTest(cap: number): void {
  evict(cap)
}
