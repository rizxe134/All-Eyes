import { defineConfig, loadEnv } from 'vite'
import { apiProxy } from './server/vite-plugin'
import { applyEnvFile } from './server/proxy.mjs'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  for (const key of ['OPENSKY_CLIENT_ID', 'OPENSKY_CLIENT_SECRET', 'FIRMS_MAP_KEY']) {
    if (env[key] && !process.env[key]) process.env[key] = env[key]
  }
  applyEnvFile('.env')
  return {
    plugins: [apiProxy()],
    server: { host: '127.0.0.1', port: 4173 },
    preview: { host: '127.0.0.1', port: 4173 },
    build: {
      target: 'es2022',
      sourcemap: false,
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        output: {
          manualChunks: {
            three: ['three'],
            satellite: ['satellite.js'],
          },
        },
      },
    },
  }
})
