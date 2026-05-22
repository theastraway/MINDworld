import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

import type { Monument } from './districts/types'
import { MONUMENTS, HIDDEN_DISTRICTS, DISTRICTS } from './districts/data'
import { createScene, type SceneHandle, type SceneInput } from './scene/SceneRoot'
import { attachKeyboardControls, type KeyboardHandle } from './controls/Keyboard'
import { attachJoystick, type JoystickHandle } from './controls/Joystick'
import { attachGyro, isGyroSupported, requestGyroPermission, type GyroHandle } from './controls/Gyro'
import { GarageIntro } from './ui/GarageIntro'
import { Summit } from './ui/Summit'
import { DiscoveryCounter } from './ui/DiscoveryCounter'
import { MonumentCard } from './ui/MonumentCard'
import { Controls } from './ui/Controls'
import { MuteButton } from './ui/MuteButton'
import { ShareButton } from './ui/ShareButton'
import { WebGLFallback } from './ui/WebGLFallback'
import { Meta } from './seo/Meta'
import { SkinPicker } from './ui/SkinPicker'
import { Loader } from './ui/Loader'
import { ReducedMotionFallback } from './ui/ReducedMotionFallback'
import { lv2 } from './analytics/events'
import { GyroToggle } from './ui/GyroToggle'
import { JoystickTrail } from './ui/JoystickTrail'
import { haptic, HAPTIC_DISCOVER, HAPTIC_EASTER_EGG } from './util/haptics'
import { EmailNudge, isEmailNudgeSuppressed } from './ui/EmailNudge'
import { EasterEggCard } from './ui/EasterEggCard'
import { unlockSkin, setCurrentSkin } from './car/Skins'
import { trackEvent } from '@/lib/analytics'
import { CYCLE_ORDER, PHASE_LABEL, type TimeOfDay } from './scene/SkyPalettes'

/**
 * LandingV2 — drive-around MIND world. Loop 1 visual overhaul.
 *
 * Reference: Bruno Simon's portfolio (Awwwards 2026 SOTM). What Bruno did:
 *  - bright/colorful low-poly world, not "dark void with boxes"
 *  - explicit road network connecting zones
 *  - sculptural objects with personality per zone, not generic pillars
 *  - particle dust from the wheels
 *  - lego-style car with proper proportions
 *  - sky gradient atmosphere
 *
 * This file is the React shell only. It owns page-level state (the active
 * monument, intro/controls visibility, discovery set, WebGL error, mute,
 * mobile detection), wires up keyboard + joystick input sources, and boots
 * the Three.js scene module which runs the render loop. All geometry,
 * physics, particles, and audio live in `./scene/`, `./car/`, and
 * `./audio/`.
 *
 * Wave-1 A2 additions (§ 9, § 10 of MIND_WORLD_VISION):
 *  - Branded `Loader` shown while the scene boots / textures load. Real
 *    asset progress wired through `THREE.LoadingManager` inside SceneRoot.
 *  - `prefers-reduced-motion` short-circuit — renders `ReducedMotionFallback`
 *    instead of the 3D scene when the OS preference is set.
 *  - `WebGLFallback` upgraded to render the full 8-district narrative
 *    (same component, `reason="webgl"`).
 */
export default function LandingV2() {
  const navigate = useNavigate()
  const mountRef = useRef<HTMLDivElement>(null)
  const [activeMonument, setActiveMonument] = useState<Monument | null>(null)
  const [showIntro, setShowIntro] = useState(true)
  const [showControls, setShowControls] = useState(true)
  // Mirror of boost ref into React state so we can animate a cinematic
  // screen vignette during Shift-held boost without polling the ref
  // from outside the animation loop. Updated by the same keydown/up
  // handlers that flip boostRef.
  const [boostActive, setBoostActive] = useState(false)
  // Discovery state persists across page reloads via localStorage so
  // returning visitors see their progress preserved (visited labels stay
  // greyed, summit condition fires correctly, idle hint skips known
  // districts). Initializer reads once at mount; the persistence effect
  // below writes on every change. Wrapped in try/catch — Safari private
  // mode + storage-disabled browsers degrade to in-memory state silently.
  const DISCOVERED_STORAGE_KEY = 'mind-world-discovered:v1'
  const [discovered, setDiscovered] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(DISCOVERED_STORAGE_KEY)
      if (!raw) return new Set()
      const arr = JSON.parse(raw) as unknown
      if (!Array.isArray(arr)) return new Set()
      return new Set(arr.filter((x): x is string => typeof x === 'string'))
    } catch {
      return new Set()
    }
  })
  const [webglError, setWebglError] = useState<string | null>(null)
  const [muted, setMuted] = useState(true)

  // ── Easter eggs (Wave 3 / C6 + Wave 4 / D4 — vision § 13) ───────────
  type EggKey =
    | 'achilles'
    | 'konami'
    | 'founder_stone'
    | 'horn_fireworks'
    | 'mindsense_sanctuary'
  const [activeEgg, setActiveEgg] = useState<{
    key: EggKey
    title: string
    subtitle?: string
  } | null>(null)
  const [eggVisible, setEggVisible] = useState(false)
  const [foundEggs, setFoundEggs] = useState<Set<EggKey>>(new Set())

  // ── Summit cinematic state (vision § 6 Beat 3 / Wave 3 C2) ──────────
  // Flips true once all 8 MAIN districts (not the hidden Sanctuary) are
  // discovered. Mounts Summit overlay + transitions scene to drone mode
  // + fires fanfare. "Drive more" unlocks Founder skin + clears flag.
  const [summitReached, setSummitReached] = useState(false)
  const mainKeys = useMemo<Set<string>>(
    () => new Set(MONUMENTS.map((m) => m.key)),
    []
  )

  // ── Accessibility: prefers-reduced-motion ───────────────────────────
  // Evaluated synchronously at mount via `useState` initializer so the
  // very first render already knows which path to render — no flash of
  // the 3D scene before the static fallback swaps in.
  const [reducedMotion, setReducedMotion] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false
    }
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  // Keep `reducedMotion` in sync if the user toggles their OS-level
  // Persist discoveries on every change so reloads + returning visits
  // restore progress. Stored as a JSON array of district keys.
  useEffect(() => {
    try {
      localStorage.setItem(
        DISCOVERED_STORAGE_KEY,
        JSON.stringify(Array.from(discovered)),
      )
    } catch {
      // Storage disabled (private mode, quota) — in-memory state still works.
    }
  }, [discovered])

  // preference while the page is open. Most users won't, but the spec
  // emits the change and respecting it is cheap.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    }
    // Safari < 14 fallback
    mq.addListener(onChange)
    return () => mq.removeListener(onChange)
  }, [])

  // ── Loader state ───────────────────────────────────────────────────
  // `loaderActive` controls whether the branded loader is mounted at all.
  // `loaderDismissing` triggers the fade-out transition (the loader stays
  // mounted for ~420ms after dismissing so the opacity transition can
  // play, then we unmount).
  const [loaderActive, setLoaderActive] = useState(true)
  const [loaderDismissing, setLoaderDismissing] = useState(false)
  const [loadProgress, setLoadProgress] = useState<number | undefined>(undefined)

  // Touch / mobile controls
  const joystickRef = useRef<HTMLDivElement>(null)
  const joystickStickRef = useRef<HTMLDivElement>(null)
  const [isMobile, setIsMobile] = useState(false)

  // Cross-channel handles to the scene + control attachments. Refs because
  // the animation loop and event listeners need stable identity across
  // React renders.
  const sceneRef = useRef<SceneHandle | null>(null)
  const keyboardRef = useRef<KeyboardHandle | null>(null)
  const joystickHandleRef = useRef<JoystickHandle | null>(null)
  const boostRef = useRef(false)

  // ── Time-of-day cycle (Wave 4 / D1 — vision § 13 egg 5) ────────────────
  // Tracked as a ref so T-key callbacks (which are bound once at mount
  // inside the scene-boot effect) can advance the phase without going
  // stale on re-renders. The cycle order is canonical:
  // dusk → night → dawn → day → dusk → … Default mounted phase = dusk to
  // preserve the current production look.
  const todRef = useRef<TimeOfDay>('dusk')

  // ── Wave-3 / C5 mobile additions ──────────────────────────────────
  // Gyro tilt-to-steer state. `gyroActive` flips on toggle; the listener
  // writes the current normalized steering input to `gyroInputRef`,
  // which `getInput()` reads each frame. Two separate references so React
  // re-renders the toggle UI without thrashing the animation loop.
  const [gyroSupported, setGyroSupported] = useState<boolean>(false)
  const [gyroActive, setGyroActive] = useState<boolean>(false)
  const gyroInputRef = useRef<{ x: number; active: boolean }>({ x: 0, active: false })
  const gyroHandleRef = useRef<GyroHandle | null>(null)

  // ── Soft-conversion nudge (C4, vision § 8) ─────────────────────────
  // Counts monument discoveries — at the 3rd, schedules a 30s timer to
  // surface the dismissible email-capture banner. Suppressed entirely
  // once the user has either dismissed or subscribed on this browser
  // (see `isEmailNudgeSuppressed`).
  const discoveryCountRef = useRef(0)
  const nudgeScheduledRef = useRef(false)
  const nudgeTimerRef = useRef<number | null>(null)
  const [showEmailNudge, setShowEmailNudge] = useState(false)

  useEffect(() => {
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth < 768)
    setGyroSupported(isGyroSupported())
  }, [])

  // ── Analytics: landingv2_loaded ────────────────────────────────────
  // Fires exactly once per mount with device class, viewport, WebGL
  // support probe, reduced-motion preference, and referrer. The probe
  // mirrors the WebGL check in the scene-boot effect but runs eagerly —
  // we want to report `webgl_supported: false` even when the user has
  // reduced-motion on (in which case the scene boot is skipped).
  const landedFiredRef = useRef(false)
  useEffect(() => {
    if (landedFiredRef.current) return
    if (typeof window === 'undefined') return
    landedFiredRef.current = true

    let webglSupported = false
    try {
      const probe = document.createElement('canvas')
      const ctx =
        probe.getContext('webgl2') ||
        probe.getContext('webgl') ||
        (probe as HTMLCanvasElement).getContext('experimental-webgl' as never)
      webglSupported = !!ctx
    } catch {
      webglSupported = false
    }

    const device: 'mobile' | 'desktop' =
      /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth < 768
        ? 'mobile'
        : 'desktop'

    lv2.landed({
      device,
      viewport_w: window.innerWidth,
      viewport_h: window.innerHeight,
      webgl_supported: webglSupported,
      reduced_motion: reducedMotion,
      // Document referrer can contain query params, but never PII per
      // standard browser policy. We pass it through unchanged so the
      // attribution funnel can credit the right inbound channel.
      referrer: typeof document !== 'undefined' ? document.referrer : '',
    })
  }, [reducedMotion])

  // ── Analytics: time-in-world milestones ────────────────────────────
  // Four setTimeouts armed at mount. Each fires its event once per tab
  // (the events.ts `trackOnce` helper handles dedupe). Cleared on unmount
  // so a fast Vite HMR cycle doesn't double-fire.
  useEffect(() => {
    const timers: number[] = []
    const fire = (s: 30 | 60 | 300 | 600) => lv2.timeInWorld(s)
    timers.push(window.setTimeout(() => fire(30), 30_000))
    timers.push(window.setTimeout(() => fire(60), 60_000))
    timers.push(window.setTimeout(() => fire(300), 300_000))
    timers.push(window.setTimeout(() => fire(600), 600_000))
    return () => {
      timers.forEach((id) => window.clearTimeout(id))
    }
  }, [])

  // Running discovery order — used both for the discoveryOrder property
  // on `monument_discovered:*` (1-based index) and for the payload of
  // `summit_reached` once C1+C2 ships <Summit />. Tracked as a ref so
  // we don't churn the render whenever a monument is hit.
  const discoveryOrderRef = useRef<string[]>([])

  // ── Easter egg discovery helper ─────────────────────────────────
  // Centralises the "fire once" + analytics + UI toast pattern so each
  // of the 5 C6 eggs goes through the same path:
  //   1. Bail if already found this session (idempotent).
  //   2. Record in `foundEggs` so DiscoveryCounter can render the
  //      "✨ all eggs found" badge once the user collects all 5.
  //   3. Push the title/subtitle into `activeEgg` + flip visibility on,
  //      which mounts the EasterEggCard. The card auto-dismisses after
  //      3s, and our onDismiss handler flips `eggVisible` to false to
  //      play the slide-out animation.
  //   4. Play the sparkle SFX (engine no-ops if audio context isn't
  //      ready yet — safe on phones that haven't unlocked audio).
  //   5. Fire a `landingv2_easter_egg_found` PostHog event so Anthony
  //      can see egg discovery rate alongside district discovery.
  const showEasterEgg = useCallback(
    (key: EggKey, title: string, subtitle?: string) => {
      let alreadyFound = false
      setFoundEggs((prev) => {
        if (prev.has(key)) {
          alreadyFound = true
          return prev
        }
        const next = new Set(prev)
        next.add(key)
        return next
      })
      if (alreadyFound) return
      setActiveEgg({ key, title, subtitle })
      setEggVisible(true)
      sceneRef.current?.engine.playEasterEggSparkle()
      try {
        trackEvent('landingv2_easter_egg_found', { egg_key: key, egg_title: title })
      } catch {
        // Never let analytics break the page.
      }
    },
    [],
  )

  const dismissEgg = useCallback(() => {
    setEggVisible(false)
    // Allow the slide-out to play before clearing activeEgg so the
    // EasterEggCard's internal state has something to render until the
    // transition completes (the card's own useEffect handles the
    // unmount-after-320ms detail).
    window.setTimeout(() => setActiveEgg(null), 320)
  }, [])

  // ── Time-of-day toast (Wave 4 / D1 — vision § 13 egg 5) ────────────────
  // Distinct from `showEasterEgg` because the T-key cycle is allowed to
  // fire as many times as the user presses T. We re-use the existing
  // EasterEggCard component (visual consistency, same slide animation,
  // 3s auto-dismiss) but bypass the `foundEggs` Set so cycling doesn't
  // burn the egg-badge counter and the toast can re-appear on every
  // press. The 'konami' EggKey is borrowed for the card's `eggKey` prop
  // since EasterEggCardProps types `eggKey` as a string and any stable
  // identifier works for the auto-dismiss timer reset; the title +
  // subtitle below carry the real semantic.
  const showTimeOfDayToast = useCallback((phase: TimeOfDay) => {
    setActiveEgg({
      key: 'konami', // placeholder — re-used solely for the card's React key
      title: `Time: ${PHASE_LABEL[phase]}`,
      subtitle: 'Press T to advance the world clock.',
    })
    setEggVisible(true)
    sceneRef.current?.engine.playEasterEggSparkle()
  }, [])

  // ── Three.js scene setup ──────────────────────────────────────
  // Skipped entirely if `reducedMotion` is true — the user gets the
  // static fallback instead. (Same applies if WebGL is unavailable; the
  // probe below short-circuits in that case.)
  useEffect(() => {
    if (reducedMotion) return
    if (!mountRef.current) return
    const mount = mountRef.current

    // WebGL probe
    try {
      const probe = document.createElement('canvas')
      const ctx = probe.getContext('webgl2') || probe.getContext('webgl') || (probe as HTMLCanvasElement).getContext('experimental-webgl' as never)
      if (!ctx) throw new Error('webgl unsupported')
    } catch {
      setWebglError("Your browser doesn't support WebGL. Open this page in Safari, Chrome, or Firefox to drive the world.")
      return
    }

    // Attach keyboard controls — produces a `keys` ref the scene reads each frame.
    // Wave 3 / C6 wires the Konami code, H-key hold-to-honk + 5s-hold
    // fireworks, and T-key time-of-day cycle stub. T-key just nudges
    // analytics today; Wave 4 / D1 will implement the actual palette
    // interpolation against the Sky module.
    const keyboard = attachKeyboardControls({
      onEscape: () => setActiveMonument(null),
      onShiftDown: () => { boostRef.current = true; setBoostActive(true) },
      onShiftUp: () => { boostRef.current = false; setBoostActive(false) },
      onKonami: () => {
        // Persist the unlock so the next visit boots into Atlas livery
        // by default, apply the skin immediately so the car visually
        // changes, and surface the toast. unlockSkin is idempotent +
        // setCurrentSkin is a no-op for locked skins.
        unlockSkin('atlas')
        setCurrentSkin('atlas')
        sceneRef.current?.applyCarSkin('atlas')
        showEasterEgg('konami', 'Atlas livery unlocked', 'Konami code accepted.')
      },
      onHornDown: () => {
        sceneRef.current?.engine.setHorn(true)
        // Visible shockwave ring from the car's current position — pairs
        // with the procedural horn tone so honking has a visual effect.
        sceneRef.current?.fireHornPulse()
      },
      onHornUp: () => {
        sceneRef.current?.engine.setHorn(false)
      },
      onHornHoldFire: () => {
        // Fire the tower fireworks burst. The scene fires the
        // onEasterEgg('horn_fireworks') callback ONCE per session
        // internally, which routes back here via the scene's
        // callbacks.onEasterEgg → showEasterEgg path.
        sceneRef.current?.fireTowerFireworks()
      },
      onTimeCycle: () => {
        // Cycle dusk → night → dawn → day → dusk → … (CYCLE_ORDER).
        // Sky module + SceneRoot lerp the shader uniforms, ambient +
        // hemi colors, sun intensity, and fog over ~1.5s so the shift
        // reads as cinematic rather than abrupt. We also surface the
        // shared EasterEggCard toast so users get a clear "Time: <x>"
        // confirmation that the key worked.
        const curIdx = CYCLE_ORDER.indexOf(todRef.current)
        const nextIdx = curIdx < 0 ? 0 : (curIdx + 1) % CYCLE_ORDER.length
        const next = CYCLE_ORDER[nextIdx]
        todRef.current = next
        sceneRef.current?.setTimeOfDay(next)
        showTimeOfDayToast(next)
        try {
          trackEvent('landingv2_time_cycle_pressed', { phase: next })
        } catch {
          // Never let analytics break the page.
        }
      },
    })
    keyboardRef.current = keyboard

    // Boot the scene
    let scene: SceneHandle
    try {
      scene = createScene({
        mount,
        getInput: (): SceneInput => {
          // Pan delta sourced from the joystick's second-finger touch
          // (Wave-3 / C5). Consumed once per frame regardless of which
          // input source drives the steering. `consumePan()` zeros the
          // accumulated dx so the next frame starts fresh.
          const pan = joystickHandleRef.current?.consumePan() ?? { active: false, dx: 0 }
          // Mobile joystick wins over keyboard when active
          const j = joystickHandleRef.current?.input
          if (j?.active) {
            // When gyro is on, override steering with the tilt input.
            // Forward/back + drift still come from the joystick — only X
            // is replaced. Matches arcade convention (tilt = steer only).
            const turn = gyroActive && gyroInputRef.current.active
              ? -gyroInputRef.current.x
              : -j.x
            return {
              forward: -j.y,
              turn,
              boost: boostRef.current,
              drift: j.drift,
              panDx: pan.dx,
              panActive: pan.active,
            }
          }
          const k = keyboard.keys
          let forward = 0
          let turn = 0
          if (k.w) forward += 1
          if (k.s) forward -= 1
          if (k.a) turn += 1
          if (k.d) turn -= 1
          return {
            forward,
            turn,
            boost: boostRef.current,
            drift: k.drift,
            panDx: pan.dx,
            panActive: pan.active,
          }
        },
        callbacks: {
          onMonumentEnter: (m) => {
            setActiveMonument(m)
            setDiscovered((prev) => {
              // Only count newly-discovered monuments. Re-entering a
              // known monument must not retrip nudge timer or analytics.
              if (prev.has(m.key)) return prev
              const next = new Set(prev)
              next.add(m.key)
              discoveryCountRef.current = next.size

              // Analytics — 1-based discovery order.
              if (!discoveryOrderRef.current.includes(m.key)) {
                discoveryOrderRef.current.push(m.key)
                lv2.monumentDiscovered(m.key, discoveryOrderRef.current.length)
              }

              // Email nudge — schedule 30s timer after 3rd unique discovery.
              if (
                discoveryCountRef.current >= 3 &&
                !nudgeScheduledRef.current &&
                !isEmailNudgeSuppressed()
              ) {
                nudgeScheduledRef.current = true
                nudgeTimerRef.current = window.setTimeout(() => {
                  // Re-check suppression at fire time — defensive in
                  // case the user dismissed in another tab.
                  if (!isEmailNudgeSuppressed()) {
                    setShowEmailNudge(true)
                  }
                }, 30_000)
              }
              return next
            })
            // Audio: ring the discover chime. Engine guards on muted /
            // not-yet-started internally, so this is safe to call eagerly.
            sceneRef.current?.engine.playDiscoverChime()
            // Haptic feedback (Wave-3 / C5). Hidden districts (e.g. the
            // MINDsense Sanctuary easter egg) get the double-pulse
            // pattern; regular monuments get the short single pulse.
            // Feature-detected — silent on iOS Safari where vibrate is
            // a no-op.
            haptic(m.hidden ? HAPTIC_EASTER_EGG : HAPTIC_DISCOVER)
          },
          onBeaconRead: (text) => {
            // B6 already debounces this callback to once-per-beacon-per-
            // session at the scene layer, so a straight pass-through to
            // PostHog matches the funnel intent (one event per unique
            // beacon read).
            lv2.beaconRead(text)
          },
          onEasterEgg: (key) => {
            // Proximity-triggered eggs (Achilles, Founder Stone) and
            // the horn-fireworks egg all flow through this single
            // callback. The Konami egg is handled by the keyboard
            // callback above, not here. Copy lives next to the trigger
            // so the React shell owns user-facing strings — never
            // fabricates anything beyond the literal vision-doc
            // founder note for the Founder Stone.
            if (key === 'achilles') {
              showEasterEgg('achilles', 'Achilles statue', 'The warrior at the edge of the world.')
            } else if (key === 'founder_stone') {
              showEasterEgg(
                'founder_stone',
                'Founder Stone',
                'Built this in public. Thanks for driving by. — AJC',
              )
            } else if (key === 'horn_fireworks') {
              showEasterEgg(
                'horn_fireworks',
                'Tower fireworks',
                'Hold the horn long enough and the tower fires back.',
              )
            } else if (key === 'mindsense_sanctuary') {
              // D4: hidden Sanctuary discovery → unlock MINDsense skin
              // + surface the toast. unlockSkin is idempotent (no-op if
              // already unlocked from a prior session). The MINDsense
              // skin stays selectable in the picker; we do NOT auto-
              // apply it so the player can decide whether to swap.
              unlockSkin('mindsense')
              showEasterEgg(
                'mindsense_sanctuary',
                'MINDsense Sanctuary',
                'The feeling layer. MINDsense skin unlocked.',
              )
            }
          },
          onLoadProgress: (loaded, total) => {
            if (total <= 0) return
            setLoadProgress(loaded / total)
          },
          onReady: () => {
            // Trigger the fade-out, then unmount the loader after the CSS
            // transition lands. 420ms matches the Loader's transition.
            setLoaderDismissing(true)
            window.setTimeout(() => setLoaderActive(false), 460)
          },
        },
      })
    } catch {
      setWebglError("Couldn't create a WebGL context. Try a different browser or device.")
      keyboard.detach()
      return
    }
    sceneRef.current = scene

    // Restore any districts the player discovered in a previous session —
    // marks their labels visited + populates the persistent discovery set
    // used by the idle hint so it doesn't suggest already-visited targets.
    if (discovered.size > 0) {
      scene.restoreDiscoveries(discovered)
    }

    // ── Initial scene state sync (vision § 6 / Wave 3 C1+C2) ─────────
    // GarageIntro mounts BEFORE the scene exists (React renders the
    // overlay synchronously while this effect runs async). The intro's
    // own mount effect calls setIntroMode(true) and setIntroCameraOrbit(0)
    // through the null-safe sceneRef but those calls are dropped when the
    // scene isn't ready yet. Re-apply the intro freeze now that the scene
    // is live so the car can't drift before "Start driving" is clicked.
    if (showIntro) {
      scene.setIntroMode(true)
      scene.setIntroCameraOrbit(0)
    }

    return () => {
      scene.dispose()
      keyboard.detach()
      sceneRef.current = null
      keyboardRef.current = null
      // Cancel any pending soft-nudge timer so it doesn't fire after
      // the component has unmounted.
      if (nudgeTimerRef.current !== null) {
        window.clearTimeout(nudgeTimerRef.current)
        nudgeTimerRef.current = null
      }
    }
    // showEasterEgg + showTimeOfDayToast are intentionally stable via
    // useCallback([]) so they do not retrigger the scene mount/unmount cycle.
  }, [reducedMotion, showEasterEgg, showTimeOfDayToast])

  // ── Audio: lazy-start the engine sound once user dismisses intro ───
  // Engine.start() builds the AudioContext + ambient pad + wind + sfx
  // buses. It is idempotent — repeat calls are no-ops. Lazy because the
  // browser only lets you create an AudioContext after a user gesture.
  useEffect(() => {
    if (reducedMotion) return
    if (showIntro || muted) return
    sceneRef.current?.engine.start()
  }, [showIntro, muted, reducedMotion])

  // Track muted state — flip the master bus gain via setMuted. Unmute
  // path: master bus opens back up, ambient pad re-ramps to its base
  // gain, wind picks up on the next tickAudio() velocity update.
  useEffect(() => {
    if (reducedMotion) return
    sceneRef.current?.engine.setMuted(muted)
  }, [muted, reducedMotion])

  // ── Summit trigger (vision § 6 Beat 3) ─────────────────────────────
  // Flips when the user has discovered all 8 MAIN districts. The hidden
  // Sanctuary discovery does NOT itself trigger summit — only main count.
  // This effect also calls into the scene engine to:
  //  1. Toggle the drone camera + saturate plaza beam (`setSummit`)
  //  2. Dismiss any active MonumentCard (the gauntlet replaces it)
  //  3. Fire the summit fanfare from the audio engine
  useEffect(() => {
    if (reducedMotion) return
    if (summitReached) return
    const mainDiscovered = Array.from(discovered).filter((k) => mainKeys.has(k)).length
    if (mainDiscovered >= MONUMENTS.length) {
      setSummitReached(true)
      setActiveMonument(null)
      // Theatrical sequence: tower fireworks + sparkle SFX + summit
      // fanfare in lockstep, then the drone camera lifts. The fireworks
      // hit before the camera move so the player sees the world's
      // climax from the follow-cam perspective before drifting up.
      sceneRef.current?.fireTowerFireworks()
      // Tiny stagger so the camera lifts 600ms AFTER the fireworks
      // launch — gives the burst time to read before the perspective
      // change.
      window.setTimeout(() => {
        sceneRef.current?.setSummit(true)
      }, 600)
      sceneRef.current?.engine.playSummitFanfare()
    }
  }, [discovered, summitReached, mainKeys, reducedMotion])

  // ── Touch joystick ────────────────────────────────────────────
  useEffect(() => {
    if (reducedMotion) return
    const stick = joystickStickRef.current
    const base = joystickRef.current
    if (!stick || !base) return

    const handle = attachJoystick({ baseEl: base, stickEl: stick })
    joystickHandleRef.current = handle
    return () => {
      handle.detach()
      joystickHandleRef.current = null
    }
  }, [isMobile, showIntro, reducedMotion])

  // ── Gyro tilt-to-steer (Wave-3 / C5) ──────────────────────────
  // Toggle handler runs inside the user-gesture stack so iOS's
  // `DeviceOrientationEvent.requestPermission()` doesn't drop the
  // privileged context. On grant: attach the listener + flip `active`.
  // On revoke (second tap): detach + clear the stashed input.
  const onGyroToggle = useCallback(async () => {
    if (gyroActive) {
      gyroHandleRef.current?.detach()
      gyroHandleRef.current = null
      gyroInputRef.current = { x: 0, active: false }
      setGyroActive(false)
      return
    }
    const granted = await requestGyroPermission()
    if (!granted) return
    const handle = attachGyro({
      onInput: (i) => {
        gyroInputRef.current = i
      },
    })
    gyroHandleRef.current = handle
    setGyroActive(true)
  }, [gyroActive])

  // Tear down the gyro listener on unmount so we don't leak.
  useEffect(() => {
    return () => {
      gyroHandleRef.current?.detach()
      gyroHandleRef.current = null
    }
  }, [])

  // Stable getter for the joystick handle — used by the JoystickTrail
  // component's rAF loop. Wrapping in useCallback keeps its identity
  // stable across renders so the inner effect doesn't re-subscribe.
  const getJoystickHandle = useCallback(() => joystickHandleRef.current, [])

  // ── Render ────────────────────────────────────────────────────

  // Reduced-motion: render static narrative INSTEAD of the scene.
  // This branch must come BEFORE the webgl-error branch so users who
  // opted out of motion never trigger the WebGL probe.
  if (reducedMotion) {
    return <ReducedMotionFallback onCta={(path) => navigate(path)} reason="reduced-motion" />
  }

  if (webglError) {
    return (
      <>
        <Meta />
        <WebGLFallback message={webglError} onRedirect={() => navigate('/LandingV1')} />
      </>
    )
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#e6c9a8] text-white select-none">
      {/* SEO meta tags + OG image + JSON-LD */}
      <Meta />

      {/*
        Screen-reader narrative (Wave-4 / D5 — vision § 10).

        The drivable scene is a `<canvas>`, which is opaque to assistive
        technology. We surface the FULL eight-district + hidden Sanctuary
        narrative in semantic HTML so blind users get the same story
        sighted drivers do, complete with real anchor links to the same
        CTA paths the 3D MonumentCard exposes. The block is positioned
        off-screen via Tailwind's `sr-only` utility — visible only to
        screen readers, never visible to sighted users.
      */}
      <div className="sr-only">
        <h1>Drive the MIND World — the persistent memory layer for AI</h1>
        <p>
          MIND is the persistent memory layer for AI. This page is a drivable 3D world
          with eight monuments — each one a real capability — plus a hidden ninth district.
          The narrative below mirrors the 3D scene; every link points to the same destination
          as the corresponding monument card.
        </p>
        <h2>The nine districts of the MIND World</h2>
        <ol>
          {DISTRICTS.map((d) => (
            <li key={d.key}>
              <h3>
                {d.title}
                {d.hidden ? ' (hidden district)' : ''}
              </h3>
              <p>
                <strong>{d.tagline}</strong> {d.detail}
              </p>
              <p>
                <a href={d.ctaPath}>{d.cta}</a>
              </p>
            </li>
          ))}
        </ol>
        <p>
          <a href="/register">Get MIND — sign up</a>
        </p>
      </div>

      {/* Canvas mount */}
      <div ref={mountRef} className="absolute inset-0" aria-hidden="true" />

      {/* Cinematic boost vignette — radial darkening from edges in, brand-
          red tinted, fades in over 200ms while Shift is held. Pure visual
          cue for speed. Pointer-events-none so it doesn't block input. */}
      <div
        className="absolute inset-0 z-10 pointer-events-none transition-opacity duration-200"
        style={{
          opacity: boostActive ? 1 : 0,
          background:
            'radial-gradient(ellipse at center, transparent 38%, rgba(244, 63, 63, 0.06) 65%, rgba(0, 0, 0, 0.45) 100%)',
        }}
        aria-hidden="true"
      />

      {/* Branded loading screen — covers the scene until SceneRoot reports ready */}
      {loaderActive && <Loader progress={loadProgress} dismissing={loaderDismissing} />}

      {/* Top-left brand — clears iOS notch via safe-area inset. */}
      <div
        className="absolute left-4 sm:left-5 z-20 flex items-center gap-2 pointer-events-none"
        style={{ top: 'max(1rem, env(safe-area-inset-top, 0px))' }}
        aria-hidden="true"
      >
        <img src="/favicon.png" alt="" className="size-7 drop-shadow-lg" />
        <div>
          <div className="text-sm font-bold tracking-tight leading-none drop-shadow">MIND</div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-white/90 leading-tight mt-1 drop-shadow">Drive the knowledge</div>
        </div>
      </div>

      {/* Top-right CTA + share + mute + (mobile only) gyro toggle.
          Safe-area inset on top so the cluster clears the iOS notch. */}
      <div
        className="absolute right-4 sm:right-5 z-20 flex items-center gap-2"
        style={{ top: 'max(1rem, env(safe-area-inset-top, 0px))' }}
      >
        {isMobile && gyroSupported && (
          <GyroToggle active={gyroActive} onToggle={onGyroToggle} supported={gyroSupported} />
        )}
        <ShareButton
          activeMonumentTitle={activeMonument?.title ?? null}
          onCaptureStarted={(withMonument) => lv2.screenshotCaptured(withMonument)}
          onShared={(path) => lv2.shareClicked(path)}
        />
        <MuteButton
          muted={muted}
          onToggle={() => {
            setMuted((v) => {
              // Fire once-per-browser on muted → unmuted transition.
              if (v) lv2.audioUnmuted()
              return !v
            })
          }}
        />
        <button
          onClick={() => navigate('/register')}
          onMouseEnter={() => sceneRef.current?.engine.playUiHover()}
          aria-label="Get MIND — sign up"
          className="bg-[#F43F3F] hover:bg-[#F43F3F]/90 text-white text-[12px] font-bold px-4 min-h-11 rounded-full transition-colors uppercase tracking-wider inline-flex items-center gap-1.5 shadow-[0_4px_20px_rgba(244,63,63,0.4)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFCC4D] focus-visible:ring-offset-2 focus-visible:ring-offset-black/40"
        >
          Get MIND <ArrowRight className="size-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* Discovery counter — main count = 8, jumps to 9/9 when hidden Sanctuary found.
          Adds an "✨ all eggs found" badge below when the user has collected all
          4 trackable C6 easter eggs (Achilles, Konami, Founder Stone, horn-fireworks).
          The 5th C6 egg — the T-key time-of-day cycle — is wired as a key binding
          but isn't a "discoverable" toast egg until Wave 4 / D1 implements the
          actual sky-palette interpolation, so it isn't counted in eggsTotal here. */}
      <DiscoveryCounter
        discoveredKeys={discovered}
        mainTotal={MONUMENTS.length}
        hasHidden={HIDDEN_DISTRICTS.length > 0}
        hiddenFound={HIDDEN_DISTRICTS.some((d) => discovered.has(d.key))}
        eggsFound={foundEggs.size}
        eggsTotal={4}
      />

      {/* Easter egg toast (Wave 3 / C6 — vision § 13). */}
      {activeEgg && (
        <EasterEggCard
          eggKey={activeEgg.key}
          title={activeEgg.title}
          subtitle={activeEgg.subtitle}
          visible={eggVisible}
          onDismiss={dismissEgg}
        />
      )}

      {/* Garage cinematic intro (vision § 6 Beat 1 / Wave 3 C1)
          Replaces the old static Intro card. Drives scene orbit + freeze
          via sceneRef. The `started` prop holds the phase chain in black
          until the branded Loader finishes its fade so the cinematic
          doesn't burn its first beats behind the loader. */}
      {showIntro && (
        <GarageIntro
          started={!loaderActive}
          onDismiss={() => setShowIntro(false)}
          onCtaHover={() => sceneRef.current?.engine.playUiHover()}
          onTimedDismiss={(ms) => lv2.introDismissed(ms)}
          onOrbitAngle={(angle) => sceneRef.current?.setIntroCameraOrbit(angle)}
          onIntroMode={(active) => sceneRef.current?.setIntroMode(active)}
        />
      )}

      {/* Active monument card — hidden during intro AND summit (the
          gauntlet replaces individual monument CTAs once 8/8 hits). */}
      {activeMonument && !showIntro && !summitReached && (
        <MonumentCard
          monument={activeMonument}
          onClose={() => setActiveMonument(null)}
          onCta={(path) => navigate(path)}
          onCtaClicked={(key, targetPath) => lv2.monumentCtaClicked(key, targetPath)}
        />
      )}

      {/* Summit overlay (vision § 6 Beat 3 / Wave 3 C2) — all 8 main
          monuments discovered. Mounts above all other UI; the scene
          continues to animate beneath via drone camera. */}
      {summitReached && (
        <Summit
          onDriveMore={() => {
            // Unlock the Founder Edition skin (idempotent if already
            // unlocked from a prior playthrough) and return to free
            // exploration. The scene's setSummit(false) restores the
            // standard follow camera + base beam intensity.
            unlockSkin('founder')
            sceneRef.current?.setSummit(false)
            setSummitReached(false)
          }}
          onCta={(target) => {
            // External (mailto) targets get a window.open so the user's
            // mail client opens in a new context. Internal routes use
            // react-router navigate so the SPA stays mounted.
            if (target.startsWith('mailto:')) {
              window.location.href = target
              return
            }
            navigate(target)
          }}
          onCtaHover={() => sceneRef.current?.engine.playUiHover()}
        />
      )}

      {/* Controls (desktop) — hidden during intro and summit. */}
      {showControls && !isMobile && !showIntro && !summitReached && (
        <Controls onHide={() => setShowControls(false)} />
      )}

      {/* Skin picker (bottom-right) — hidden during intro and summit so
          the cinematic moments stay uncluttered. */}
      {!showIntro && !summitReached && (
        <SkinPicker
          onApply={(key) => sceneRef.current?.applyCarSkin(key)}
        />
      )}

      {/* Soft-conversion email nudge — fires ~30s after 3rd monument.
          Suppressed during intro, summit, and active monument cards. */}
      {showEmailNudge && !showIntro && !summitReached && !activeMonument && (
        <EmailNudge onClose={() => setShowEmailNudge(false)} />
      )}

      {/* Mobile joystick — bottom-left, safe-area inset. Hidden during
          intro and summit. When gyro is active the visual fades. */}
      {isMobile && !showIntro && !summitReached && (
        <div
          ref={joystickRef}
          className="absolute z-20 size-32 rounded-full border-2 border-white/20 bg-black/40 backdrop-blur-md touch-none flex items-center justify-center"
          style={{
            touchAction: 'none',
            bottom: 'max(1.5rem, env(safe-area-inset-bottom, 0px))',
            left: 'max(1.5rem, calc(env(safe-area-inset-left, 0px) + 0.75rem))',
            opacity: gyroActive ? 0.55 : 1,
            transition: 'opacity 220ms ease',
          }}
        >
          <JoystickTrail getHandle={getJoystickHandle} />
          <div
            ref={joystickStickRef}
            className="size-14 rounded-full bg-[#F43F3F]/90 shadow-[0_0_20px_rgba(244,63,63,0.5)] pointer-events-none transition-transform"
          />
          {gyroActive && (
            <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[9px] font-bold uppercase tracking-[0.22em] bg-[#F43F3F] text-white px-2 py-0.5 rounded-full shadow-[0_2px_10px_rgba(244,63,63,0.4)]">
              TILT
            </div>
          )}
        </div>
      )}
    </div>
  )
}
