import { useEffect, useState } from 'react'
import { prefersReducedMotion } from '../util/prefersReducedMotion'

interface LoaderProps {
  /**
   * Real asset-load progress in [0..1]. When undefined, the bar runs an
   * indeterminate animation instead of showing a fake percentage.
   * Honors the "no fake numbers" rule from § 9 of MIND_WORLD_VISION.
   */
  progress?: number
  /**
   * When true, the loader fades out (parent should unmount after the
   * transition). Triggered by SceneRoot.onReady or React.Suspense resolve.
   */
  dismissing?: boolean
  /** Optional subtitle. Defaults to "Loading MIND World...". */
  label?: string
}

const LETTERS = ['M', 'I', 'N', 'D'] as const

/**
 * Branded full-screen loading screen for LandingV2.
 *
 * Visual:
 *  - Full-screen dusk gradient backdrop (#1a1418 → #2a1f25) matching the
 *    world palette so the transition into the scene feels continuous.
 *  - The four M-I-N-D letterforms (re-using the same /M.png /I.png /N.png
 *    /D.png textures the 3D plaza uses) fade in one by one over ~1.2s
 *    with a subtle continuous pulse.
 *  - A thin bottom progress bar tied to REAL asset loads via
 *    THREE.LoadingManager wiring in SceneRoot — never a fake percentage.
 *    If `progress` is undefined, runs an indeterminate animation.
 *  - "Loading MIND World..." label, caveman-confident weight.
 *
 * The loader unmounts via opacity fade when `dismissing === true`.
 */
export function Loader({ progress, dismissing = false, label = 'Loading MIND World...' }: LoaderProps) {
  // Reduced-motion users see the loader fully formed from frame 1 — no
  // staggered fades, no transform-up, no continuous pulse. The progress
  // bar still ticks (motion that carries critical info is exempt per
  // WCAG 2.3.3 — "motion required to convey purpose").
  const reducedMotion = prefersReducedMotion()
  // Used to defer mounting the letters in the DOM so the CSS fade-in
  // transitions trigger on first paint instead of being instant.
  const [mounted, setMounted] = useState(reducedMotion)
  useEffect(() => {
    if (reducedMotion) return
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [reducedMotion])

  const pct = typeof progress === 'number' ? Math.max(0, Math.min(1, progress)) : null
  const indeterminate = pct === null

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy={!dismissing}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center select-none"
      style={{
        background: 'linear-gradient(180deg, #1a1418 0%, #2a1f25 100%)',
        opacity: dismissing ? 0 : 1,
        transition: 'opacity 420ms ease-out',
        pointerEvents: dismissing ? 'none' : 'auto',
      }}
    >
      {/* Letterforms */}
      <div className="flex items-center gap-3 sm:gap-4 md:gap-5">
        {LETTERS.map((letter, i) => (
          <img
            key={letter}
            src={`/${letter}.png`}
            alt={letter}
            draggable={false}
            decoding="async"
            fetchPriority="high"
            width={96}
            height={96}
            className="block w-14 h-14 sm:w-20 sm:h-20 md:w-24 md:h-24"
            style={{
              opacity: mounted ? 1 : 0,
              transform: mounted ? 'translateY(0px) scale(1)' : 'translateY(8px) scale(0.92)',
              transition: reducedMotion
                ? 'none'
                : `opacity 420ms ease-out ${i * 220}ms, transform 520ms ease-out ${i * 220}ms`,
              filter: 'drop-shadow(0 6px 24px rgba(244, 63, 63, 0.35))',
              animation: !reducedMotion && mounted
                ? `mind-loader-pulse 2400ms ease-in-out ${1200 + i * 180}ms infinite`
                : 'none',
            }}
          />
        ))}
      </div>

      {/* Label */}
      <div
        className="mt-6 sm:mt-8 text-[11px] sm:text-xs uppercase tracking-[0.32em] text-white/85 font-bold"
        style={{
          opacity: mounted ? 1 : 0,
          transition: reducedMotion ? 'none' : 'opacity 600ms ease-out 1000ms',
        }}
      >
        {label}
      </div>

      {/* Progress bar */}
      <div
        className="mt-6 sm:mt-8 h-[3px] w-[200px] sm:w-[260px] rounded-full overflow-hidden bg-white/8"
        style={{
          opacity: mounted ? 1 : 0,
          transition: reducedMotion ? 'none' : 'opacity 600ms ease-out 1200ms',
          backgroundColor: 'rgba(255, 255, 255, 0.08)',
        }}
        aria-label={indeterminate ? 'Loading' : `Loading ${Math.round((pct ?? 0) * 100)} percent`}
      >
        {indeterminate ? (
          <div
            className="h-full w-1/3 rounded-full"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, #F43F3F 50%, transparent 100%)',
              // Sweep animation is essential to communicate "loading is
              // still happening" — even under reduced-motion we keep it
              // because the alternative is a frozen bar that misleads the
              // user. Indeterminate progress is an exception under WCAG
              // 2.3.3 ("motion required to convey purpose").
              animation: 'mind-loader-sweep 1400ms ease-in-out infinite',
            }}
          />
        ) : (
          <div
            className="h-full rounded-full"
            style={{
              width: `${(pct ?? 0) * 100}%`,
              background: 'linear-gradient(90deg, #F43F3F 0%, #FF5A5A 100%)',
              transition: 'width 240ms ease-out',
              boxShadow: '0 0 12px rgba(244, 63, 63, 0.6)',
            }}
          />
        )}
      </div>

      {/* Keyframes — scoped via plain <style>, no extra deps */}
      <style>{`
        @keyframes mind-loader-pulse {
          0%, 100% { transform: translateY(0) scale(1); filter: drop-shadow(0 6px 24px rgba(244, 63, 63, 0.35)); }
          50% { transform: translateY(-3px) scale(1.04); filter: drop-shadow(0 10px 32px rgba(244, 63, 63, 0.55)); }
        }
        @keyframes mind-loader-sweep {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
      `}</style>
    </div>
  )
}

/**
 * Lightweight loader for the React.Suspense fallback used while the
 * LandingV2 lazy-chunk downloads. Same brand markup but no progress bar
 * (no asset loads happening yet — just JS chunk fetch).
 */
export function LoaderShell() {
  return <Loader label="Loading MIND World..." progress={undefined} />
}
