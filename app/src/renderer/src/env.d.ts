/// <reference types="vite/client" />

import type { VoltBridge } from '@shared/bridge'

declare global {
  interface Window {
    /** Exposed by the Electron preload script; missing in a plain browser (dev only). */
    volt?: VoltBridge
  }
}
