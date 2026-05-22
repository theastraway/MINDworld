// Haptic feedback helpers for LandingV2 (Wave-3 / C5).
//
// `navigator.vibrate` is a no-op (returns false) on iOS Safari at the
// moment of writing — Apple has never shipped it. On Android Chrome
// + Firefox it fires the device's vibration motor. We feature-detect
// + silently skip when unavailable so the call sites can stay clean.
//
// The patterns below are intentionally short — long vibrations are
// jarring and burn battery on cheap Android hardware.

/** True when the browser exposes a working vibrate API. */
export function hapticsSupported(): boolean {
  if (typeof navigator === 'undefined') return false
  return typeof navigator.vibrate === 'function'
}

/**
 * Fire a haptic pattern. `pattern` is either a single millisecond duration
 * or an array of [vibrate, pause, vibrate, …] alternating durations.
 * No-op when unsupported.
 */
export function haptic(pattern: number | number[]): void {
  if (!hapticsSupported()) return
  try {
    navigator.vibrate(pattern)
  } catch {
    // Some Android browsers throw if vibrate is called from a hidden tab
    // or in rapid succession. Swallow — haptics are nice-to-have.
  }
}

/** Short single pulse — fires on monument discovery. */
export const HAPTIC_DISCOVER = 80

/** Double pulse — fires on hidden / easter-egg discovery. */
export const HAPTIC_EASTER_EGG: number[] = [50, 30, 50]

/** Triumphant pattern — reserved for the summit reach (Wave-3 C1+C2). */
export const HAPTIC_SUMMIT: number[] = [100, 50, 100, 50, 200]
