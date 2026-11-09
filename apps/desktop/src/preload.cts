// Preload script (sandboxed, CommonJS). Exposes only `window.desktop` to the UI.
import electron = require('electron');
import type { DesktopBridge, DesktopNotificationPayload } from '@mini-erp/shared' with {
  'resolution-mode': 'import',
};

// Sandboxed preloads cannot load workspace packages at runtime, so the channel
// name is repeated here. It must match DESKTOP_CONFIG_CHANNEL in @mini-erp/shared.
const DESKTOP_CONFIG_CHANNEL = 'desktop:get-config';
const DESKTOP_NOTIFY_CHANNEL = 'desktop:show-notification';

const config = electron.ipcRenderer.sendSync(DESKTOP_CONFIG_CHANNEL) as DesktopBridge;

const bridge: DesktopBridge = Object.freeze({
  apiBaseUrl: config.apiBaseUrl,
  platform: config.platform,
  showNotification: (payload: DesktopNotificationPayload) => {
    electron.ipcRenderer.send(DESKTOP_NOTIFY_CHANNEL, payload);
  },
});

electron.contextBridge.exposeInMainWorld('desktop', bridge);
