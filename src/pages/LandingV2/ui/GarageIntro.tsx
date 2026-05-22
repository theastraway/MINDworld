import { useEffect, useId, useRef, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { useFocusTrap } from '../util/useFocusTrap'
import { prefersReducedMotion } from '../util/prefersReducedMotion'

/**
 * The phases of the garage-opening cinematic intro (vision § 6 Beat 1).
 *
 *  - `black`    — flat black for ~0.3s while the scene loader finishes its
 *                 last few frames; nothing else is rendered yet.
 *  - `flicker`  — headlight flicker overlay pulses warm white → amber over
 *                 ~0.4s; the orbit-camera angle starts moving here too so
 *                 the very first visual the user sees as the screen brightens
 *                 is the car already rotating, not a static frame.
 *  - `orbit`    — full ~2.4s camera orbit around the car; M/I/N/D letters
 *                 are still off-screen.
 *  - `letters`  — the four wordmark letters animate in from the corners and
 *                 converge above the car (~1.2s) while the orbit continues.
 *  - `text`     — headline + subtext + button fade in (~1.5s); the orbit
 *                 slows and parks at a flattering 3/4 view.
 *  - `ready`    — everything is on screen, the button is enabled, the orbit
 *                 is paused. We wait here until the user clicks Start.
 *  - `doors`    — garage-door overlay splits open vertically (~0.6s); the
 *                 scene's intro mode releases so the car can be driven and
 *                 the camera returns to follow.
 *  - `done`     — overlay unmounts. Parent sets `showIntro=false` here.
 *
 * Total time-to-button-enabled: ~5.8 seconds (matches the § 6 ~6s target).
 */
export type GarageIntroPhase =
  | 'black'
  | 'flicker'
  | 'orbit'
  | 'letters'
  | 'text'
  | 'ready'
  | 'doors'
  | 'done'

interface GarageIntroProps {
  /**
   * Called once the user clicks "Start driving" and the door-opening
   * transition completes. Parent flips `showIntro` to false and the scene
   * releases its frozen state.
   */
  onDismiss: () => void
  /** Optional hover hook (engine.playUiHover). No-op until audio unlocks. */
  onCtaHover?: () => void
  /**
   * Fired with the elapsed milliseconds in the intro when the user
   * clicks "Start driving." C3 PostHog wires this to
   * `landingv2_intro_dismissed`. Optional — safe to omit.
   */
  onTimedDismiss?: (timeInIntroMs: number) => void
  /**
   * Drive the orbit camera. Receives an angle in radians, or `null` when
   * the orbit should be released (transition back to follow camera).
   * The scene reads this each frame to position the camera around the car.
   */
  onOrbitAngle: (angle: number | null) => void
  /**
   * Toggle "intro mode" on the scene. When true the scene freezes car
   * physics (velocity = 0) so the user can't accidentally drive while the
   * intro is playing. When false the scene returns to normal follow + drive.
   */
  onIntroMode: (active: boolean) => void
  /**
   * Gate the phase chain. When `false`, the intro stays in `black` phase
   * indefinitely — the headlight flicker, orbit, letters, and text are
   * all suppressed so the cinematic doesn't burn its first beats behind
   * the still-visible branded Loader. The parent flips this to `true`
   * once the Loader dismisses (i.e. scene.onReady has fired).
   */
  started: boolean
}

// ── Phase timing (ms) — keep in sync with the @keyframes in the JSX below. ─
const T_BLACK = 300
const T_FLICKER = 400
const T_ORBIT = 2400
const T_LETTERS = 1200
const T_TEXT = 1500
const T_DOORS = 620

/**
 * Cinematic garage-opening intro for MIND World.
 *
 * Component lifecycle (single source of truth):
 *   1. On mount: orbit + intro-mode ON. Phase chain begins at `black`.
 *   2. Phase transitions are setTimeout-chained; on every step we update
 *      both the local `phase` state (for CSS gating) and emit the
 *      appropriate side effects on the scene via the callback props.
 *   3. The orbit angle is driven in a SEPARATE rAF loop (not by the phase
 *      chain) so it animates smoothly and we can pause/resume independently
 *      of the discrete phase chain. While in `ready` and beyond, the rAF
 *      loop holds the angle fixed at the "parked" 3/4 view.
 *   4. User clicks Start → enter `doors` phase, release orbit + intro mode,
 *      and after the doors animation finishes, fire onDismiss + enter
 *      `done` (which makes this component a no-op on render).
 *
 * Robustness:
 *   - We track an `unmounted` ref so any in-flight timeouts that resolve
 *     after dispose don't poke into the parent.
 *   - The rAF loop cancels cleanly on unmount.
 *   - We only ever call `onIntroMode(false)` once (when the doors phase
 *     fires) so there's no risk of races re-freezing the car.
 */
export function GarageIntro({
  onDismiss,
  onCtaHover,
  onTimedDismiss,
  onOrbitAngle,
  onIntroMode,
  started,
}: GarageIntroProps) {
  const [phase, setPhase] = useState<GarageIntroPhase>('black')
  const phaseRef = useRef<GarageIntroPhase>('black')
  phaseRef.current = phase
  const mountTsRef = useRef<number>(Date.now())
  const containerRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const reducedMotion = prefersReducedMotion()

  // Focus trap — confines keyboard nav to the "Start driving" button (the
  // single interactive control in this overlay) so Tab doesn't escape into
  // the background canvas. The hook waits for `buttonReady` because the
  // button is `disabled` until then and getFocusable filters disabled
  // elements out; once `ready` flips the button moves into focus.
  useFocusTrap({ active: phase !== 'done', containerRef })

  // Orbit angle driven by rAF — starts at 0, animates ~0.6 rev/sec during
  // orbit + letters phases, then eases to a "parked" angle for `text`/`ready`.
  // The PARKED angle (~ -0.7 rad, i.e. ~ -40°) puts the camera slightly to
  // the front-right of the car so the M-I-N-D wordmark above + the car
  // headlights are both visible without occlusion.
  const PARKED_ANGLE = -0.7
  const rafRef = useRef<number | null>(null)
  const angleRef = useRef<number>(0)
  const startTsRef = useRef<number | null>(null)

  // ── Phase chain ────────────────────────────────────────────────────────
  // Held in `black` until `started` flips to true. This avoids burning
  // the headlight-flicker / orbit / letters beats behind the still-visible
  // branded Loader on slow-network first loads. The parent passes
  // `started = !loaderActive` so the chain kicks off the instant the
  // loader unmounts.
  useEffect(() => {
    // Freeze car + enable orbit IMMEDIATELY on mount so even before the
    // phase chain runs, the underlying scene composition is correct (car
    // at origin, orbit angle 0, no physics).
    onIntroMode(true)
    onOrbitAngle(0)
    // We deliberately don't release on this effect's cleanup — the
    // separate effect below (gated on `started`) owns the phase chain
    // and ALSO releases on its own cleanup. Releasing here would race.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!started) return
    let unmounted = false
    const timers: number[] = []

    // Reduced-motion: skip the cinematic chain entirely and jump straight
    // to `ready`. The shell normally renders ReducedMotionFallback in
    // this scenario, but defense-in-depth here means if the GarageIntro
    // is ever mounted (e.g. user toggled OS pref mid-session), the
    // experience is still usable.
    if (reducedMotion) {
      setPhase('ready')
      return () => {
        unmounted = true
        onIntroMode(false)
        onOrbitAngle(null)
      }
    }

    // Phase 1: black → flicker
    timers.push(
      window.setTimeout(() => {
        if (unmounted) return
        setPhase('flicker')
      }, T_BLACK)
    )

    // Phase 2: flicker → orbit
    timers.push(
      window.setTimeout(() => {
        if (unmounted) return
        setPhase('orbit')
      }, T_BLACK + T_FLICKER)
    )

    // Phase 3: orbit → letters (letters start flying in)
    timers.push(
      window.setTimeout(() => {
        if (unmounted) return
        setPhase('letters')
      }, T_BLACK + T_FLICKER + T_ORBIT)
    )

    // Phase 4: letters → text (orbit slows, headline appears)
    timers.push(
      window.setTimeout(() => {
        if (unmounted) return
        setPhase('text')
      }, T_BLACK + T_FLICKER + T_ORBIT + T_LETTERS)
    )

    // Phase 5: text → ready (button becomes interactive)
    timers.push(
      window.setTimeout(() => {
        if (unmounted) return
        setPhase('ready')
      }, T_BLACK + T_FLICKER + T_ORBIT + T_LETTERS + T_TEXT)
    )

    return () => {
      unmounted = true
      timers.forEach((id) => window.clearTimeout(id))
      // If the component is unmounted before the user clicks, release
      // the scene from intro mode so the page doesn't get stuck with a
      // frozen car (defensive — normal flow exits through handleStart).
      onIntroMode(false)
      onOrbitAngle(null)
    }
    // We only want this to run once when `started` transitions to true.
    // The callback props are stable references from the parent's
    // useRef-backed scene handle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started])

  // ── Orbit rAF loop ─────────────────────────────────────────────────────
  // Independent of the phase chain so the angle animates smoothly and we
  // can ease toward the parked angle without coupling timing to setState.
  useEffect(() => {
    let unmounted = false

    const tick = (ts: number) => {
      if (unmounted) return
      if (startTsRef.current == null) startTsRef.current = ts
      const elapsedMs = ts - startTsRef.current
      const ph = phaseRef.current

      // Speed varies by phase:
      //   black/flicker: hold at 0 (camera doesn't move yet)
      //   orbit: ~0.6 rev/sec ≈ 3.77 rad/sec
      //   letters: ~0.45 rev/sec (slowing)
      //   text/ready: ease toward PARKED_ANGLE
      //   doors+: orbit released by phase chain → loop exits soon
      const dtMs = 16.667 // approximate per-frame delta — fine for this short loop
      if (ph === 'orbit') {
        angleRef.current += (3.77 / 1000) * dtMs
      } else if (ph === 'letters') {
        angleRef.current += (2.83 / 1000) * dtMs
      } else if (ph === 'text' || ph === 'ready') {
        // Ease toward parked angle. We wrap angleRef into [-π, π] so the
        // lerp doesn't take the long way around the circle.
        const TAU = Math.PI * 2
        let a = ((angleRef.current % TAU) + TAU) % TAU
        if (a > Math.PI) a -= TAU
        const target = PARKED_ANGLE
        angleRef.current = a + (target - a) * 0.05
      }

      // Emit to the scene. While in `doors` and beyond we stop emitting —
      // the door click handler already released the orbit (onOrbitAngle(null)).
      if (ph !== 'doors' && ph !== 'done') {
        onOrbitAngle(angleRef.current)
      }

      // Suppress unused-variable lint without changing behavior.
      void elapsedMs

      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      unmounted = true
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Click handler ──────────────────────────────────────────────────────
  const handleStart = () => {
    if (phase !== 'ready') return
    setPhase('doors')
    // Analytics: fire elapsed-ms callback once the user clicks Start.
    onTimedDismiss?.(Date.now() - mountTsRef.current)
    // Release the scene from intro mode so the car can drive again. We
    // also release the orbit camera so the next frame already shows the
    // follow camera (the door overlay covers the visual swap).
    onIntroMode(false)
    onOrbitAngle(null)
    window.setTimeout(() => {
      setPhase('done')
      onDismiss()
    }, T_DOORS)
  }

  if (phase === 'done') return null

  // ── Render ─────────────────────────────────────────────────────────────
  // The overlay is mounted from the very first paint and has 4 stacked
  // sub-layers that fade in/out based on phase:
  //   1. Black backdrop — always present, fully opaque until `flicker`
  //   2. Headlight flicker spotlight — opacity ramps with the headlight
  //      animation; fades out by start of `letters`
  //   3. M-I-N-D letters flying in from the corners
  //   4. Headline + subtext + Start button
  //   5. Garage door overlay — appears during `doors`, splits open

  const showFlicker = phase === 'flicker' || phase === 'orbit' || phase === 'letters'
  const showLetters = phase === 'letters' || phase === 'text' || phase === 'ready'
  const showText = phase === 'text' || phase === 'ready'
  const buttonReady = phase === 'ready'
  const showDoors = phase === 'doors'

  // Black backdrop opacity:
  //   - Solid black during `black` + `flicker`
  //   - Fades to 0.65 by `orbit`/`letters`/`text`/`ready` so the scene is
  //     visible underneath but the UI stays legible.
  //   - Doors phase: drop the backdrop entirely so the door split is on
  //     clear scene (more cinematic).
  let backdropOpacity = 0.65
  if (phase === 'black' || phase === 'flicker') backdropOpacity = 1
  else if (phase === 'doors') backdropOpacity = 0

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-30 pointer-events-none select-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      {/* Layer 1 — Black backdrop */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black transition-opacity duration-[1200ms] ease-out"
        style={{ opacity: backdropOpacity }}
      />

      {/* Layer 2 — Headlight flicker (warm white → amber spotlight overlay) */}
      <div
        className="absolute inset-0 transition-opacity duration-[420ms]"
        style={{
          opacity: showFlicker ? 1 : 0,
          background:
            'radial-gradient(ellipse 55% 38% at 50% 60%, rgba(255,235,180,0.55), rgba(255,180,80,0.15) 60%, transparent 80%)',
          mixBlendMode: 'screen',
          animation: showFlicker ? 'mind-world-flicker 0.42s ease-out 1' : 'none',
        }}
      />

      {/* Layer 3 — M-I-N-D letters flying in from the four corners */}
      {showLetters && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          aria-hidden="true"
        >
          <div className="relative w-[min(90vw,520px)] -mt-[14vh] text-center">
            <div className="flex items-center justify-center gap-2 sm:gap-3 select-none">
              {[
                { letter: 'M', from: 'tl' as const, delay: 0 },
                { letter: 'I', from: 'tr' as const, delay: 120 },
                { letter: 'N', from: 'bl' as const, delay: 240 },
                { letter: 'D', from: 'br' as const, delay: 360 },
              ].map(({ letter, from, delay }) => {
                // Per-corner initial offset (in vw/vh) so each letter flies
                // in from its own corner of the viewport.
                const startTransform =
                  from === 'tl'
                    ? 'translate(-60vw, -55vh) scale(1.4)'
                    : from === 'tr'
                      ? 'translate(60vw, -55vh) scale(1.4)'
                      : from === 'bl'
                        ? 'translate(-60vw, 55vh) scale(1.4)'
                        : 'translate(60vw, 55vh) scale(1.4)'
                return (
                  <span
                    key={letter}
                    className="text-[clamp(48px,12vw,128px)] font-extrabold tracking-tight text-[#F8ECDC] drop-shadow-[0_6px_24px_rgba(244,63,63,0.5)]"
                    style={{
                      // CSS animation handles the fly-in; we set the
                      // starting offset via inline style and let the
                      // @keyframes pull each letter to translate(0,0).
                      animation: `mind-world-letter-in 0.9s cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms both`,
                      ['--mind-letter-from' as string]: startTransform,
                    }}
                  >
                    {letter}
                  </span>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Layer 4 — Headline + subtext + Start button */}
      <div
        className="absolute inset-0 flex items-end justify-center px-5 pb-[18vh] sm:pb-[14vh] transition-opacity duration-700 ease-out"
        style={{ opacity: showText ? 1 : 0 }}
      >
        <div className="max-w-md text-center pointer-events-auto">
          <h1
            id={titleId}
            className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#F8ECDC] drop-shadow-[0_4px_18px_rgba(0,0,0,0.6)]"
          >
            Drive your <span className="text-[#F43F3F]">MIND</span>.
          </h1>
          <p className="text-sm sm:text-base text-[#F8ECDC]/90 mt-3 leading-relaxed drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
            Eight monuments. Every capability.
          </p>
          <button
            type="button"
            onClick={handleStart}
            onMouseEnter={onCtaHover}
            disabled={!buttonReady}
            aria-label="Start driving the MIND world"
            className="mt-6 inline-flex items-center gap-2 bg-[#F43F3F] hover:bg-[#F43F3F]/90 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-bold px-6 py-3 rounded-full transition-colors uppercase tracking-wider justify-center shadow-[0_4px_24px_rgba(244,63,63,0.45)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFCC4D] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            Start driving <ArrowRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Layer 5 — Garage doors splitting open (vertical bars sliding L/R) */}
      {showDoors && (
        <>
          <div
            className="absolute inset-y-0 left-0 w-1/2 bg-black"
            style={{
              animation: `mind-world-door-left ${T_DOORS}ms cubic-bezier(0.65, 0, 0.35, 1) forwards`,
            }}
            aria-hidden="true"
          />
          <div
            className="absolute inset-y-0 right-0 w-1/2 bg-black"
            style={{
              animation: `mind-world-door-right ${T_DOORS}ms cubic-bezier(0.65, 0, 0.35, 1) forwards`,
            }}
            aria-hidden="true"
          />
        </>
      )}

      {/* Keyframes — scoped via a style tag because we need dynamic
          per-letter starting transforms via CSS variables. */}
      <style>{`
        @keyframes mind-world-flicker {
          0%   { opacity: 0; }
          18%  { opacity: 1; }
          26%  { opacity: 0.3; }
          38%  { opacity: 0.95; }
          54%  { opacity: 0.45; }
          70%  { opacity: 1; }
          100% { opacity: 1; }
        }
        @keyframes mind-world-letter-in {
          0%   { transform: var(--mind-letter-from); opacity: 0; }
          60%  { opacity: 1; }
          100% { transform: translate(0, 0) scale(1); opacity: 1; }
        }
        @keyframes mind-world-door-left {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-105%); }
        }
        @keyframes mind-world-door-right {
          0%   { transform: translateX(0); }
          100% { transform: translateX(105%); }
        }
      `}</style>
    </div>
  )
}
