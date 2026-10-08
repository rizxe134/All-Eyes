import { app, BrowserWindow, Menu, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startDesktopServer } from './host.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const smoke = process.argv.includes('--smoke');

if (smoke) {
  // Headless Linux has no GPU. A Mac uses the real one; this is only the smoke path.
  app.commandLine.appendSwitch('use-gl', 'angle');
  app.commandLine.appendSwitch('use-angle', 'swiftshader');
  app.commandLine.appendSwitch('enable-unsafe-swiftshader');
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
}

/** Green phosphor field. Matches the web app's near-black background. */
const FIELD = '#031208';
const PHOSPHOR = '#39ff14';

let serverClose = null;
let localUrl = '';

function installMenu() {
  const template = [
    {
      label: 'All Eyes',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [{ role: 'reload' }, { role: 'togglefullscreen' }],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  const darwin = process.platform === 'darwin';
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: 'All Eyes',
    backgroundColor: FIELD,
    show: false,
    autoHideMenuBar: true,
    roundedCorners: false,
    titleBarStyle: darwin ? 'hiddenInset' : 'hidden',
    trafficLightPosition: { x: 14, y: 16 },
    ...(darwin
      ? {}
      : {
          titleBarOverlay: {
            color: FIELD,
            symbolColor: PHOSPHOR,
            height: 32,
          },
        }),
    icon: path.join(root, 'desktop', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.on('page-title-updated', (event) => {
    event.preventDefault();
    win.setTitle('All Eyes');
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    try {
      if (new URL(url).origin !== new URL(localUrl).origin) {
        event.preventDefault();
        shell.openExternal(url);
      }
    } catch {
      event.preventDefault();
    }
  });

  win.webContents.on('did-finish-load', () => {
    // Keep the phosphor title clear of the traffic lights while the globe
    // still fills the window underneath the HUD.
    win.webContents.insertCSS(`
      html, body, #cesiumContainer {
        width: 100% !important;
        height: 100% !important;
        margin: 0 !important;
        background: ${FIELD} !important;
      }
      #title-bar { top: 40px !important; left: 84px !important; }
    `);
  });

  win.once('ready-to-show', () => {
    win.maximize();
    if (!smoke) win.show();
  });

  if (smoke) {
    const fail = setTimeout(() => {
      console.error('SMOKE_TIMEOUT');
      app.exit(1);
    }, 45000);
    win.webContents.on('did-finish-load', async () => {
      try {
        const ok = await win.webContents.executeJavaScript(
          `(() => new Promise((resolve) => {
            const started = Date.now();
            const tick = () => {
              const box = document.querySelector('#cesiumContainer');
              const canvas = box?.querySelector('canvas');
              const rect = box ? box.getBoundingClientRect() : { width: 0, height: 0 };
              const full = rect.width >= window.innerWidth - 2 && rect.height >= window.innerHeight - 2;
              if ((canvas && full) || Date.now() - started > 20000) {
                resolve({
                  title: document.title,
                  full,
                  canvas: Boolean(canvas),
                  width: rect.width,
                  height: rect.height,
                  innerWidth: window.innerWidth,
                  innerHeight: window.innerHeight,
                });
                return;
              }
              setTimeout(tick, 250);
            };
            tick();
          }))()`,
        );
        console.log('SMOKE', JSON.stringify(ok));
        clearTimeout(fail);
        app.exit(ok.title === 'All Eyes' && ok.full && ok.canvas ? 0 : 1);
      } catch (error) {
        console.error('SMOKE_ERROR', error);
        clearTimeout(fail);
        app.exit(1);
      }
    });
  }

  win.loadURL(localUrl);
  return win;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(async () => {
    app.setName('All Eyes');
    app.setAboutPanelOptions({
      applicationName: 'All Eyes',
      applicationVersion: app.getVersion(),
      copyright: 'Based on gods-eye-view by Bilawal Sidhu',
    });
    installMenu();
    const started = await startDesktopServer({
      root,
      userData: path.join(app.getPath('userData'), 'runtime'),
    });
    serverClose = started.close;
    localUrl = started.url;
    console.log(`All Eyes desktop ${localUrl}`);
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  }).catch((error) => {
    console.error(error);
    app.exit(1);
  });

  app.on('window-all-closed', () => {
    app.quit();
  });

  app.on('before-quit', () => {
    const close = serverClose;
    serverClose = null;
    close?.();
  });
}
