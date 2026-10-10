import { useCallback, useEffect, useRef, useState } from 'react'
import { SkinViewer } from 'skinview3d'
import type { Language } from '@shared/models'
import { useI18n } from '@/i18n'
import { api, errorMessage } from '@/lib/api'
import { useAsync } from '@/lib/hooks'
import { DEFAULT_SKIN_DATA_URL } from './defaultSkin'

const TEXT: Record<Language, { label: string; loading: string; standard: string; failed: string; retry: string; unavailable: string }> = {
  de: {
    label: 'Dein Skin in 3D, mit der Maus drehbar',
    loading: 'Skin wird geladen',
    standard: 'Standard-Skin',
    failed: 'Der Skin konnte nicht geladen werden.',
    retry: 'Erneut versuchen',
    unavailable: '3D-Ansicht ist auf diesem System nicht verfügbar.'
  },
  en: {
    label: 'Your skin in 3D, drag to rotate',
    loading: 'Loading skin',
    standard: 'Default skin',
    failed: 'The skin could not be loaded.',
    retry: 'Try again',
    unavailable: 'The 3D view is not available on this system.'
  }
}

/**
 * The current skin of the selected Microsoft account as a 3D character (skinview3d, WebGL),
 * standing still in a pose. The skin comes from GET /api/accounts/skin as a data URL, so no
 * texture host is contacted. The figure does not turn. Without a skin on the account the
 * standard skin is shown with a caption. Without a signed-in account the component renders
 * nothing; the auth gate handles that case.
 */
export function SkinViewer3D() {
  const { language } = useI18n()
  const text = TEXT[language]
  const load = useCallback(() => api.accounts.skin(), [])
  const skin = useAsync(load)
  const data = skin.data

  const frameRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewerRef = useRef<SkinViewer | null>(null)
  const [ready, setReady] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [textureError, setTextureError] = useState<string | null>(null)

  // The WebGL context is released when the figure leaves the page.
  useEffect(() => {
    return () => {
      viewerRef.current?.dispose()
      viewerRef.current = null
    }
  }, [])

  // The canvas follows the size of its frame.
  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const fit = (): void => {
      const viewer = viewerRef.current
      if (viewer && frame.clientWidth > 0 && frame.clientHeight > 0) viewer.setSize(frame.clientWidth, frame.clientHeight)
    }
    const observer = new ResizeObserver(fit)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  // Applies the answer: the viewer is created once, then skin and cape are replaced per answer.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!data || !canvas) return
    let viewer = viewerRef.current
    if (!viewer) {
      try {
        viewer = createViewer(canvas, frameRef.current)
      } catch {
        setUnavailable(true)
        return
      }
      viewerRef.current = viewer
    }
    let cancelled = false
    viewer.loadSkin(data.dataUrl ?? DEFAULT_SKIN_DATA_URL, { model: data.model === 'slim' ? 'slim' : 'default' }).then(
      () => {
        if (!cancelled) setReady(true)
      },
      (error: unknown) => {
        if (!cancelled) setTextureError(errorMessage(error))
      }
    )
    if (data.capeDataUrl) {
      // The cape is cosmetic: when it fails the skin is still shown.
      viewer.loadCape(data.capeDataUrl).catch(() => undefined)
    } else {
      viewer.loadCape(null)
    }
    return () => {
      cancelled = true
    }
  }, [data])

  if (skin.error?.includes('sign_in_required')) return null

  const failure = skin.error ?? textureError
  const spinning = !failure && !unavailable && !ready
  const standard = data !== undefined && data.dataUrl === null

  return (
    <div className="relative flex min-h-0 flex-1 w-full flex-col items-center justify-center">
      <div
        ref={frameRef}
        className="relative z-10 min-h-[240px] w-full max-w-[300px] flex-1 cursor-grab active:cursor-grabbing"
        style={{ filter: 'drop-shadow(0 14px 16px rgb(0 0 0 / 0.45))' }}
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={text.label}
          className={`absolute inset-0 h-full w-full touch-none transition-opacity duration-300 ${ready ? 'opacity-100' : 'opacity-0'}`}
        />
        {spinning && (
          <span
            role="status"
            aria-label={text.loading}
            className="absolute inset-0 m-auto size-6 animate-spin rounded-full border-2 border-line"
            style={{ borderTopColor: 'var(--accent)' }}
          />
        )}
        {unavailable && <Notice message={text.unavailable} />}
        {failure && !unavailable && (
          <Notice message={`${text.failed} ${failure}`} action={{ label: text.retry, onClick: skin.reload }} />
        )}
      </div>
      {standard && <span className="mt-1 text-[12px] text-subtle">{text.standard}</span>}
      <span aria-hidden="true" className="mt-2 h-5 w-40 rounded-[50%] bg-black/40 blur-md" />
    </div>
  )
}

/**
 * A WebGL viewer that holds one pose: no animation, no auto-rotation, no drag rotation, no zoom.
 * The pose is set on the body parts (radians): arms out and up, a leg stepping forward, the body
 * turned a little and the head tilted, so the figure reads as posing rather than standing.
 */
function createViewer(canvas: HTMLCanvasElement, frame: HTMLDivElement | null): SkinViewer {
  const viewer = new SkinViewer({
    canvas,
    width: frame?.clientWidth || 240,
    height: frame?.clientHeight || 300
  })
  viewer.autoRotate = false
  viewer.controls.enableRotate = false
  viewer.controls.enableZoom = false
  viewer.controls.enablePan = false
  applyPose(viewer)
  return viewer
}

function applyPose(viewer: SkinViewer): void {
  const { skin } = viewer.playerObject
  viewer.playerObject.rotation.y = 0.35
  skin.head.rotation.z = -0.12
  skin.rightArm.rotation.z = -2.5
  skin.rightArm.rotation.x = -0.25
  skin.leftArm.rotation.z = 0.35
  skin.leftArm.rotation.x = 0.2
  skin.leftLeg.rotation.x = -0.45
  skin.rightLeg.rotation.x = 0.25
}

function Notice({ message, action }: { message: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="absolute inset-0 m-auto flex h-fit flex-col items-center gap-2 text-center text-[13px] text-subtle">
      <p>{message}</p>
      {action && (
        <button type="button" onClick={action.onClick} className="font-semibold text-accent underline underline-offset-4">
          {action.label}
        </button>
      )}
    </div>
  )
}
