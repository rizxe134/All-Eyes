import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { preview } from 'vite';

/** Apply KEY=VALUE lines. Existing process env wins, so the shell can override a file. */
function applyEnvFile(file) {
  if (!file || !existsSync(file)) return;
  const text = readFileSync(file, 'utf8');
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (process.env[key] !== undefined) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

/**
 * Start the built All Eyes app on 127.0.0.1.
 * Writable caches go in `userData` because the packaged app directory is read-only.
 * @param {{ root: string, userData: string }} options
 */
export async function startDesktopServer({ root, userData }) {
  mkdirSync(userData, { recursive: true });
  applyEnvFile(path.join(userData, '.env'));
  applyEnvFile(path.join(root, '.env'));
  process.chdir(userData);

  const server = await preview({
    root,
    configFile: path.join(root, 'desktop', 'preview.config.js'),
    cacheDir: path.join(userData, 'vite-cache'),
    preview: {
      host: '127.0.0.1',
      strictPort: false,
    },
  });
  const address = server.httpServer?.address();
  const port = address && typeof address === 'object' ? address.port : 47823;
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () => server.close(),
  };
}
