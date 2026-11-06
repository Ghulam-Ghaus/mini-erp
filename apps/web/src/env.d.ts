/// <reference types="vite/client" />
import type { DesktopBridge } from '@mini-erp/shared';

declare global {
  interface ImportMetaEnv {
    readonly VITE_API_URL?: string;
  }

  interface Window {
    /** Present only when running inside the Electron app (see apps/desktop/src/preload.cts). */
    readonly desktop?: DesktopBridge;
  }
}

export {};
