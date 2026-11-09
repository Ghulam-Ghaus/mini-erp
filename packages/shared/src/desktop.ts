/** IPC channel the preload script uses to read the desktop config from the main process. */
export const DESKTOP_CONFIG_CHANNEL = 'desktop:get-config';

/** IPC channel the renderer uses to display an OS desktop notification via Electron. */
export const DESKTOP_NOTIFY_CHANNEL = 'desktop:show-notification';

export interface DesktopNotificationPayload {
  readonly title: string;
  readonly body: string;
}

/** Minimal API exposed by the Electron preload script on `window.desktop`. */
export interface DesktopBridge {
  /** Base URL of the local API, e.g. `http://127.0.0.1:53124`. */
  readonly apiBaseUrl: string;
  readonly platform: string;
  /** Sends a native OS notification through the Electron main process. */
  readonly showNotification?: (payload: DesktopNotificationPayload) => void;
}
