import { useEffect, useId, useRef } from 'react'
import { ArrowRight } from 'lucide-react'
import { useFocusTrap } from '../util/useFocusTrap'
import { prefersReducedMotion } from '../util/prefersReducedMotion'

interface SummitProps {
  /**
   * Called when the user clicks "Drive more →". The parent unmounts the
   * Summit overlay, releases the scene from summit mode (camera returns
   * to follow, plaza beam returns to base intensity), and unlocks the
   * Founder Edition skin via `unlockSkin('founder')`.
   */
  onDriveMore: () => void
  /**
   * Called when the user clicks any of the CTA gauntlet buttons. Receives
   * the routing path or mailto URL for the parent to navigate / open.
   * The parent also records `landingv2_summit_cta_clicked:<target>` for
   * analytics in a later subagent (C3).
   */
  onCta: (target: string) => void
  /** Optional hover hook (engine.playUiHover). Already-unmuted scene. */
  onCtaHover?: () => void
}

/**
 * Full-screen overlay that appears the moment the user discovers all 8
 * main districts (vision § 6 Beat 3). The scene continues to animate
 * underneath (we don't black out) — the underlying SceneRoot raises the
 * camera to an overhead drone shot and saturates the MIND Tower beam via
 * `setSummit(true)`, and the audio engine plays the summit fanfare.
 *
 * Composition:
 *   1. Headline "All 8 monuments discovered." (fade in over ~600ms)
 *   2. Subhead "MIND is the foundation. Pick where you go next."
 *   3. 2×2 grid of CTAs:
 *      - Get MIND →           (primary, brand red, larger weight)
 *      - Watch the 90s demo → (secondary)
 *      - API for builders →   (secondary)
 *      - Talk to founder →    (secondary, mailto)
 *   4. Small "Drive more →" link bottom-right to dismiss + unlock skin
 *
 * The overlay deliberately does NOT cover the whole viewport with an
 * opaque background — it uses a soft top-down gradient + the headline
 * sits high so the world animates visibly below.
 *
 * Mobile: stacks to a single column at < 640px, all buttons full width.
 *
 * CTAs (all real, no fabrications):
 *   - `/register` is live (the existing auth/register route)
 *   - The mailto opens the user's mail client with a real subject line
 *   - "Watch the 90s demo" and "API for builders" point at `/register`
 *     for now per task spec — Wave 5 polish will swap them once routes exist.
 */
export function Summit({ onDriveMore, onCta, onCtaHover }: SummitProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const reducedMotion = prefersReducedMotion()

  // Lock body scroll while summit is visible — the page is already a
  // fixed-positioned canvas viewport so this is defense in depth.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  // Trap focus inside the gauntlet so Tab cycles through the four CTAs +
  // "Drive more" link without escaping into the canvas behind. ESC fires
  // the same path as "Drive more" — it's the natural keyboard dismiss
  // and the spec confirms the overlay should always be exitable.
  useFocusTrap({ active: true, containerRef })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onDriveMore()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onDriveMore])

  // Reduced-motion users skip the staggered fade animations — every layer
  // is on-screen from the first paint so the gauntlet doesn't read as a
  // moving target to a user who opted out of motion.
  const fadeAnim = reducedMotion ? 'none' : 'mind-world-summit-fade 600ms ease-out both'
  const headlineAnim = reducedMotion
    ? 'none'
    : 'mind-world-summit-headline 1100ms cubic-bezier(0.22, 1, 0.36, 1) 200ms both'
  const cardsAnim = reducedMotion
    ? 'none'
    : 'mind-world-summit-cards 1100ms cubic-bezier(0.22, 1, 0.36, 1) 500ms both'
  const driveMoreAnim = reducedMotion
    ? 'none'
    : 'mind-world-summit-cards 1100ms cubic-bezier(0.22, 1, 0.36, 1) 900ms both'

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-40 pointer-events-auto select-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      {/* Soft tinted veneer — scene shows through */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/35 to-black/55"
        style={{ animation: fadeAnim }}
      />

      {/* Centered content stack */}
      <div className="relative w-full h-full flex flex-col items-center justify-center px-5">
        <div
          className="max-w-2xl w-full text-center"
          style={{ animation: headlineAnim }}
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-[#FFCC4D]/55 bg-black/55 backdrop-blur-md px-3 py-1 text-[10px] uppercase tracking-[0.24em] font-bold text-[#FFCC4D] shadow-[0_4px_30px_rgba(255,204,77,0.35)]">
            <span aria-hidden="true">✨</span>
            All 8 monuments discovered
            <span aria-hidden="true">✨</span>
          </div>
          <h2
            id={titleId}
            className="mt-5 text-3xl sm:text-5xl font-extrabold tracking-tight text-[#F8ECDC] drop-shadow-[0_4px_18px_rgba(0,0,0,0.7)]"
          >
            You've driven the <span className="text-[#F43F3F]">MIND</span>.
          </h2>
          <p className="mt-3 text-sm sm:text-base text-[#F8ECDC]/90 max-w-lg mx-auto leading-relaxed drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
            Every monument is a real capability. Pick where you go next.
          </p>
        </div>

        {/* 2×2 CTA gauntlet */}
        <div
          className="mt-8 sm:mt-10 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 w-full max-w-2xl"
          style={{ animation: cardsAnim }}
        >
          {/* Primary — Get MIND */}
          <button
            type="button"
            onClick={() => onCta('/register')}
            onMouseEnter={onCtaHover}
            aria-label="Get MIND — sign up"
            className="sm:col-span-2 group inline-flex items-center justify-center gap-2 bg-[#F43F3F] hover:bg-[#F43F3F]/90 text-white text-base sm:text-lg font-extrabold px-7 py-4 rounded-2xl transition-colors uppercase tracking-wider shadow-[0_4px_30px_rgba(244,63,63,0.55)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFCC4D] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            Get MIND
            <ArrowRight className="size-5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </button>

          {/* Watch the demo */}
          <button
            type="button"
            onClick={() => onCta('/register')}
            onMouseEnter={onCtaHover}
            aria-label="Watch the 90 second demo"
            className="group inline-flex items-center justify-center gap-2 rounded-2xl border border-white/20 bg-black/55 backdrop-blur-md hover:bg-black/65 text-[#F8ECDC] text-sm font-bold px-5 py-3.5 transition-colors uppercase tracking-wider focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFCC4D] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            Watch the 90s demo
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </button>

          {/* API for builders */}
          <button
            type="button"
            onClick={() => onCta('/register')}
            onMouseEnter={onCtaHover}
            aria-label="API for builders"
            className="group inline-flex items-center justify-center gap-2 rounded-2xl border border-white/20 bg-black/55 backdrop-blur-md hover:bg-black/65 text-[#F8ECDC] text-sm font-bold px-5 py-3.5 transition-colors uppercase tracking-wider focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFCC4D] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            API for builders
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </button>

          {/* Talk to founder — mailto */}
          <a
            href="mailto:anthony@theastraway.com?subject=Drove%20the%20MIND%20World"
            onClick={() => onCta('mailto:anthony@theastraway.com')}
            onMouseEnter={onCtaHover}
            aria-label="Email the founder"
            className="sm:col-span-2 group inline-flex items-center justify-center gap-2 rounded-2xl border border-white/20 bg-black/55 backdrop-blur-md hover:bg-black/65 text-[#F8ECDC] text-sm font-bold px-5 py-3.5 transition-colors uppercase tracking-wider focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFCC4D] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            Talk to founder
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </a>
        </div>

        {/* Drive more — bottom-right escape */}
        <div
          className="absolute bottom-6 right-6 sm:bottom-8 sm:right-8"
          style={{ animation: driveMoreAnim }}
        >
          <button
            type="button"
            onClick={onDriveMore}
            onMouseEnter={onCtaHover}
            aria-label="Drive more — return to the world with the Founder Edition car"
            className="group inline-flex items-center gap-1.5 text-[11px] sm:text-xs uppercase tracking-[0.22em] font-bold text-[#F8ECDC]/90 hover:text-[#F8ECDC] underline-offset-4 hover:underline transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFCC4D] focus-visible:ring-offset-2 focus-visible:ring-offset-black rounded-md px-2 py-1"
          >
            Drive more
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <style>{`
        @keyframes mind-world-summit-fade {
          0%   { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes mind-world-summit-headline {
          0%   { opacity: 0; transform: translateY(14px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes mind-world-summit-cards {
          0%   { opacity: 0; transform: translateY(20px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
