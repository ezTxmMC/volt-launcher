import { useEffect, useRef, useState } from 'react'

/**
 * Flat preview of a skin PNG: front or back of the body, base layer and the outer "overlay"
 * layer, classic or slim arms, and the legacy 64x32 layout (limbs mirrored from the right side).
 * Drawn on a canvas from the texture itself; no 3D model is used.
 */

interface Part {
  /** Source rectangle on the texture [x, y, w, h]. */
  src: [number, number, number, number]
  /** Destination in preview units (16 wide, 32 high) [x, y]. */
  x: number
  y: number
  flip?: boolean
}

const HEAD_Y = 0
const BODY_Y = 8
const LEG_Y = 20

function parts(slim: boolean, back: boolean, legacy: boolean): { base: Part[]; overlay: Part[] } {
  const aw = slim ? 3 : 4
  // Viewer's left/right: the character's right arm is on the viewer's left in front view and on the right in back view.
  const rightArmX = back ? 12 : slim ? 1 : 0
  const leftArmX = back ? (slim ? 1 : 0) : 12
  const rightLegX = back ? 8 : 4
  const leftLegX = back ? 4 : 8
  const faceOffset = back ? 16 : 0
  const base: Part[] = [
    { src: [8 + faceOffset, 8, 8, 8], x: 4, y: HEAD_Y },
    { src: [20 + (back ? 12 : 0), 20, 8, 12], x: 4, y: BODY_Y },
    { src: [44 + (back ? 8 : 0), 20, aw, 12], x: rightArmX, y: BODY_Y },
    { src: [4 + (back ? 8 : 0), 20, 4, 12], x: rightLegX, y: LEG_Y }
  ]
  const overlay: Part[] = [
    { src: [40 + faceOffset, 8, 8, 8], x: 4, y: HEAD_Y },
    { src: [20 + (back ? 12 : 0), 36, 8, 12], x: 4, y: BODY_Y },
    { src: [44 + (back ? 8 : 0), 36, aw, 12], x: rightArmX, y: BODY_Y },
    { src: [4 + (back ? 8 : 0), 36, 4, 12], x: rightLegX, y: LEG_Y }
  ]
  if (legacy) {
    // 64x32 skins have no separate left limbs: the right ones are mirrored.
    base.push(
      { src: [44 + (back ? 8 : 0), 20, 4, 12], x: leftArmX, y: BODY_Y, flip: true },
      { src: [4 + (back ? 8 : 0), 20, 4, 12], x: leftLegX, y: LEG_Y, flip: true }
    )
  } else {
    base.push(
      { src: [36 + (back ? 8 : 0), 52, aw, 12], x: leftArmX, y: BODY_Y },
      { src: [20 + (back ? 8 : 0), 52, 4, 12], x: leftLegX, y: LEG_Y }
    )
    overlay.push(
      { src: [52 + (back ? 8 : 0), 52, aw, 12], x: leftArmX, y: BODY_Y },
      { src: [4 + (back ? 8 : 0), 52, 4, 12], x: leftLegX, y: LEG_Y }
    )
  }
  return { base, overlay }
}

export function SkinPreview({
  src,
  slim = false,
  back = false,
  scale = 8,
  className = '',
  label = ''
}: {
  /** PNG as a data URL. */
  src: string
  label?: string
  slim?: boolean
  back?: boolean
  /** Pixels per texel. */
  scale?: number
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [image, setImage] = useState<HTMLImageElement | null>(null)

  useEffect(() => {
    let cancelled = false
    const loaded = new Image()
    loaded.onload = () => {
      if (!cancelled) setImage(loaded)
    }
    loaded.onerror = () => {
      if (!cancelled) setImage(null)
    }
    loaded.src = src
    return () => {
      cancelled = true
    }
  }, [src])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !image) return
    const context = canvas.getContext('2d')
    if (!context) return
    const legacy = image.height === 32
    const { base, overlay } = parts(slim, back, legacy)
    canvas.width = 16 * scale
    canvas.height = 32 * scale
    context.imageSmoothingEnabled = false
    context.clearRect(0, 0, canvas.width, canvas.height)
    const draw = (part: Part): void => {
      const [sx, sy, sw, sh] = part.src
      const dx = part.x * scale
      const dy = part.y * scale
      const dw = sw * scale
      const dh = sh * scale
      context.save()
      if (part.flip) {
        context.translate(dx + dw, 0)
        context.scale(-1, 1)
        context.drawImage(image, sx, sy, sw, sh, 0, dy, dw, dh)
      } else {
        context.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh)
      }
      context.restore()
    }
    base.forEach(draw)
    if (!legacy) overlay.forEach(draw)
  }, [image, slim, back, scale])

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={label}
      className={`block [image-rendering:pixelated] ${className}`}
      style={{ width: 16 * scale, height: 32 * scale }}
    />
  )
}

/** The head of a skin as a square thumbnail (front face with its outer layer), from a data URL. */
export function SkinHead({ src, size = 64, className = '' }: { src: string; size?: number; className?: string }) {
  const texel = size / 8
  return (
    <span
      role="img"
      className={`relative block shrink-0 overflow-hidden rounded-md [image-rendering:pixelated] ${className}`}
      style={{ width: size, height: size }}
    >
      <span
        className="absolute inset-0 block"
        style={{
          backgroundImage: `url(${src})`,
          backgroundSize: `${64 * texel}px ${64 * texel}px`,
          backgroundPosition: `${-8 * texel}px ${-8 * texel}px`,
          imageRendering: 'pixelated'
        }}
      />
      <span
        className="absolute inset-0 block"
        style={{
          backgroundImage: `url(${src})`,
          backgroundSize: `${64 * texel}px ${64 * texel}px`,
          backgroundPosition: `${-40 * texel}px ${-8 * texel}px`,
          imageRendering: 'pixelated'
        }}
      />
    </span>
  )
}
