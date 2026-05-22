import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ReducedMotionFallback } from './ReducedMotionFallback'
import { lv2 } from '../analytics/events'

interface WebGLFallbackProps {
  /**
   * Retained from the original signature for backwards compatibility with
   * the React shell's call site. Surfaced as a tooltip on the redirect
   * button so technical users see the underlying failure reason.
   */
  message: string
  /**
   * Optional escape hatch back to LandingV1 — the legacy cinematic version
   * that runs anywhere. Kept for parity with the prior fallback so existing
   * call sites don't lose the LandingV1 link.
   */
  onRedirect?: () => void
}

/**
 * Shown when WebGL is unavailable.
 *
 * Wave-1 upgrade (subagent A2, per § 2e of MIND_WORLD_VISION):
 * Instead of a tiny "WebGL not supported" splash, render the SAME static
 * narrative as the reduced-motion fallback — eight district cards, the
 * hero block, the full pitch. The user keeps the entire MIND story even
 * without WebGL; they just can't drive the world.
 *
 * The `message` and `onRedirect` props are retained so existing callers
 * compile unchanged. `onRedirect` is surfaced as a small "Try cinematic
 * version" link in the footer; `message` is mirrored to the link's title.
 */
export function WebGLFallback({ message, onRedirect }: WebGLFallbackProps) {
  const navigate = useNavigate()

  // PostHog: fire `webgl_fallback_shown` once per browser on mount. The
  // helper is persistent (localStorage-backed) so a user repeatedly
  // bouncing between browsers/incognito doesn't inflate the count.
  useEffect(() => {
    const isMobile =
      typeof navigator !== 'undefined' &&
      (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
        (typeof window !== 'undefined' && window.innerWidth < 768))
    lv2.webglFallbackShown(isMobile ? 'mobile' : 'desktop')
  }, [])

  return (
    <div className="relative">
      <ReducedMotionFallback
        reason="webgl"
        onCta={(path) => navigate(path)}
        skipMeta
      />
      {onRedirect && (
        <div className="absolute top-4 right-4 z-20 pointer-events-auto">
          <button
            onClick={onRedirect}
            title={message}
            className="text-[10px] sm:text-[11px] uppercase tracking-[0.22em] text-white/55 hover:text-white/85 underline underline-offset-4 focus:outline-none focus:ring-2 focus:ring-[#FFCC4D] focus:ring-offset-2 focus:ring-offset-[#1a1418] rounded-md px-2 py-1"
          >
            Try cinematic version
          </button>
        </div>
      )}
    </div>
  )
}
