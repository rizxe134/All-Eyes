import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { handleApi } from './proxy.mjs'

type Next = (err?: unknown) => void

function middleware(req: IncomingMessage, res: ServerResponse, next: Next) {
  handleApi(req, res)
    .then((handled) => {
      if (!handled) next()
    })
    .catch(next)
}

export function apiProxy(): Plugin {
  return {
    name: 'alleyes-api',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}
