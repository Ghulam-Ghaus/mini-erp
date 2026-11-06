import { DESKTOP_CONFIG_CHANNEL, HEALTH_PATH, type DesktopBridge } from '@mini-erp/shared';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { watch, type FSWatcher } from 'node:fs';
import path from 'node:path';
import { ApiProcess } from './api-process.js';
import { findFreePort } from './free-port.js';
import { HealthTimeoutError, waitForHealth } from './health.js';

const isDev = !app.isPackaged;
/** apps/desktop/dist → repo root. Only meaningful in development. */
const repoRoot = path.resolve(import.meta.dirname, '../../..');
const DEV_WEB_URL = process.env['MINI_ERP_WEB_URL'] ?? 'http://127.0.0.1:5173';
const API_HOST = '127.0.0.1';
const STARTUP_TIMEOUT_MS = 60_000;

let mainWindow: BrowserWindow | undefined;
let api: ApiProcess | undefined;
let apiWatcher: FSWatcher | undefined;
let apiBaseUrl = '';

function apiEntryPath(): string {
  // Packaged layout (resources/api) is finalised with the installer in Phase 12.
  return isDev
    ? path.join(repoRoot, 'apps', 'api', 'dist', 'main.js')
    : path.join(process.resourcesPath, 'api', 'dist', 'main.js');
}

function webOrigin(): string {
  // Packaged builds load the UI from file://, whose origin is "null".
  return isDev ? new URL(DEV_WEB_URL).origin : 'null';
}

/** The preload script reads the API address synchronously at startup. */
ipcMain.on(DESKTOP_CONFIG_CHANNEL, (event) => {
  const config: DesktopBridge = { apiBaseUrl, platform: process.platform };
  event.returnValue = config;
});

async function startApi(): Promise<void> {
  const port = await findFreePort(API_HOST);
  apiBaseUrl = `http://${API_HOST}:${port}`;
  let exitReason: string | undefined;

  api = new ApiProcess({
    entry: apiEntryPath(),
    cwd: isDev ? repoRoot : app.getPath('userData'),
    env: {
      ...process.env,
      NODE_ENV: isDev ? 'development' : 'production',
      PORT: String(port),
      HOST: API_HOST,
      CORS_ORIGINS: webOrigin(),
      APP_VERSION: app.getVersion(),
    },
    onExit: (code, expected) => {
      if (expected) return;
      exitReason = `API process exited with code ${code}`;
      console.error(`[desktop] ${exitReason}`);
    },
  });
  api.start();

  await waitForHealth({
    url: `${apiBaseUrl}${HEALTH_PATH}`,
    timeoutMs: STARTUP_TIMEOUT_MS,
    shouldAbort: () => exitReason,
  });
}

/** Development only: restart the API (same port) when its build output changes. */
function watchApiInDev(): void {
  let timer: NodeJS.Timeout | undefined;
  let restarting = false;

  const restart = async () => {
    if (!api || restarting) return;
    restarting = true;
    console.warn('[desktop] API build changed, restarting API…');
    try {
      await api.stop();
      api.start();
      await waitForHealth({ url: `${apiBaseUrl}${HEALTH_PATH}`, timeoutMs: 30_000 });
      console.warn('[desktop] API restarted');
    } catch (error) {
      console.error(
        '[desktop] API restart failed:',
        error instanceof Error ? error.message : error,
      );
    } finally {
      restarting = false;
    }
  };

  try {
    apiWatcher = watch(path.dirname(apiEntryPath()), { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(() => void restart(), 800);
    });
  } catch (error) {
    console.warn('[desktop] API auto-restart disabled:', error);
  }
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(import.meta.dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => win.show());

  // The app never opens other windows or navigates away from its own UI.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    const allowed = isDev ? url.startsWith(DEV_WEB_URL) : url.startsWith('file://');
    if (!allowed) event.preventDefault();
  });

  if (isDev) {
    void win.loadURL(DEV_WEB_URL);
  } else {
    void win.loadFile(path.join(process.resourcesPath, 'web', 'index.html'));
  }
  return win;
}

async function bootstrap(): Promise<void> {
  try {
    await startApi();
  } catch (error) {
    const detail =
      error instanceof HealthTimeoutError
        ? `${error.message}\nLast status: ${error.lastStatus}`
        : String(error);
    // Startup-failure text is finalised (and translated) with the installer in Phase 12.
    dialog.showErrorBox(
      'Mini ERP could not start',
      `The local API did not become healthy.\n\n${detail}` +
        (isDev
          ? '\n\nDevelopment: make sure PostgreSQL is running (pnpm db:up) and migrations are applied (pnpm db:migrate).'
          : ''),
    );
    api?.kill();
    app.quit();
    return;
  }

  mainWindow = createWindow();
  if (isDev) watchApiInDev();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.on('window-all-closed', () => app.quit());

  app.on('before-quit', () => {
    apiWatcher?.close();
    api?.kill();
  });

  void app.whenReady().then(bootstrap);
}
