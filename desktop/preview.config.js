import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import { BROWSER_HEADERS } from '../build/vite.js';
import { localMcpPlugin } from '../server/mcp/plugin.js';
import { localProviderPlugins } from '../server/providers/local.js';
import { apiNotFoundPlugin } from '../server/standalone/api-not-found.js';
import { standaloneVoiceTools } from '../server/standalone/voiceTools.js';

const root = fileURLToPath(new URL('..', import.meta.url));

/**
 * Production preview for the desktop shell.
 * Same local provider routes as `vite preview`, bound to loopback only.
 */
export default defineConfig(({ mode }) => {
  const loaded = loadEnv(mode, root, '');
  for (const [key, value] of Object.entries(loaded)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
  return {
    root,
    plugins: [
      ...localProviderPlugins({ realtime: { tools: standaloneVoiceTools() } }),
      localMcpPlugin(),
      apiNotFoundPlugin(),
    ],
    preview: {
      host: '127.0.0.1',
      port: 47823,
      strictPort: false,
      headers: BROWSER_HEADERS,
    },
  };
});
