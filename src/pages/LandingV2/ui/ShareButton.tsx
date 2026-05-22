import { useState } from 'react'
import { Share2 } from 'lucide-react'
import { toast } from 'sonner'

/**
 * ShareButton — capture the current MIND World canvas, watermark it,
 * and either invoke the native share sheet (mobile) or fall back to
 * download + clipboard URL copy (desktop / unsupported browsers).
 *
 * Spec: MIND_WORLD_VISION.md § 11 (SEO & Share) and § 5 (Car & Driving —
 * Screenshot button + Share button).
 *
 * The canvas lookup uses `document.querySelector('canvas')` because:
 *   1. LandingV2 is the only route that renders a Three.js canvas, so the
 *      query is unambiguous at this URL.
 *   2. Threading a ref out of `SceneRoot` would require modifying the scene
 *      module — out of scope for A3 (production-additive on live code).
 */

const SHARE_TITLE = 'I drove the MIND'
const SHARE_TEXT = 'Eight districts. Every capability. Drive it at m-i-n-d.ai/LandingV2'
const SHARE_URL = 'https://m-i-n-d.ai/LandingV2'

interface ShareButtonProps {
  /** Optional active monument key — currently unused (per § 2d stretch goal).
   *  Threaded through so the per-district variant can be added without an
   *  API break later. */
  activeMonumentTitle?: string | null
  /** Fired the moment the user clicks the share button — BEFORE any
   *  capture / native-share / download work happens. Receives whether a
   *  MonumentCard is currently open. C3 wires this to the PostHog
   *  `screenshot_captured` event. Optional. */
  onCaptureStarted?: (withMonument: boolean) => void
  /** Fired exactly once when a share path completes successfully. `path`
   *  is `'native'` when the OS share sheet returned without an abort, or
   *  `'download'` when we fell back to image download + clipboard copy.
   *  C3 wires this to PostHog `share_clicked`. Optional. */
  onShared?: (path: 'native' | 'download') => void
}

type ShareSupport = {
  files: boolean
  basic: boolean
}

function detectShareSupport(): ShareSupport {
  if (typeof navigator === 'undefined') return { files: false, basic: false }
  const basic = typeof navigator.share === 'function'
  let files = false
  if (basic && typeof navigator.canShare === 'function') {
    try {
      const dummy = new File([new Blob([''], { type: 'image/png' })], 'probe.png', { type: 'image/png' })
      files = navigator.canShare({ files: [dummy] })
    } catch {
      files = false
    }
  }
  return { files, basic }
}

async function compositeWatermark(srcCanvas: HTMLCanvasElement, captionLine?: string): Promise<HTMLCanvasElement> {
  const out = document.createElement('canvas')
  out.width = srcCanvas.width
  out.height = srcCanvas.height
  const ctx = out.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable')

  ctx.drawImage(srcCanvas, 0, 0)

  // --- bottom-right MIND wordmark watermark ---
  const padding = Math.max(18, Math.round(out.width * 0.018))
  const pillH = Math.max(38, Math.round(out.width * 0.038))
  const fontPx = Math.max(16, Math.round(pillH * 0.5))
  const text = 'm-i-n-d.ai/LandingV2'
  ctx.font = `600 ${fontPx}px "Inter", system-ui, -apple-system, "Segoe UI", sans-serif`
  const textWidth = ctx.measureText(text).width
  const pillW = textWidth + pillH * 1.1

  const x = out.width - padding - pillW
  const y = out.height - padding - pillH

  // pill background
  const r = pillH / 2
  ctx.fillStyle = 'rgba(0, 0, 0, 0.62)'
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + pillW, y, x + pillW, y + pillH, r)
  ctx.arcTo(x + pillW, y + pillH, x, y + pillH, r)
  ctx.arcTo(x, y + pillH, x, y, r)
  ctx.arcTo(x, y, x + pillW, y, r)
  ctx.closePath()
  ctx.fill()

  // brand-red accent dot
  ctx.fillStyle = '#F43F3F'
  ctx.beginPath()
  ctx.arc(x + r * 0.85, y + pillH / 2, fontPx * 0.32, 0, Math.PI * 2)
  ctx.fill()

  // wordmark
  ctx.fillStyle = '#ffffff'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + r * 1.55, y + pillH / 2 + 1)

  // --- optional bottom-left caption line ---
  if (captionLine) {
    const capFont = Math.max(14, Math.round(pillH * 0.42))
    ctx.font = `500 ${capFont}px "Inter", system-ui, -apple-system, "Segoe UI", sans-serif`
    const cx = padding
    const cy = out.height - padding - capFont / 2 - 4
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
    const capWidth = ctx.measureText(captionLine).width
    ctx.fillRect(cx - 8, cy - capFont / 2 - 6, capWidth + 16, capFont + 12)
    ctx.fillStyle = '#ffffff'
    ctx.textBaseline = 'middle'
    ctx.fillText(captionLine, cx, cy)
  }

  return out
}

function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png'): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('canvas.toBlob returned null'))
        return
      }
      resolve(blob)
    }, type)
  })
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  // Revoke after the browser has had a chance to process the download.
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      return false
    }
  }
  return false
}

export function ShareButton({ activeMonumentTitle, onCaptureStarted, onShared }: ShareButtonProps) {
  const [busy, setBusy] = useState(false)

  const onShare = async () => {
    if (busy) return
    setBusy(true)
    // Fire the capture-started signal immediately — even if downstream
    // capture work fails (canvas missing, toBlob null), the user
    // *intended* to share, which is what the funnel cares about.
    onCaptureStarted?.(activeMonumentTitle != null)
    try {
      const canvas = document.querySelector<HTMLCanvasElement>('canvas')
      if (!canvas) {
        toast.error('Nothing to share yet. Give the world a second to load.')
        return
      }

      const caption = activeMonumentTitle
        ? `I just discovered ${activeMonumentTitle}`
        : undefined
      const composed = await compositeWatermark(canvas, caption)
      const blob = await canvasToBlob(composed, 'image/png')

      const support = detectShareSupport()
      const filename = 'mind-world.png'

      if (support.files) {
        try {
          const file = new File([blob], filename, { type: 'image/png' })
          await navigator.share({
            files: [file],
            title: SHARE_TITLE,
            text: SHARE_TEXT,
            url: SHARE_URL,
          })
          onShared?.('native')
          return
        } catch (err) {
          // User cancel or share rejected — fall through to download path.
          if ((err as DOMException)?.name === 'AbortError') return
        }
      }

      if (support.basic) {
        try {
          await navigator.share({
            title: SHARE_TITLE,
            text: SHARE_TEXT,
            url: SHARE_URL,
          })
          // Also surface the image as a download — basic share has no image.
          triggerDownload(blob, filename)
          onShared?.('native')
          return
        } catch (err) {
          if ((err as DOMException)?.name === 'AbortError') return
        }
      }

      // Desktop / unsupported — download + clipboard URL.
      triggerDownload(blob, filename)
      const copied = await copyTextToClipboard(SHARE_URL)
      toast.success(copied ? 'Image saved + link copied' : 'Image saved')
      onShared?.('download')
    } catch (err) {
      console.error('[ShareButton] failed:', err)
      toast.error("Couldn't capture the world. Try again in a moment.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      onClick={onShare}
      disabled={busy}
      aria-label="Share a screenshot of the MIND World"
      title="Share this view"
      className="size-11 sm:size-9 rounded-full bg-black/40 hover:bg-black/60 disabled:opacity-60 disabled:cursor-progress text-white border border-white/20 backdrop-blur-md flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFCC4D] focus-visible:ring-offset-2 focus-visible:ring-offset-black/40"
    >
      <Share2 className="size-4" aria-hidden="true" />
    </button>
  )
}
