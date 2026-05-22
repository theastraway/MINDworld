// iOS device-orientation tilt-to-steer.
//
// Why this module exists
// ─────────────────────
// Apple gates DeviceOrientation events behind an explicit permission prompt
// on iOS 13+ Safari. The prompt has to be triggered from a user-gesture
// handler (a click/touchend) or it silently fails. So the flow is:
//
//   1. user taps a "Tilt to steer" button →
//   2. `requestGyroPermission()` runs synchronously inside that click →
//   3. iOS shows the system prompt; user grants or denies →
//   4. on grant, `attachGyro({ onInput })` wires the listener and the
//      animation loop reads tilt deltas every frame.
//
// Coordinate convention
// ─────────────────────
// `event.gamma` is left/right tilt of the device in degrees, range ~[-90, 90].
// We map gamma / GAMMA_RANGE_DEG → steering input in [-1, 1] and clamp.
// The mapped value is consumed by the joystick branch of `getInput()` in
// `index.tsx` — so positive gamma (right tilt) → positive steering input,
// which after the existing `turn = -input.x` flip in the React shell maps
// to a right turn. Matches arcade convention.
//
// Throttling
// ──────────
// `deviceorientation` can fire 60+ times per second on capable hardware.
// The animation loop only reads input once per frame, so anything above
// ~30Hz is wasted. We throttle to 30Hz with a wall-clock check inside the
// listener. Cheaper than a setInterval and stays aligned with rAF.
//
// Feature detection
// ─────────────────
// Non-iOS browsers (Chrome on Android, desktop browsers with motion
// hardware) expose `DeviceOrientationEvent` but NOT
// `requestPermission`. In that case we return `true` from the request
// path immediately and rely on the listener firing as long as the
// hardware supports it. On platforms without any orientation hardware
// the listener simply never fires — `attachGyro` is a no-op and the
// caller's UI should reflect that (e.g. hide the toggle).

const GAMMA_RANGE_DEG = 30
const THROTTLE_MS = 1000 / 30

// `requestPermission` is iOS-only; declare its shape locally so we can
// feature-detect without polluting the global `DeviceOrientationEvent` type.
type DeviceOrientationEventiOS = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

export interface GyroOptions {
  /**
   * Fired throttled (30Hz max) with the current tilt input.
   * `x` in [-1, 1] — positive = right tilt.
   * `active` true while the listener is attached AND events have arrived.
   */
  onInput: (input: { x: number; active: boolean }) => void
}

export interface GyroHandle {
  detach: () => void
}

/**
 * Returns true if `DeviceOrientationEvent` exists on the window object.
 * Doesn't tell you whether the hardware actually emits readings — that
 * only becomes knowable once a listener is attached and waits a beat.
 */
export function isGyroSupported(): boolean {
  if (typeof window === 'undefined') return false
  return typeof window.DeviceOrientationEvent !== 'undefined'
}

/**
 * Request permission to use orientation events.
 *
 * - On iOS Safari: pops the system prompt; resolves `true` on grant.
 * - On other browsers with `DeviceOrientationEvent`: resolves `true`
 *   immediately (no permission gate).
 * - On platforms without orientation support: resolves `false`.
 *
 * Must be called from a user-gesture handler on iOS or the prompt fails.
 */
export async function requestGyroPermission(): Promise<boolean> {
  if (!isGyroSupported()) return false
  const DOE = window.DeviceOrientationEvent as DeviceOrientationEventiOS
  if (typeof DOE.requestPermission === 'function') {
    try {
      const state = await DOE.requestPermission()
      return state === 'granted'
    } catch {
      // User dismissed the prompt, or non-secure context (iOS requires HTTPS)
      return false
    }
  }
  // Non-iOS — no gate, events flow if hardware exists.
  return true
}

/**
 * Attach a throttled `deviceorientation` listener. The caller is responsible
 * for tearing it down via the returned `detach()` (idempotent).
 *
 * Returns a handle even when orientation isn't supported — the listener
 * simply never fires and `detach()` is a no-op. Keeps the call site simple.
 */
export function attachGyro({ onInput }: GyroOptions): GyroHandle {
  if (!isGyroSupported() || typeof window === 'undefined') {
    return { detach: () => {} }
  }

  let lastEmit = 0
  let detached = false

  const onOrientation = (event: DeviceOrientationEvent) => {
    if (detached) return
    const now = performance.now()
    if (now - lastEmit < THROTTLE_MS) return
    lastEmit = now

    const gamma = event.gamma
    if (gamma === null || gamma === undefined) return
    let x = gamma / GAMMA_RANGE_DEG
    if (x > 1) x = 1
    else if (x < -1) x = -1
    onInput({ x, active: true })
  }

  window.addEventListener('deviceorientation', onOrientation)

  return {
    detach: () => {
      if (detached) return
      detached = true
      window.removeEventListener('deviceorientation', onOrientation)
      onInput({ x: 0, active: false })
    },
  }
}
