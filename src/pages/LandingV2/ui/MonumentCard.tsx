import { useEffect, useRef, useState } from 'react'
import { ChevronRight, X } from 'lucide-react'
import type { Monument } from '../districts/types'
import { useFocusTrap } from '../util/useFocusTrap'
import { prefersReducedMotion } from '../util/prefersReducedMotion'

interface MonumentCardProps {
  monument: Monument
  onClose: () => void
  onCta: (path: string) => void
  /** Fired (before `onCta`) when the user clicks the CTA button. C3 wires
   *  this to the PostHog `monument_cta_clicked:<key>` event. Optional —
   *  callers that don't care about analytics can omit it. */
  onCtaClicked?: (key: string, targetPath: string) => void
}

const MOBILE_BREAKPOINT_PX = 640
const DRAG_DISMISS_PX = 80

/**
 * Proximity card shown when the car enters a monument's radius.
 *
 * Desktop (≥640px):  floating centered card, slide-up from below on mount.
 * Mobile  (<640px):  full-width bottom sheet anchored to the bottom edge,
 *                    drag handle, swipe-down to dismiss, safe-area inset.
 *
 * The two layouts share the same content — only the container + chrome
 * differ. Geometry switches via a single `isMobile` boolean computed
 * once on mount + on resize.
 */
export function MonumentCard({ monument, onClose, onCta, onCtaClicked }: MonumentCardProps) {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth < MOBILE_BREAKPOINT_PX
  })
  const [translateY, setTranslateY] = useState<number>(0)
  // Reduced-motion users skip the slide-up animation entirely — the card
  // is "mounted" from frame 1, so the screen reader announces it without
  // a 320ms window where the dialog isn't yet at its final position.
  const reducedMotion = prefersReducedMotion()
  const [mounted, setMounted] = useState<boolean>(reducedMotion)
  const touchStartY = useRef<number | null>(null)
  const sheetRef = useRef<HTMLDivElement>(null)

  // Stable title id so the dialog can point aria-labelledby at the
  // heading — VoiceOver / NVDA will then announce the monument title as
  // the dialog name on focus.
  const titleId = `monument-title-${monument.key}`

  // ── Accessibility: focus trap ─────────────────────────────────
  // Standard WAI-ARIA dialog pattern — focus is trapped inside the
  // card while it's open, then restored to whatever held focus before
  // the proximity trigger fired. Disabled in reduced-motion + always-on
  // otherwise so keyboard users on mobile + desktop get the same UX.
  useFocusTrap({ active: true, containerRef: sheetRef })

  // ESC closes the dialog — matches keyboard behavior across modal
  // overlays in the app. Captured at document level so the canvas
  // (which holds focus by default) doesn't swallow the key.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Trigger the mount-in transition by setting `mounted` true on next
  // frame. The card starts off-screen below (translateY = full height)
  // and slides up to translateY = 0. Without the requestAnimationFrame
  // delay the browser batches the initial style + transition target into
  // a single paint and the animation never runs. Skipped entirely under
  // reduced-motion — see initializer above.
  useEffect(() => {
    if (reducedMotion) return
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [reducedMotion])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const onResize = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT_PX)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // ── Drag-to-dismiss (mobile only) ────────────────────────────
  // Track the initial touch Y. On move, if the user has dragged DOWN
  // (positive dy) past DRAG_DISMISS_PX, fire onClose. Negative dy is
  // ignored — we don't let users push the sheet up beyond its rest.
  // While dragging, the sheet follows the finger via `translateY` so
  // there's tactile feedback before the dismiss commits.
  const onTouchStart = (e: React.TouchEvent) => {
    if (!isMobile) return
    touchStartY.current = e.touches[0].clientY
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (!isMobile) return
    if (touchStartY.current === null) return
    const dy = e.touches[0].clientY - touchStartY.current
    if (dy > 0) setTranslateY(dy)
  }
  const onTouchEnd = () => {
    if (!isMobile) return
    if (touchStartY.current === null) return
    if (translateY > DRAG_DISMISS_PX) {
      onClose()
    } else {
      // Snap back to rest.
      setTranslateY(0)
    }
    touchStartY.current = null
  }

  if (isMobile) {
    // Bottom sheet. Anchored to the bottom edge with safe-area padding
    // so the CTA + sheet edge clear the iOS home indicator.
    const yOffset = mounted ? translateY : 600 // start fully below-screen on first paint
    return (
      <div
        className="absolute left-0 right-0 bottom-0 z-20 w-full pointer-events-none"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          transform: reducedMotion ? 'none' : `translateY(${yOffset}px)`,
          transition: reducedMotion
            ? 'none'
            : touchStartY.current === null
              ? 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)'
              : 'none',
        }}
      >
        <div
          ref={sheetRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
          className="pointer-events-auto rounded-t-3xl border-t border-x border-[#F43F3F]/40 bg-black/95 backdrop-blur-md pt-3 pb-5 px-5 relative shadow-[0_-8px_60px_rgba(244,63,63,0.3)]"
        >
          {/* Drag-to-dismiss handle */}
          <div
            aria-hidden="true"
            className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/30"
          />
          <button
            onClick={onClose}
            aria-label={`Close ${monument.title} details`}
            className="absolute top-3 right-3 min-h-11 min-w-11 rounded-full flex items-center justify-center text-white/85 active:text-white active:bg-white/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFCC4D] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
          <div className="text-[10px] uppercase tracking-[0.32em] text-[#F43F3F] font-bold pr-12">{monument.tagline}</div>
          <h3
            id={titleId}
            className="text-2xl font-extrabold tracking-tight mt-1 pr-12"
          >
            {monument.title}
          </h3>
          <p className="text-sm text-white/80 mt-3 leading-relaxed">{monument.detail}</p>
          <button
            onClick={() => {
              onCtaClicked?.(monument.key, monument.ctaPath)
              onCta(monument.ctaPath)
            }}
            aria-label={`${monument.cta} — ${monument.title}`}
            className="mt-5 w-full inline-flex items-center justify-center gap-1.5 bg-[#F43F3F] active:bg-[#F43F3F]/90 text-white text-[13px] font-bold px-5 min-h-12 rounded-full transition-colors uppercase tracking-wider focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFCC4D] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            {monument.cta} <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    )
  }

  // Desktop / tablet — original floating card with slide-up mount.
  return (
    <div
      className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-[calc(100vw-2rem)] max-w-md"
      style={{
        transform: reducedMotion
          ? 'translate(-50%, 0px)'
          : `translate(-50%, ${mounted ? '0px' : '40px'})`,
        opacity: reducedMotion ? 1 : mounted ? 1 : 0,
        transition: reducedMotion ? 'none' : 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1), opacity 320ms ease',
      }}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="rounded-2xl border border-[#F43F3F]/40 bg-black/85 backdrop-blur-md p-5 sm:p-6 relative shadow-[0_8px_60px_rgba(244,63,63,0.25)]"
      >
        <button
          onClick={onClose}
          aria-label={`Close ${monument.title} details`}
          className="absolute top-3 right-3 size-7 rounded-full flex items-center justify-center text-white/85 hover:text-white hover:bg-white/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFCC4D] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
        <div className="text-[10px] uppercase tracking-[0.32em] text-[#F43F3F] font-bold">{monument.tagline}</div>
        <h3
          id={titleId}
          className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-1"
        >
          {monument.title}
        </h3>
        <p className="text-sm text-white/80 mt-3 leading-relaxed">{monument.detail}</p>
        <button
          onClick={() => {
            onCtaClicked?.(monument.key, monument.ctaPath)
            onCta(monument.ctaPath)
          }}
          aria-label={`${monument.cta} — ${monument.title}`}
          className="mt-5 inline-flex items-center gap-1.5 bg-[#F43F3F] hover:bg-[#F43F3F]/90 text-white text-[12px] font-bold px-4 min-h-11 py-2.5 rounded-full transition-colors uppercase tracking-wider focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFCC4D] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        >
          {monument.cta} <ChevronRight className="size-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
