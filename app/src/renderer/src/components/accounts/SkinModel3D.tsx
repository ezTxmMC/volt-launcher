import { useEffect, useRef, useState } from 'react'
import { SkinViewer } from 'skinview3d'

/**
 * A skin as a 3D model (skinview3d, WebGL). It stands still: no idle animation and no automatic turn.
 * Dragging turns it by hand, zoom stays off. `back` turns it to the back view (the Front / Back buttons).
 */
export function SkinModel3D({ src, slim, back, className = '' }: { src: string; slim: boolean; back: boolean; className?: string }) {
  const frameRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewerRef = useRef<SkinViewer | null>(null)
  const [failed, setFailed] = useState(false)

  // Created once per mount; released when the preview leaves the page.
  useEffect(() => {
    const canvas = canvasRef.current
    const frame = frameRef.current
    if (!canvas || !frame) return
    let viewer: SkinViewer
    try {
      viewer = new SkinViewer({ canvas, width: frame.clientWidth || 240, height: frame.clientHeight || 300 })
    } catch {
      setFailed(true)
      return
    }
    viewer.autoRotate = false
    viewer.controls.enableZoom = false
    viewer.controls.enablePan = false
    viewerRef.current = viewer
    const observer = new ResizeObserver(() => {
      if (frame.clientWidth > 0 && frame.clientHeight > 0) viewer.setSize(frame.clientWidth, frame.clientHeight)
    })
    observer.observe(frame)
    return () => {
      observer.disconnect()
      viewer.dispose()
      viewerRef.current = null
    }
  }, [])

  // The skin and the view follow the props; the model keeps its place while the skin changes.
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    setFailed(false)
    viewer.loadSkin(src, { model: slim ? 'slim' : 'default' }).catch(() => setFailed(true))
  }, [src, slim])

  useEffect(() => {
    const viewer = viewerRef.current
    if (viewer) viewer.playerObject.rotation.y = back ? Math.PI : 0
  }, [back])

  return (
    <div ref={frameRef} className={`relative h-[300px] w-[200px] cursor-grab touch-none active:cursor-grabbing ${className}`}>
      <canvas ref={canvasRef} role="img" aria-label="3D" className="absolute inset-0 h-full w-full" />
      {failed && <p className="absolute inset-0 grid place-items-center text-center text-[13px] text-subtle">3D</p>}
    </div>
  )
}
