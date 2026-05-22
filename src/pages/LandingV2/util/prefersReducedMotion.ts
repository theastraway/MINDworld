/**
 * Synchronous `prefers-reduced-motion: reduce` probe (Wave-4 / D5).
 *
 * The top-level LandingV2 shell already short-circuits to the static
 * `ReducedMotionFallback` when the OS preference is set — most cinematic
 * UI never even mounts. But two paths exist where reduced-motion respect
 * still matters AT THE COMPONENT LEVEL:
 *
 *   1. The static fallback itself (rendered when reduced-motion is on
 *      AND/OR WebGL is unavailable). Animations inside the fallback —
 *      hero-image fade-in, focus ring transitions — should be suppressed
 *      when the OS preference is the reason we're rendering it.
 *
 *   2. Defense-in-depth on overlays that may show in odd race conditions
 *      where the OS preference flipped mid-session (extremely rare, but
 *      cheap to guard against). E.g. EasterEggCard slide-in.
 *
 * SSR-safe — returns `false` when `window` is undefined.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
