import { createServer } from 'node:http'
import { appendFileSync, mkdirSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow } from 'electron'
import { allowRecover, heapAction, rendererAction } from './guard.mjs'
import { applyEnvFile, handleApi } from '../server/proxy.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const dist = path.join(here, '..', 'dist')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
}

function startServer() {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      try {
        if (await handleApi(req, res)) return
        const url = new URL(req.url || '/', 'http://127.0.0.1')
        let pathname = decodeURIComponent(url.pathname)
        if (pathname.endsWith('/')) pathname += 'index.html'
        const file = path.normalize(path.join(dist, pathname))
        if (!file.startsWith(dist + path.sep) && file !== path.join(dist, 'index.html')) {
          res.statusCode = 403
          res.end('forbidden')
          return
        }
        try {
          const info = await stat(file)
          const target = info.isDirectory() ? path.join(file, 'index.html') : file
          const body = await readFile(target)
          res.setHeader('content-type', MIME[path.extname(target).toLowerCase()] || 'application/octet-stream')
          res.end(body)
        } catch {
          if (path.extname(pathname)) {
            res.statusCode = 404
            res.end('not found')
            return
          }
          const body = await readFile(path.join(dist, 'index.html'))
          res.setHeader('content-type', 'text/html; charset=utf-8')
          res.end(body)
        }
      } catch (err) {
        res.statusCode = 500
        res.end(err instanceof Error ? err.message : 'error')
      }
    })
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      resolve(typeof addr === 'object' && addr ? addr.port : 0)
    })
  })
}

function logCrash(line) {
  try {
    const dir = app.getPath('logs')
    mkdirSync(dir, { recursive: true })
    appendFileSync(path.join(dir, 'all-eyes-crash.log'), `${new Date().toISOString()} ${line}\n`)
  } catch (err) {
    console.error('crash log', err)
  }
}

async function open() {
  applyEnvFile(path.join(process.cwd(), '.env'))
  applyEnvFile(path.join(app.getPath('userData'), '.env'))
  const port = await startServer()
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#010a06',
    title: 'All Eyes',
    icon: path.join(dist, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  let lastView = null
  let recovers = []
  let hung = null
  let recovering = false

  function recover(why) {
    if (recovering || win.isDestroyed()) return
    const now = Date.now()
    const gate = allowRecover(recovers, now)
    recovers = gate.recent
    const view = lastView ? `lat=${lastView.lat} lon=${lastView.lon} range=${lastView.rangeKm}` : 'no-view'
    logCrash(`${why} ${view}`)
    if (!gate.ok) {
      logCrash('stopped after repeated crashes')
      recovering = true
      void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent('<body style="margin:0;background:#010a06;color:#d8ffe6;font-family:monospace;padding:24px"><p>RECOVERED FROM CRASH</p><p>The city view crashed again. Quit All Eyes and open it once more.</p></body>')}`)
      return
    }
    recovers.push(now)
    recovering = true
    const q = new URLSearchParams({ recovered: '1' })
    if (lastView && Number.isFinite(lastView.lat) && Number.isFinite(lastView.lon)) {
      q.set('lat', String(lastView.lat))
      q.set('lon', String(lastView.lon))
      q.set('range', String(lastView.rangeKm || 12))
    }
    void win.loadURL(`http://127.0.0.1:${port}/?${q}`).finally(() => {
      recovering = false
    })
  }

  win.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') return
    recover(`render-process-gone ${details.reason} code=${details.exitCode}`)
  })
  win.on('unresponsive', () => {
    clearTimeout(hung)
    hung = setTimeout(() => recover('unresponsive'), 8000)
  })
  win.on('responsive', () => clearTimeout(hung))

  const watch = async () => {
    if (win.isDestroyed() || recovering) return
    let health = null
    try {
      health = await win.webContents.executeJavaScript('window.__aeHealth ? window.__aeHealth() : null', true)
    } catch {
      return
    }
    if (!health || typeof health !== 'object') return
    lastView = health
    const metrics = app.getAppMetrics()
    const tab = metrics.find((row) => row.type === 'Tab' || row.type === 'Renderer')
    const rss = rendererAction(tab?.memory?.workingSetSize ?? 0)
    const heap = heapAction(health.heap, health.limit)
    if (heap === 'reload' || rss === 'reload') {
      recover(`memory heap=${health.heap} rssKb=${tab?.memory?.workingSetSize ?? 0}`)
      return
    }
    if (heap === 'shed' || rss === 'shed') {
      try {
        await win.webContents.executeJavaScript('window.__aeShed && window.__aeShed()', true)
      } catch {
        /* the page sheds on its own timer too */
      }
    }
  }
  const memoryTimer = setInterval(() => { void watch() }, 3000)
  win.on('closed', () => clearInterval(memoryTimer))
  await win.loadURL(`http://127.0.0.1:${port}/`)
}

app.whenReady().then(open)
app.on('window-all-closed', () => app.quit())
