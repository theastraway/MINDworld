// Mobile touch joystick. Attaches passive-false touch handlers to the
// joystick base element so we can preventDefault scroll, drives the inner
// stick via CSS transform, and exposes a normalized (x, y) input + active
// flag the animation loop reads each frame.
//
// Coordinate convention:
//   joystick y → forward (positive y = backward, so the consumer typically
//   maps `forward = -input.y`)
//   joystick x → turn   (consumer maps `turn = -input.x`)
//
// Drift on mobile: triggered by a SECOND simultaneous touch ANYWHERE on
// the document while the joystick is active. This mirrors how arcade
// games map handbrake to "second finger down."
//
// Wave-3 / C5 additions:
//  - Deadzone (DEADZONE_R): inputs with |magnitude| ≤ 0.15 are zeroed out
//    so a resting finger doesn't slowly drift the car.
//  - Active-grow visual: when |input| > deadzone, the stick scales 1.1×.
//    Done via CSS transform composition so it doesn't fight the translate.
//  - Trail: last 6 stick positions stored on the handle. The shell reads
//    these each frame and renders fading dots behind the stick. Pure
//    geometry — no rendering inside this module.
//  - Pan input: while the first touch drives the joystick, a SECOND
//    finger's horizontal screen-delta is exposed as `panInput.dx`. The
//    scene uses this to orbit the follow-camera around the car. Lets
//    mobile users "look around" without leaving the joystick.

export interface JoystickInput {
  active: boolean
  x: number
  y: number
  /** True while a second touch is down concurrent with the joystick. */
  drift: boolean
}

/**
 * Per-frame camera pan delta sourced from a second simultaneous touch.
 * `dx` is the pixel delta on screen X since the previous frame read.
 * The scene reads + ZEROES this each frame; the joystick accumulates
 * between reads. `active` flips true on second-touch-down, false on lift.
 */
export interface JoystickPanInput {
  active: boolean
  /** Pixel delta on X since the last `consume()`. Zero when idle. */
  dx: number
}

export interface JoystickOptions {
  baseEl: HTMLDivElement
  stickEl: HTMLDivElement
}

export interface JoystickHandle {
  /** Live, mutated each touch event. Read each frame; do not mutate. */
  input: JoystickInput
  /**
   * Last N (typed below) stick screen-offset positions in pixel units.
   * Newest first. Length 0..TRAIL_LEN. The shell renders these as a
   * fading trail. Mutated whenever the stick moves.
   */
  trail: { x: number; y: number; t: number }[]
  /**
   * Read-and-clear camera-pan delta. The scene's animation loop calls
   * `consumePan()` once per frame; the returned `{active, dx}` reflects
   * accumulated motion since the last consume.
   */
  consumePan: () => JoystickPanInput
  detach: () => void
}

/** Joystick deadzone radius in normalized units. */
export const JOYSTICK_DEADZONE = 0.15
/** Max trail samples retained for the visual fading-dot effect. */
export const TRAIL_LEN = 6

export function attachJoystick({ baseEl, stickEl }: JoystickOptions): JoystickHandle {
  const radius = 50
  const input: JoystickInput = { active: false, x: 0, y: 0, drift: false }
  const trail: { x: number; y: number; t: number }[] = []

  // ── Second-finger pan state ──────────────────────────────────────
  // We capture the identifier of the second touch that lands while the
  // joystick is active and follow it specifically (rather than always
  // reading `touches[1]`, which can shuffle if any earlier touch lifts).
  // `panDxPending` accumulates pixel deltas between `consumePan()` calls.
  let panTouchId: number | null = null
  let panLastX: number | null = null
  let panDxPending = 0

  const consumePan = (): JoystickPanInput => {
    const out: JoystickPanInput = { active: panTouchId !== null, dx: panDxPending }
    panDxPending = 0
    return out
  }

  const updateStickVisual = (dx: number, dy: number) => {
    // Compose translate + scale on the inner stick. The grow is a small
    // tactile signal that the input has crossed the deadzone.
    const mag = Math.hypot(dx, dy) / radius
    const scale = mag > JOYSTICK_DEADZONE ? 1.1 : 1.0
    stickEl.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`
  }

  const pushTrail = (dx: number, dy: number) => {
    const now = performance.now()
    trail.unshift({ x: dx, y: dy, t: now })
    if (trail.length > TRAIL_LEN) trail.length = TRAIL_LEN
  }

  const applyDeadzone = (xNorm: number, yNorm: number): { x: number; y: number } => {
    const mag = Math.hypot(xNorm, yNorm)
    if (mag <= JOYSTICK_DEADZONE) return { x: 0, y: 0 }
    // Rescale so values just outside the deadzone start near zero and ramp
    // to 1 at the rim — keeps the full output range smooth instead of
    // snapping from 0 → 0.15.
    const scaled = (mag - JOYSTICK_DEADZONE) / (1 - JOYSTICK_DEADZONE)
    const k = scaled / mag
    return { x: xNorm * k, y: yNorm * k }
  }

  const onStart = (e: TouchEvent) => {
    e.preventDefault()
    input.active = true
  }
  const onMove = (e: TouchEvent) => {
    if (!input.active) return
    e.preventDefault()
    const touch = e.touches[0]
    const r = baseEl.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    let dx = touch.clientX - cx
    let dy = touch.clientY - cy
    const dist = Math.hypot(dx, dy)
    if (dist > radius) {
      dx = (dx / dist) * radius
      dy = (dy / dist) * radius
    }
    const norm = applyDeadzone(dx / radius, dy / radius)
    input.x = norm.x
    input.y = norm.y
    updateStickVisual(dx, dy)
    pushTrail(dx, dy)
  }
  const onEnd = (e: TouchEvent) => {
    e.preventDefault()
    input.active = false
    input.x = 0
    input.y = 0
    stickEl.style.transform = 'translate(0px, 0px) scale(1)'
    trail.length = 0
    // Pan teardown — if the user lifts the primary touch, also drop pan.
    panTouchId = null
    panLastX = null
    panDxPending = 0
  }

  baseEl.addEventListener('touchstart', onStart, { passive: false })
  baseEl.addEventListener('touchmove', onMove, { passive: false })
  baseEl.addEventListener('touchend', onEnd, { passive: false })
  baseEl.addEventListener('touchcancel', onEnd, { passive: false })

  // Document-level touch monitor. Drives two independent behaviors:
  //   1. drift (handbrake) — true whenever ≥2 touches exist while the
  //      joystick is active.
  //   2. pan (look-around) — first non-joystick touch becomes the pan
  //      finger; its X delta accumulates until consumed.
  //
  // We treat the joystick's first finger as `touches[0]` (the joystick's
  // own listeners track that one). The "second" finger is the first
  // touch in `e.touches` whose identifier doesn't equal the active
  // joystick touch — i.e. anything not in the joystick base. For pan we
  // just take the first touch identifier that arrives after the first.
  const onDocTouchStart = (e: TouchEvent) => {
    if (!input.active) {
      input.drift = false
      panTouchId = null
      panLastX = null
      return
    }
    input.drift = e.touches.length >= 2
    // Pick the first newly-arrived touch as the pan finger (skip the
    // joystick's primary touches[0]).
    if (panTouchId === null) {
      for (let i = 0; i < e.touches.length; i++) {
        const t = e.touches[i]
        // Heuristic: skip touches that originated inside the joystick base
        // rect — those belong to the steering finger. Anything else can
        // drive the pan.
        const rect = baseEl.getBoundingClientRect()
        const insideBase =
          t.clientX >= rect.left &&
          t.clientX <= rect.right &&
          t.clientY >= rect.top &&
          t.clientY <= rect.bottom
        if (!insideBase) {
          panTouchId = t.identifier
          panLastX = t.clientX
          break
        }
      }
    }
  }
  const onDocTouchMove = (e: TouchEvent) => {
    if (!input.active) return
    input.drift = e.touches.length >= 2
    if (panTouchId === null) return
    // Find the tracked pan finger by identifier; bail if it lifted off.
    for (let i = 0; i < e.touches.length; i++) {
      const t = e.touches[i]
      if (t.identifier === panTouchId) {
        if (panLastX !== null) {
          panDxPending += t.clientX - panLastX
        }
        panLastX = t.clientX
        return
      }
    }
    // Tracked touch not in the list — it ended.
    panTouchId = null
    panLastX = null
  }
  const onDocTouchEnd = (e: TouchEvent) => {
    if (!input.active) {
      input.drift = false
      panTouchId = null
      panLastX = null
      return
    }
    input.drift = e.touches.length >= 2
    // If our pan touch lifted, clear it. Any remaining non-base touch
    // can become the new pan touch on the next start event.
    if (panTouchId !== null) {
      let stillThere = false
      for (let i = 0; i < e.touches.length; i++) {
        if (e.touches[i].identifier === panTouchId) {
          stillThere = true
          break
        }
      }
      if (!stillThere) {
        panTouchId = null
        panLastX = null
      }
    }
  }
  document.addEventListener('touchstart', onDocTouchStart, { passive: true })
  document.addEventListener('touchmove', onDocTouchMove, { passive: true })
  document.addEventListener('touchend', onDocTouchEnd, { passive: true })
  document.addEventListener('touchcancel', onDocTouchEnd, { passive: true })

  return {
    input,
    trail,
    consumePan,
    detach: () => {
      baseEl.removeEventListener('touchstart', onStart)
      baseEl.removeEventListener('touchmove', onMove)
      baseEl.removeEventListener('touchend', onEnd)
      baseEl.removeEventListener('touchcancel', onEnd)
      document.removeEventListener('touchstart', onDocTouchStart)
      document.removeEventListener('touchmove', onDocTouchMove)
      document.removeEventListener('touchend', onDocTouchEnd)
      document.removeEventListener('touchcancel', onDocTouchEnd)
    },
  }
}
