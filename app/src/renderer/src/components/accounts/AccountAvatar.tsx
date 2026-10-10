import { useEffect, useRef, useState } from 'react'
import { DEFAULT_SKIN_DATA_URL } from '@/components/home/defaultSkin'

/** Head regions of a Minecraft skin: the face and the hat overlay, both 8x8 pixels. */
const FACE = { x: 8, y: 8 }
const HAT = { x: 40, y: 8 }
const HEAD = 8
/** The head is drawn at 8x its skin size; the canvas is then scaled by CSS without smoothing. */
const CANVAS_PX = 64

type Status = 'loading' | 'ready' | 'failed'

/** Draws the face and the hat overlay of the skin into the canvas, nearest-neighbour scaled. */
function drawHead(canvas: HTMLCanvasElement, skin: HTMLImageElement): void {
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2D canvas is not available')
  context.imageSmoothingEnabled = false
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.drawImage(skin, FACE.x, FACE.y, HEAD, HEAD, 0, 0, canvas.width, canvas.height)
  // The hat layer is transparent where there is no hat, so drawing it always is correct.
  context.drawImage(skin, HAT.x, HAT.y, HEAD, HEAD, 0, 0, canvas.width, canvas.height)
}

/**
 * 2D head of an account: the face of its skin with the hat layer on top, pixelated and cropped to
 * the box that `className` gives it. Without skin data (offline, loading, no skin) the default
 * Steve skin is used. Only when the image cannot be decoded does it show the first letter of the name.
 */
export function AccountAvatar({
  name,
  skinDataUrl,
  className = ''
}: {
  name: string
  /** PNG data URL of the account's skin (64x64 or 64x32). */
  skinDataUrl?: string | null
  className?: string
}) {
  const source = skinDataUrl || DEFAULT_SKIN_DATA_URL
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState<Status>('loading')

  useEffect(() => {
    let cancelled = false
    const image = new Image()
    image.onload = () => {
      const canvas = canvasRef.current
      if (cancelled) return
      if (!canvas || image.naturalWidth < 64 || image.naturalHeight < 32) {
        setStatus('failed')
        return
      }
      try {
        drawHead(canvas, image)
        setStatus('ready')
      } catch {
        setStatus('failed')
      }
    }
    image.onerror = () => {
      if (!cancelled) setStatus('failed')
    }
    setStatus('loading')
    image.src = source
    return () => {
      cancelled = true
      image.onload = null
      image.onerror = null
    }
  }, [source])

  return (
    <span
      aria-hidden="true"
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-[6px] bg-gradient-to-br from-accent to-secondary font-bold text-white ${className}`}
    >
      <canvas
        ref={canvasRef}
        width={CANVAS_PX}
        height={CANVAS_PX}
        className={status === 'failed' ? 'hidden' : 'block size-full'}
        style={{ imageRendering: 'pixelated' }}
      />
      {status === 'failed' && <span>{name.slice(0, 1).toUpperCase() || '?'}</span>}
    </span>
  )
}
