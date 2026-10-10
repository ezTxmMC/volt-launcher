import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './icons'
import './styles.css'
import { applyTheme, readCachedTheme } from './lib/theme'

async function bootstrap(): Promise<void> {
  if (import.meta.env.DEV && !window.volt) {
    const { installMockBridge } = await import('./dev/mockApi')
    installMockBridge()
  }
  applyTheme(readCachedTheme())
  const root = document.getElementById('root')
  if (!root) throw new Error('Missing #root element')
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}

void bootstrap()
