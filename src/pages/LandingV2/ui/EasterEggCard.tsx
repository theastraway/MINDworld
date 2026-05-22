import { useEffect, useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import { prefersReducedMotion } from '../util/prefersReducedMotion'

/**
 * Toast-style notification card that surfaces when the user discovers an
 * easter egg in the MIND world (Achilles statue, Konami code, Founder
 * Stone, horn-fireworks, etc.).
 *
 * UX:
 *   - Floats top-center directly under the DiscoveryCounter pill.
 *   - Dark backdrop with a brand-red border and brand-cream text.
 *   - Slides in from above on mount (visible=true) and slides out on
 *     dismiss (visible=false). The 320ms transition is matched in the
 *     parent's unmount timeout so the slide-out actually animates before
 *     React removes the element.
 *   - Auto-dismisses after 3000ms via an internal timer. The timer is
 *     cleared on click-to-dismiss so the user can't accidentally double-
 *     fire `onDismiss`.
 *
 * The component is a pure UI shell — the parent owns which egg is active
 * and what copy to show. The `subtitle` prop accepts multi-line strings
 * (the Founder Stone egg uses a longer 2-line message).
 */
export interface EasterEggCardProps {
  /** Stable key for the egg (e.g. `'achilles'`, `'konami'`). Used for the React `key` and the auto-dismiss timer reset. */
  eggKey: string
  /** Headline copy. Short — fits on one line. */
  title: string
  /** Optional sub-copy. Up to ~3 lines. */
  subtitle?: string
  /** True while the card is visible. Parent flips false to start the slide-out. */
  visible: boolean
  /** Invoked when the user dismisses by click OR when the 3s auto-timer fires. */
  onDismiss: () => void
}

const AUTO_DISMISS_MS = 3000

export function EasterEggCard({ eggKey, title, subtitle, visible, onDismiss }: EasterEggCardProps) {
  // We need to stay mounted briefly after `visible` flips false so the
  // slide-out transition can play. The parent removes us from the DOM
  // ~320ms after toggling visible — this state mirrors that timing so
  // the slide-out renders smoothly without a flash of the in-state.
  const [render, setRender] = useState<boolean>(visible)

  useEffect(() => {
    if (visible) {
      setRender(true)
    } else {
      // Let slide-out play before unmount-style style flip.
      const t = window.setTimeout(() => setRender(false), 320)
      return () => window.clearTimeout(t)
    }
    return undefined
  }, [visible])

  // Auto-dismiss timer. Re-armed whenever a new egg is shown (eggKey changes).
  useEffect(() => {
    if (!visible) return undefined
    const t = window.setTimeout(onDismiss, AUTO_DISMISS_MS)
    return () => window.clearTimeout(t)
  }, [eggKey, visible, onDismiss])

  if (!render) return null

  // Reduced-motion: skip the slide-in / slide-out transitions. The toast
  // still appears + auto-dismisses (motion essential to conveying the
  // "egg found" event), but the translate-y animation is suppressed so
  // the card simply fades in place.
  const reducedMotion = prefersReducedMotion()
  const transitionClass = reducedMotion ? '' : 'transition-all duration-300 ease-out'
  const visibilityClass = reducedMotion
    ? visible ? 'opacity-100' : 'opacity-0'
    : visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3'

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={[
        'absolute left-1/2 -translate-x-1/2 top-14 sm:top-16 z-30 pointer-events-auto',
        transitionClass,
        visibilityClass,
      ].filter(Boolean).join(' ')}
    >
      <button
        onClick={onDismiss}
        aria-label={`Dismiss easter egg: ${title}`}
        className={[
          'group flex items-start gap-2.5 rounded-2xl border border-[#F43F3F]/55 bg-black/75 backdrop-blur-md',
          'px-4 py-2.5 text-left shadow-[0_8px_30px_rgba(244,63,63,0.35)] max-w-[320px] sm:max-w-[380px]',
          'hover:bg-black/85 transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFCC4D] focus-visible:ring-offset-2 focus-visible:ring-offset-black',
        ].join(' ')}
      >
        <Sparkles className="size-4 text-[#FFCC4D] shrink-0 mt-0.5 drop-shadow-[0_0_6px_rgba(255,204,77,0.65)]" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] uppercase tracking-[0.18em] text-[#FFCC4D] font-bold leading-tight">
            Easter egg
          </div>
          <div className="text-[13px] sm:text-sm font-bold text-[#FAF1E0] leading-snug mt-0.5">
            {title}
          </div>
          {subtitle && (
            <div className="text-[11px] sm:text-[12px] text-[#FAF1E0]/90 leading-snug mt-1 whitespace-pre-line">
              {subtitle}
            </div>
          )}
        </div>
        <X className="size-3.5 text-white/60 group-hover:text-white/90 shrink-0 mt-0.5" aria-hidden="true" />
      </button>
    </div>
  )
}
