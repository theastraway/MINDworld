// WASD / Arrow / Shift / Space / Escape keyboard handling for the LandingV2 car.
//
// Returns a `keys` object the animation loop reads each frame, plus a
// `detach` cleaner. `onEscape` is invoked on every Escape press so the
// React shell can close the active monument card.
//
// `drift` is held while Space is down. Space-as-drift is intentional even
// though Space is the browser default for "scroll down" — preventDefault
// is applied on the keydown so the world doesn't scroll behind the
// canvas while drifting.
//
// ── Wave 3 / C6 additions (vision § 13 easter eggs) ─────────────────────
//
// H — Hold-to-honk. On keydown: fires `onHornDown` (engine ramps in the
// procedural horn tone). On keyup: fires `onHornUp` (horn ramps out).
// If H is held continuously for ≥5 seconds, fires `onHornHoldFire` ONCE
// per hold so the SceneRoot can detonate the fireworks burst. The timer
// resets on keyup.
//
// T — Time-of-day cycle stub. Fires `onTimeCycle` on each press. D1
// (Wave 4) will implement the actual dawn/day/dusk/night palette interp;
// C6 just wires the key so the input contract exists when D1 lands.
//
// Konami code — ↑↑↓↓←→←→BA. Tracks the last 10 keys pressed in a small
// ring buffer; on full sequence match fires `onKonami` ONCE per session
// (the SceneRoot tracks the per-session flag — the keyboard layer can
// fire multiple times; the consumer guards).
//
// ── Input-field guard ──────────────────────────────────────────────────
//
// All shortcut keys (including Konami, T, H) are ignored when the user
// has an INPUT, TEXTAREA, or contentEditable element focused — so a
// hypothetical email signup form can't accidentally swallow the user's
// keystrokes as world commands. Movement keys (WASD/arrows/space/shift)
// ARE still ignored when focused on input fields too, since the world
// shouldn't steer while the user is typing.

export interface KeyboardState {
  w: boolean
  a: boolean
  s: boolean
  d: boolean
  shift: boolean
  /** Held while Space is down. Read by the scene loop and forwarded to physics. */
  drift: boolean
}

export interface KeyboardOptions {
  onEscape: () => void
  onShiftDown: () => void
  onShiftUp: () => void
  /** Optional — fires when the user matches the Konami code. May fire multiple times; consumer dedupes. */
  onKonami?: () => void
  /** Optional — fires on H keydown. Consumer ramps in the horn tone. */
  onHornDown?: () => void
  /** Optional — fires on H keyup. Consumer ramps out the horn tone. */
  onHornUp?: () => void
  /** Optional — fires ONCE per H hold when the hold reaches HORN_HOLD_FIRE_MS. */
  onHornHoldFire?: () => void
  /** Optional — fires on each T keypress. Wave 4 / D1 implements the actual cycle. */
  onTimeCycle?: () => void
}

export interface KeyboardHandle {
  keys: KeyboardState
  detach: () => void
}

// Konami sequence — lowercase key.toLowerCase() values for each press.
// Arrow keys read as 'arrowup', 'arrowdown', etc. The B/A pair at the
// end can be uppercase or lowercase; we normalize via .toLowerCase().
const KONAMI_SEQUENCE: ReadonlyArray<string> = [
  'arrowup',
  'arrowup',
  'arrowdown',
  'arrowdown',
  'arrowleft',
  'arrowright',
  'arrowleft',
  'arrowright',
  'b',
  'a',
]

// Hold duration before the horn-fireworks burst fires.
const HORN_HOLD_FIRE_MS = 5000

function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  return false
}

export function attachKeyboardControls(opts: KeyboardOptions): KeyboardHandle {
  const keys: KeyboardState = { w: false, a: false, s: false, d: false, shift: false, drift: false }

  // Konami ring buffer — tracks the last 10 normalized key presses.
  const konamiBuffer: string[] = []

  // Horn-hold state.
  let hornDown = false
  let hornHoldTimer: number | null = null
  let hornHoldFired = false

  const clearHornHoldTimer = () => {
    if (hornHoldTimer !== null) {
      window.clearTimeout(hornHoldTimer)
      hornHoldTimer = null
    }
  }

  const pushKonami = (key: string) => {
    konamiBuffer.push(key)
    // Keep only the last KONAMI_SEQUENCE.length entries.
    if (konamiBuffer.length > KONAMI_SEQUENCE.length) {
      konamiBuffer.splice(0, konamiBuffer.length - KONAMI_SEQUENCE.length)
    }
    if (konamiBuffer.length === KONAMI_SEQUENCE.length) {
      let match = true
      for (let i = 0; i < KONAMI_SEQUENCE.length; i++) {
        if (konamiBuffer[i] !== KONAMI_SEQUENCE[i]) {
          match = false
          break
        }
      }
      if (match) {
        // Reset the buffer so a single sequence doesn't fire repeatedly
        // on subsequent unrelated keypresses (the next match needs a
        // fresh full sequence). Consumer also dedupes via its own flag.
        konamiBuffer.length = 0
        opts.onKonami?.()
      }
    }
  }

  const onKeyDown = (e: KeyboardEvent) => {
    // Don't hijack typing.
    if (isTypingTarget(e.target)) return

    const k = e.key.toLowerCase()

    // Konami tracking — push EVERY non-modifier keypress (modifiers like
    // Shift on their own should not advance the buffer). e.repeat fires
    // on held keys; we ignore repeats so holding ↑ doesn't satisfy the
    // first two slots in one press.
    if (!e.repeat && k !== 'shift' && k !== 'control' && k !== 'alt' && k !== 'meta') {
      pushKonami(k)
    }

    switch (k) {
      case 'w': case 'arrowup':    keys.w = true; break
      case 's': case 'arrowdown':  keys.s = true; break
      case 'a': case 'arrowleft':  keys.a = true; break
      case 'd': case 'arrowright': keys.d = true; break
      case 'shift': keys.shift = true; opts.onShiftDown(); break
      case ' ':
      case 'spacebar':
        keys.drift = true
        e.preventDefault() // stop the page from scrolling under the canvas
        break
      case 'escape': opts.onEscape(); break
      case 'h': {
        // Hold-to-honk + fireworks-on-5s. Ignore repeats so the timer
        // only arms on the initial keydown.
        if (e.repeat) break
        if (hornDown) break
        hornDown = true
        hornHoldFired = false
        opts.onHornDown?.()
        clearHornHoldTimer()
        hornHoldTimer = window.setTimeout(() => {
          // Only fire if the user is still holding — defensive against
          // the (rare) case where keyup never fired (window blur etc.).
          if (hornDown && !hornHoldFired) {
            hornHoldFired = true
            opts.onHornHoldFire?.()
          }
        }, HORN_HOLD_FIRE_MS)
        break
      }
      case 't': {
        if (e.repeat) break
        opts.onTimeCycle?.()
        break
      }
    }
  }

  const onKeyUp = (e: KeyboardEvent) => {
    // Don't hijack typing. (Movement keyup is still fine to ignore since
    // a typing-focused user wouldn't have triggered the keydown either.)
    if (isTypingTarget(e.target)) return

    switch (e.key.toLowerCase()) {
      case 'w': case 'arrowup':    keys.w = false; break
      case 's': case 'arrowdown':  keys.s = false; break
      case 'a': case 'arrowleft':  keys.a = false; break
      case 'd': case 'arrowright': keys.d = false; break
      case 'shift': keys.shift = false; opts.onShiftUp(); break
      case ' ':
      case 'spacebar':
        keys.drift = false
        e.preventDefault()
        break
      case 'h': {
        if (!hornDown) break
        hornDown = false
        clearHornHoldTimer()
        opts.onHornUp?.()
        break
      }
    }
  }

  // Window-blur safety: if the user alt-tabs while holding H, we never
  // get the keyup. Treat blur as a force-release so the horn doesn't
  // get stuck on and the fireworks timer is cancelled.
  const onBlur = () => {
    if (hornDown) {
      hornDown = false
      clearHornHoldTimer()
      opts.onHornUp?.()
    }
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)

  return {
    keys,
    detach: () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      clearHornHoldTimer()
    },
  }
}
