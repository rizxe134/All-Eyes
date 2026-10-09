import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow } from 'electron'
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
  await win.loadURL(`http://127.0.0.1:${port}/`)
}

app.whenReady().then(open)
app.on('window-all-closed', () => app.quit())
