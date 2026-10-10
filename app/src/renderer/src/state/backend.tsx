import { type ReactNode, createContext, useContext, useEffect, useState } from 'react'
import type { BackendStatus } from '@shared/bridge'

const STARTING: BackendStatus = { state: 'starting', message: null, log: null }
const NO_BRIDGE: BackendStatus = {
  state: 'error',
  message: 'The Electron bridge (window.volt) is not available.',
  log: null
}

const BackendContext = createContext<BackendStatus>(STARTING)

export function BackendProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<BackendStatus>(window.volt ? STARTING : NO_BRIDGE)

  useEffect(() => {
    const bridge = window.volt
    if (!bridge) return
    let active = true
    const unsubscribe = bridge.onBackendStatus((next) => {
      if (active) setStatus(next)
    })
    // Fetch after subscribing so no change between the two is lost.
    void bridge.backendStatus().then((current) => {
      if (active) setStatus(current)
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  return <BackendContext.Provider value={status}>{children}</BackendContext.Provider>
}

export function useBackendStatus(): BackendStatus {
  return useContext(BackendContext)
}
