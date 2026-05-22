import * as THREE from 'three'
import type { Monument } from '../districts/types'
import { MONUMENTS, HIDDEN_DISTRICTS } from '../districts/data'
import { buildMonument } from '../districts/buildMonument'
import {
  buildSanctuaryBeaconTrail,
  type SanctuaryRefs,
} from '../districts/factories/mindsenseSanctuary'
import { createSky } from './Sky'
import { SKY_PALETTES, type TimeOfDay } from './SkyPalettes'
import { createGround } from './Ground'
import { createPlaza } from './Plaza'
import { buildHighways } from './Highways'
import { buildAtmosphere } from './Atmosphere'
import { createNpcs, type NpcsHandle } from './Npcs'
import { buildCar, type CarBuild } from '../car/Car'
import { updateCar, type CarState } from '../car/Physics'
import { createDust } from '../car/Dust'
import { createFlames } from '../car/Flames'
import { createSkids } from '../car/Skids'
import { SKINS, applySkin, getCurrentSkin } from '../car/Skins'
import { createEngine, type EngineHandle } from '../audio/Engine'
import { createPostFX, type PostFXHandle } from './PostFX'
import { createBeacons } from './Beacons'
import { createClouds } from './Clouds'
import { createThoughtStream } from './ThoughtStream'
import { createMotes } from './Motes'
import { createEasterEggs, type EasterEggHandle } from './EasterEggs'
import { createFireworks, type FireworksHandle } from './Fireworks'

export interface SceneInput {
  /** [-1..1] — forward/back drive */
  forward: number
  /** [-1..1] — left/right turn */
  turn: number
  /** Boost (Shift on desktop, or held mobile) */
  boost: boolean
  /** Handbrake / drift (Space on desktop, or 2-finger touch on mobile) */
  drift: boolean
  /**
   * Optional per-frame camera yaw delta in pixels. Sourced from the
   * second simultaneous touch on mobile (joystick's `consumePan()`).
   * The scene treats this as a relative orbit nudge layered on top of
   * the default car-follow yaw. Undefined = use default follow.
   * Wave-3 / C5.
   */
  panDx?: number
  /**
   * True while the second touch is held (the pan finger). Used to
   * decide whether to apply `panDx` and whether to retain accumulated
   * yaw between frames vs. relax back to the car-relative default.
   */
  panActive?: boolean
}

export interface SceneCallbacks {
  /** Fired when the car enters proximity of a previously-untriggered monument. */
  onMonumentEnter: (m: Monument) => void
  /**
   * Fired ONCE when all critical async assets are loaded AND the first
   * frame has rendered. The UI loader uses this to fade out and unmount.
   * Optional — when undefined the scene boots silently (back-compat).
   */
  onReady?: () => void
  /**
   * Fired whenever the LoadingManager reports texture-load progress.
   * `loaded / total` in [0..1]. Use this to drive the loader's bar.
   * Optional — when undefined no progress is reported.
   */
  onLoadProgress?: (loaded: number, total: number) => void
  /**
   * Fired once per fun-info beacon per session, the moment the beacon
   * becomes fully opaque (the car drove within {@link PROXIMITY_FULL}
   * units of it). Wave-2 / B6 ships the beacons themselves; Wave-3 / C3
   * (analytics) wires this into PostHog as `landingv2_beacon_read`.
   * Optional — undefined is a no-op.
   */
  onBeaconRead?: (text: string) => void
  /**
   * Fired once per easter egg per session when the car triggers it.
   *
   *   - `'achilles'` — drove within 5 units of the SE-mountain statue.
   *   - `'founder_stone'` — drove within 1.5 units of the eastern
   *     plaza-ring tile.
   *   - `'horn_fireworks'` — held the H key for 5+ seconds and the
   *     tower fireworks burst fired.
   *   - `'mindsense_sanctuary'` — drove within 12 units of the hidden
   *     MINDsense Sanctuary at [0,-105]. Wave 4 / D4 reveal egg #1.
   *
   * The Konami → Atlas-skin egg is wired via Keyboard.ts → React shell
   * directly and does not flow through this callback (the consumer
   * needs `unlockSkin` + `applyCarSkin` rather than a proximity event).
   *
   * Wave-3 / C3 (analytics) wires this into PostHog as
   * `landingv2_easter_egg_found`. Optional — undefined is a no-op.
   */
  onEasterEgg?: (
    eggKey:
      | 'achilles'
      | 'founder_stone'
      | 'horn_fireworks'
      | 'mindsense_sanctuary',
  ) => void
}

export interface SceneOptions {
  mount: HTMLDivElement
  getInput: () => SceneInput
  callbacks: SceneCallbacks
}

export interface SceneHandle {
  engine: EngineHandle
  /** Recolor the car in place (used by the SkinPicker UI). */
  applyCarSkin: (key: keyof typeof SKINS) => void
  /**
   * Live read of the FPS-adaptive LOD state. Other modules (PostFX in
   * Wave 2, future scene additions) can short-circuit expensive work
   * when this is true. Read each frame — value flips when the rolling
   * FPS average crosses the hysteresis thresholds.
   */
  isLoQuality: () => boolean
  /**
   * Fire the MIND Tower fireworks burst. Used by the horn-hold easter
   * egg (vision § 13 egg 6). Plays the easter-egg sparkle SFX in tandem.
   */
  fireTowerFireworks: () => void
  /**
   * GarageIntro orbit override (vision § 6 Beat 1 / Wave 3 C1). When
   * `angle` is a number, swap follow camera for fixed orbit around car
   * (radius 8, height 4). When `null`, release back to follow camera.
   */
  setIntroCameraOrbit: (angle: number | null) => void
  /**
   * Freeze the car's physics during the GarageIntro. When `true`,
   * velocity + angularVelocity are forced back to 0 each frame.
   */
  setIntroMode: (active: boolean) => void
  /**
   * Summit cinematic toggle (vision § 6 Beat 3 / Wave 3 C2). When
   * `true`, plaza beam saturates + camera eases to high drone shot over
   * ~6s. When `false`, returns to standard follow + base beam.
   * Idempotent.
   */
  setSummit: (active: boolean) => void
  /**
   * Switch the world's time-of-day phase. Lerps sky shader uniforms,
   * ambient + hemisphere light colors, directional sun intensity, and
   * fog color over ~1.5s so the transition reads as cinematic instead
   * of an abrupt color shift. Idempotent — passing the current phase
   * is a no-op. Vision § 13 easter egg #5 + § 1 brand palette. Wave 4 / D1.
   */
  setTimeOfDay: (tod: TimeOfDay) => void
  /** Currently active (or transitioning toward) time-of-day phase. */
  getTimeOfDay: () => TimeOfDay
  dispose: () => void
}

// ─── FPS-adaptive LOD constants ────────────────────────────────────────
// Hysteresis-gated quality scaler:
//  - measure avg FPS over a rolling 60-frame window
//  - if avg < FPS_DOWNGRADE_THRESHOLD for FPS_DOWNGRADE_STREAK windows in a
//    row → drop to lo quality (smaller shadow map, halved particle budgets,
//    dimmer brand point light)
//  - if avg > FPS_UPGRADE_THRESHOLD for FPS_UPGRADE_STREAK windows in a row
//    → restore hi quality
// Hysteresis prevents thrashing when avg sits near a single threshold.
const FPS_WINDOW = 60
const FPS_DOWNGRADE_THRESHOLD = 40
const FPS_DOWNGRADE_STREAK = 3
const FPS_UPGRADE_THRESHOLD = 55
const FPS_UPGRADE_STREAK = 5

const HI_SHADOW_SIZE = 2048
const LO_SHADOW_SIZE = 1024
const HI_DUST_BUDGET = 200
const LO_DUST_BUDGET = 100
const HI_FLAME_BUDGET = 80
const LO_FLAME_BUDGET = 40
const HI_BRAND_POINT_INTENSITY = 3.0
const LO_BRAND_POINT_INTENSITY = 1.5

/**
 * Boots the whole Three.js scene inside `mount` and runs the animation loop.
 * The caller drives input via `getInput()` (read once per frame) and listens
 * for monument-entry events via `callbacks.onMonumentEnter`. The optional
 * `callbacks.onReady` fires once when all critical async assets (currently
 * the M/I/N/D letterform textures) have loaded AND the first frame has
 * rendered — the React shell uses that signal to fade out the branded
 * loading screen.
 *
 * The returned handle exposes the audio `engine` so the React shell can
 * start/mute it on intro-dismiss / mute-toggle, an `isLoQuality()` reader
 * for downstream modules that want to participate in LOD degradation,
 * and a `dispose()` that cancels the animation frame, tears down event
 * listeners, removes the canvas, and disposes every geometry/material in
 * the scene.
 */
export function createScene({ mount, getInput, callbacks }: SceneOptions): SceneHandle {
  // ── LoadingManager — wires real texture-load progress to the UI ────────
  // The default TextureLoader in Plaza.ts (the only async-asset call site
  // in the current scene) will route through this manager so we can feed
  // the branded loading screen with real progress instead of a fake bar.
  const loadingManager = new THREE.LoadingManager()
  let assetsLoaded = false
  let firstFrameRendered = false
  let readyFired = false
  const maybeFireReady = () => {
    if (assetsLoaded && firstFrameRendered && !readyFired) {
      readyFired = true
      callbacks.onReady?.()
    }
  }
  loadingManager.onProgress = (_url, loaded, total) => {
    callbacks.onLoadProgress?.(loaded, total)
  }
  loadingManager.onLoad = () => {
    assetsLoaded = true
    maybeFireReady()
  }
  loadingManager.onError = (url) => {
    // Don't block the scene on missing/blocked assets — treat error as
    // "done" so the loader can still dismiss. Logged for debugging.
    // eslint-disable-next-line no-console
    console.warn('[LandingV2] LoadingManager error for', url)
    assetsLoaded = true
    maybeFireReady()
  }

  // ── Time-of-day starting palette ────────────────────────
  // Mounts on 'dusk' to match current production look. The Sky factory
  // + the ambient/hemi lights below all consume the same dusk values so
  // there's no flash of a wrong palette before D1's setTimeOfDay paths
  // get hit.
  const DEFAULT_TOD: TimeOfDay = 'dusk'
  const startPal = SKY_PALETTES[DEFAULT_TOD]

  // ── Scene ───────────────────────────────────────────────
  const scene = new THREE.Scene()
  const fog = new THREE.FogExp2(startPal.fog, 0.014)
  scene.fog = fog

  // ── Sky ─────────────────────────────────────────────────
  const sky = createSky(DEFAULT_TOD)
  scene.add(sky.mesh)

  // ── Camera ──────────────────────────────────────────────
  // Spawn camera frames the FULL world from behind the car, not just the
  // back of the obelisk. Without this, the default -Z lookAt would put the
  // 78u MIND Tower at fullbleed across the first frame (E1 caught this on
  // the headless-baseline pass).
  //
  // Position matches the follow-camera offset that the animation loop will
  // lerp toward — car at (0, 0, 18) with rotation.y = π → camOffset
  // `(0, 5, -11).applyEuler({y: π}) = (0, 5, 11)` → camera spawn (0, 5, 29).
  // Camera looks at the car so the first frame already shows the
  // establishing shot (car + plaza + several districts in frame).
  const camera = new THREE.PerspectiveCamera(58, mount.clientWidth / mount.clientHeight, 0.1, 600)
  // Match the GarageIntro orbit start pose (angle 0, radius 16, height 9
  // around the car at z=18) so the very first frame composes the
  // establishing shot — car right-of-center, plaza + tower receding
  // northward — instead of fullbleeding the obelisk for the brief window
  // before the React shell calls setIntroCameraOrbit(0).
  camera.position.set(16, 9, 18)
  camera.lookAt(0, 1.5, 18)

  // ── Renderer ────────────────────────────────────────────
  // Cross-browser construction with antialias fallback:
  //   - Safari + integrated GPUs can fail antialias context creation silently.
  //     Three.js throws on the `getContext` call inside WebGLRenderer when the
  //     requested attributes can't be satisfied — wrap in try/catch and retry
  //     with antialias:false so the scene still boots on older hardware
  //     (the SMAA post-FX pass in PostFX.ts already covers AA visually).
  //   - `preserveDrawingBuffer: true` is required for ShareButton.tsx to
  //     read the WebGL framebuffer via `canvas.toBlob()`. On Safari + iOS the
  //     drawing buffer is cleared immediately after present when this is
  //     false, so the share screenshot would composite an empty canvas. Cost
  //     is a small perf hit (extra back-buffer copy) — acceptable for the
  //     share funnel, and Safari is the browser where this matters most.
  //   - `powerPreference: 'high-performance'` nudges multi-GPU laptops
  //     (MacBook Pro w/ discrete + integrated) toward the discrete GPU.
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    })
  } catch {
    // Fallback for integrated GPUs that fail antialias context creation.
    // PostFX's SMAA pass provides AA visually for everything else.
    renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      preserveDrawingBuffer: true,
    })
  }
  renderer.setSize(mount.clientWidth, mount.clientHeight)
  // Pixel-ratio cap: 2 on most devices. Safari iOS can report 3 on a
  // ProMotion iPad which triples the per-frame fill cost. Capping at 2
  // keeps perf bounded without a visible quality drop on Retina screens.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.outputColorSpace = THREE.SRGBColorSpace
  mount.appendChild(renderer.domElement)

  // ── Lights ──────────────────────────────────────────────
  // Ambient + hemisphere + directional all carry palette-driven colors
  // + intensities so the time-of-day cycle reads as a coherent shift
  // across the entire lighting stack — not just the sky dome.
  const ambient = new THREE.AmbientLight(startPal.ambient, 0.45)
  scene.add(ambient)
  const hemi = new THREE.HemisphereLight(startPal.hemiSky, startPal.hemiGround, 0.55)
  scene.add(hemi)

  const sun = new THREE.DirectionalLight(0xffe8c9, startPal.sunIntensity)
  sun.position.set(-30, 50, 20)
  sun.castShadow = true
  sun.shadow.camera.left = -80
  sun.shadow.camera.right = 80
  sun.shadow.camera.top = 80
  sun.shadow.camera.bottom = -80
  sun.shadow.camera.far = 200
  sun.shadow.mapSize.set(HI_SHADOW_SIZE, HI_SHADOW_SIZE)
  sun.shadow.bias = -0.0005
  scene.add(sun)

  const brandPoint = new THREE.PointLight(0xF43F3F, HI_BRAND_POINT_INTENSITY, 35)
  brandPoint.position.set(0, 8, 0)
  scene.add(brandPoint)

  // ── Ground ──────────────────────────────────────────────
  scene.add(createGround())

  // ── Plaza + highways + atmosphere ───────────────────────
  // Plaza loads the M/I/N/D textures through the LoadingManager so the UI
  // loader can show real progress.
  const plazaBuild = createPlaza(loadingManager)
  scene.add(plazaBuild.plaza)
  scene.add(plazaBuild.plazaRing)
  scene.add(plazaBuild.outerAccentRing)
  plazaBuild.cardinalInlays.forEach((m) => scene.add(m))
  scene.add(plazaBuild.beam)
  scene.add(plazaBuild.tower)
  scene.add(plazaBuild.statsRing)
  plazaBuild.letterMeshes.forEach((m) => scene.add(m))

  buildHighways(scene, MONUMENTS)
  // Atmosphere now takes monuments so it can:
  //   (a) flank each radial highway with additional lamp posts, and
  //   (b) avoid placing trees on top of plinths or in road buffers.
  buildAtmosphere(scene, { monuments: MONUMENTS })

  // ── Monuments ───────────────────────────────────────────
  // Main districts (8) + hidden districts (1: MINDsense Sanctuary) get
  // dispatched through the same factory. Hidden ones are placed in-world but
  // are filtered out of the discovery counter's denominator until found.
  const monumentGroups: THREE.Group[] = []
  const allDistricts = [...MONUMENTS, ...HIDDEN_DISTRICTS]
  // Optional pointer to the MINDsense Sanctuary group + its reveal refs —
  // SceneRoot drives veil opacity, pulse light colour, and the post-
  // discovery emissive bloom per frame. Null when the hidden district
  // is somehow missing (defensive — the data file always ships it).
  let sanctuaryGroup: THREE.Group | null = null
  let sanctuaryRefs: SanctuaryRefs | null = null
  allDistricts.forEach((m) => {
    const g = buildMonument(m)
    g.traverse((c) => {
      if (c instanceof THREE.Mesh) c.castShadow = true
    })
    monumentGroups.push(g)
    scene.add(g)
    if (m.key === 'mindsense') {
      sanctuaryGroup = g
      const ud = g.userData as { sanctuary?: SanctuaryRefs }
      sanctuaryRefs = ud.sanctuary ?? null
    }
  })

  // ── Sanctuary beacon trail (Wave 4 / D4) ─────────────────────────────
  // 4 dim brand-blue point lights staggered between the world centre and
  // the Sanctuary at [0,-105]. Sized to read as ambient world-lighting
  // from a distance — no flashing-arrow vibe. Lights are static; they
  // appear to pulse because the camera moves through them.
  scene.add(buildSanctuaryBeaconTrail())

  // ── Fun-info beacons (Wave 2 / B6 — vision § 7) ─────────
  // 30-40 floating canvas-text panels scattered around the world:
  // 2-3 clustered per district + ~12 roadside beacons along highways.
  // They billboard to the camera, fade with proximity, and breathe
  // (gentle sine pulse) so the world reads as "humongous, full of fun
  // info" per Anthony's brief.
  const beacons = createBeacons()
  beacons.onBeaconRead = (text: string) => callbacks.onBeaconRead?.(text)
  scene.add(beacons.group)

  // ── Drifting cloud layer (Loop 1 polish) ──────────────────────────
  // High-altitude soft cloud planes that drift on a slow wind. Reads as
  // motion on the very first frame so the world doesn't feel static.
  const clouds = createClouds()
  scene.add(clouds.group)

  // ── Thought-stream particles (Loop 3 polish) ──────────────────────
  // Each district drips a slow stream of colored particles that arc
  // toward the MIND Tower top. Visualizes "every capability feeds the
  // memory layer" — the core MIND value prop, made spatial.
  const thoughtStream = createThoughtStream([...MONUMENTS, ...HIDDEN_DISTRICTS])
  scene.add(thoughtStream.points)

  // ── Atmospheric motes (Loop 4 polish) ───────────────────────────────
  // 80 slow-drifting bright dust motes in the lower air. Additive blend
  // catches the sun direction → world feels "inside something" with
  // light + mass, not on a flat plane.
  const motes = createMotes()
  scene.add(motes.points)

  // ── Walking NPCs in Agent Town (Wave 4 / D2 — vision § 3 D4) ────────
  // 6 low-poly biped agents loop simple waypoint paths around the Agent
  // Town plinth. They carry billboard speech bubbles that cycle between
  // real MIND agent-task lines ("Researching...", "Querying MIND...",
  // etc.). No collision detection — the car drives THROUGH them.
  const agentTownDistrict = MONUMENTS.find((m) => m.key === 'agents')
  const npcs: NpcsHandle | null = agentTownDistrict
    ? createNpcs([agentTownDistrict.position[0], agentTownDistrict.position[1]])
    : null
  if (npcs) scene.add(npcs.group)

  // ── Easter eggs (Wave 3 / C6 — vision § 13) ─────────────
  // Static world geometry for the Achilles Statue (SE mountain ring)
  // and the Founder Stone (eastern plaza-ring tile). Konami code,
  // horn fireworks, and time-of-day cycle are not bound to geometry
  // and are wired elsewhere.
  const easterEggs: EasterEggHandle = createEasterEggs()
  scene.add(easterEggs.group)

  // ── Fireworks (Wave 3 / C6 — horn-hold egg) ─────────────
  // A single Points cloud that bursts from the top of the MIND Tower
  // when the user holds the horn (H) for 5+ seconds. The cloud lives
  // for the lifetime of the scene; bursts are recycled on each fire.
  const fireworks: FireworksHandle = createFireworks()
  scene.add(fireworks.points)

  // ── Car ─────────────────────────────────────────────────
  const carBuild: CarBuild = buildCar()
  scene.add(carBuild.group)

  // Restore the user's last-selected skin (default if unset / locked).
  const initialSkinKey = getCurrentSkin()
  applySkin(carBuild, SKINS[initialSkinKey])

  // ── Particles + skids ───────────────────────────────────
  const dust = createDust()
  scene.add(dust.points)
  const flames = createFlames()
  scene.add(flames.points)
  const skids = createSkids()
  scene.add(skids.group)

  // ── Audio engine handle ─────────────────────────────────
  const engine = createEngine()

  // ── Post-processing pipeline ───────────────────────────
  // Cinematic stack: RenderPass → SSAO (hi-quality only) → UnrealBloom
  // (threshold 0.85 so only emissive surfaces glow) → SMAA → OutputPass
  // (ACES tone-map + sRGB). Created after all scene additions so the
  // RenderPass sees the complete scene. Wrapped in a try/catch so any
  // composer-construction failure (e.g. WebGL extension missing on an
  // older browser) falls back to direct rendering — never crashes the
  // page. When `postFX` is null, the animation loop uses the original
  // `renderer.render(scene, camera)` path.
  let postFX: PostFXHandle | null = null
  try {
    postFX = createPostFX({
      renderer,
      scene,
      camera,
      width: mount.clientWidth,
      height: mount.clientHeight,
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[LandingV2] PostFX init failed, falling back to direct render', err)
    postFX = null
  }

  // ── Resize handling ─────────────────────────────────────
  const onResize = () => {
    camera.aspect = mount.clientWidth / mount.clientHeight
    camera.updateProjectionMatrix()
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    postFX?.onResize(mount.clientWidth, mount.clientHeight)
  }
  window.addEventListener('resize', onResize)

  // ── FPS-adaptive LOD state ──────────────────────────────
  let loQuality = false
  let downgradeStreak = 0
  let upgradeStreak = 0
  let fpsFrameCount = 0
  let fpsWindowStart = 0

  const setLoQuality = (v: boolean) => {
    if (loQuality === v) return
    loQuality = v
    if (v) {
      sun.shadow.mapSize.set(LO_SHADOW_SIZE, LO_SHADOW_SIZE)
      // Force shadow-map re-allocation — THREE only re-allocates on this dispose.
      if (sun.shadow.map) {
        sun.shadow.map.dispose()
        sun.shadow.map = null
      }
      dust.setBudget(LO_DUST_BUDGET)
      flames.setBudget(LO_FLAME_BUDGET)
      brandPoint.intensity = LO_BRAND_POINT_INTENSITY
    } else {
      sun.shadow.mapSize.set(HI_SHADOW_SIZE, HI_SHADOW_SIZE)
      if (sun.shadow.map) {
        sun.shadow.map.dispose()
        sun.shadow.map = null
      }
      dust.setBudget(HI_DUST_BUDGET)
      flames.setBudget(HI_FLAME_BUDGET)
      brandPoint.intensity = HI_BRAND_POINT_INTENSITY
    }
    // Mirror the LOD flip into PostFX — drops SSAO when lo, restores
    // when hi. Null-safe so direct-render fallback stays a no-op.
    postFX?.setQuality(v)
  }

  // ── Animation loop state ────────────────────────────────
  const carState: CarState = { velocity: 0, angularVelocity: 0 }
  const clock = new THREE.Clock()
  // Scratch Color3 for the Sanctuary pulse-light tween — declared outside
  // the loop so we don't allocate a new object every frame.
  const sanctuaryCalmColor = new THREE.Color(0x4060a0)
  const sanctuaryIntenseColor = new THREE.Color(0xf43f3f)
  const sanctuaryLightColorScratch = new THREE.Color()
  let frameId = 0
  const triggeredMonuments = new Set<string>()
  const dustClock = { t: 0 }
  const skidClock = { t: 0 }
  const sparkClock = { t: 0 }
  // Idempotent fire-once flags for the proximity-triggered eggs. The
  // Konami / horn-fireworks eggs are tracked by their own consumers.
  const triggeredEggs = new Set<
    'achilles' | 'founder_stone' | 'horn_fireworks' | 'mindsense_sanctuary'
  >()
  let disposed = false
  // Accumulated camera-pan yaw in radians (Wave-3 / C5). Driven by the
  // mobile joystick's second-touch pixel delta and relaxed back to zero
  // (car-relative follow) when the pan finger lifts. Clamped to ±π so
  // we don't accumulate unbounded wind.
  let camPanYaw = 0
  const CAM_PAN_PIXELS_TO_RAD = 0.005
  const CAM_PAN_RELAX_PER_FRAME = 0.08
  const CAM_PAN_MAX = Math.PI

  // ── Narrative-arc camera/physics overrides (Wave 3 / C1+C2) ─────────────
  //
  // `introOrbitAngle` — when non-null, the per-frame camera section swaps
  // its follow path for a fixed-radius orbit around the car at this angle.
  // GarageIntro (ui/GarageIntro.tsx) drives this via setIntroCameraOrbit.
  //
  // `introMode` — when true, the car's velocity + angularVelocity are
  // hard-zeroed at the bottom of the update loop so the user can't drive
  // during the intro cinematic. Released by setIntroMode(false) on Start.
  //
  // `summit` — when true, the camera lifts to a drone shot and the plaza
  // beam saturates. Toggled by setSummit() from the React shell when the
  // discovery counter hits 8/8 (or when the user clicks "Drive more").
  // ORBIT geometry: radius 8 from origin, height 4, looking at (0, 1.5, 0).
  // SUMMIT geometry: y=60 overhead, x/z follow a slow drift around origin,
  // looking at the MIND Tower base (0, 6, 0).
  let introOrbitAngle: number | null = null
  let introMode = false
  let summit = false

  // ── Time-of-day transition state (Wave 4 / D1 — vision § 13 egg 5) ─────
  // Sky shader handles its own color lerp internally. SceneRoot owns the
  // ambient + hemisphere + sun + fog interpolation so every light + the
  // atmospheric haze move together — never one element shifting on its
  // own. `todProgress` 0→1 over TOD_TRANSITION_SEC; `todFrom*` snapshots
  // the *current* values when a transition starts, `todTarget*` are the
  // destination palette values. Settled state = todProgress >= 1.
  const TOD_TRANSITION_SEC = 1.5
  let todCurrent: TimeOfDay = DEFAULT_TOD
  let todTarget: TimeOfDay = DEFAULT_TOD
  let todProgress = 1
  const todFromAmbient = new THREE.Color(startPal.ambient)
  const todFromHemiSky = new THREE.Color(startPal.hemiSky)
  const todFromHemiGround = new THREE.Color(startPal.hemiGround)
  const todFromFog = new THREE.Color(startPal.fog)
  let todFromSun = startPal.sunIntensity
  const todTargetAmbient = new THREE.Color(startPal.ambient)
  const todTargetHemiSky = new THREE.Color(startPal.hemiSky)
  const todTargetHemiGround = new THREE.Color(startPal.hemiGround)
  const todTargetFog = new THREE.Color(startPal.fog)
  let todTargetSun = startPal.sunIntensity
  // Orbit camera frames the car (parked at z=18 during intro) with enough
  // pullback that the MIND Tower obelisk at origin reads as backdrop rather
  // than fullbleed wall. Height lifted from 4 → 9 so the establishing shot
  // shows the plaza disc + tower silhouette + several district plinths
  // rather than a tight close-up of the car's hood.
  const INTRO_ORBIT_RADIUS = 16
  const INTRO_ORBIT_HEIGHT = 9
  const INTRO_ORBIT_CENTER = new THREE.Vector3(0, 0, 18)
  const INTRO_LOOK_TARGET = new THREE.Vector3(0, 1.5, 18)
  const SUMMIT_LOOK_TARGET = new THREE.Vector3(0, 6, 0)
  const SUMMIT_DRONE_HEIGHT = 60
  // Camera lerp factor toward the summit drone shot. ~0.012 per frame at
  // 60fps yields ≈ 6s for the camera to settle within 5% of target —
  // matches the vision § 6 "slow cinematic camera lift over 6s" cue.
  const SUMMIT_LERP = 0.012

  const tick = () => {
    if (disposed) return
    const dt = Math.min(clock.getDelta(), 0.05)
    const time = clock.getElapsedTime()

    // Read input each frame from the React shell
    const input = getInput()

    // Drive the car (writes carState.velocity/angularVelocity).
    // During the GarageIntro cinematic the user can't drive — we still
    // run updateCar so wheel rotation visuals stay alive (wheels are
    // momentum-driven from velocity but with 0 velocity they idle), but
    // we hard-zero the velocity + angularVelocity AFTER the update so any
    // accidental key/joystick input is silently absorbed and the car
    // never leaves the origin while the camera orbits.
    updateCar(carBuild, carState, input, dt)
    if (introMode) {
      // Freeze the car at its spawn position (0, 0, 18) — NOT at world
      // origin, because the 78-unit MIND Tower obelisk lives at origin
      // and the orbit camera at radius < 20 would frame the tower wall
      // instead of an establishing shot. Spawn z=18 puts the car south
      // of the plaza ring (radius 16), so the orbit captures: car in
      // foreground, plaza + tower receding north, districts on either
      // side. Rotation π faces the car north toward the world.
      carState.velocity = 0
      carState.angularVelocity = 0
      carBuild.group.position.set(0, 0, 18)
      carBuild.group.rotation.set(0, Math.PI, 0)
    }

    // Dust spawns from rear wheels while moving
    dustClock.t += dt
    if (Math.abs(carState.velocity) > 1.2 && dustClock.t > 0.02) {
      dustClock.t = 0
      const rearLeft = new THREE.Vector3(-1.05, 0.2, -1.2).applyEuler(carBuild.group.rotation).add(carBuild.group.position)
      const rearRight = new THREE.Vector3(1.05, 0.2, -1.2).applyEuler(carBuild.group.rotation).add(carBuild.group.position)
      dust.spawn(rearLeft.x, rearLeft.z)
      dust.spawn(rearRight.x, rearRight.z)
    }

    // Boost flames spawn from rear exhaust when boost held + moving forward
    if (input.boost && carState.velocity > 1.5) {
      flames.spawn(carBuild.group.position, carBuild.group.rotation, 0xff5a2a)
      flames.spawn(carBuild.group.position, carBuild.group.rotation, 0xff5a2a)
    }

    // Skid marks: drifting at speed OR cornering hard at speed.
    // angularVelocity steady-state with turn=1 sits around 0.2; the >0.15
    // threshold gates "hard cornering" without false-positive on small
    // turn-ins. Spec called for >0.04 but at 60fps with 0.83 damping that
    // fires during routine steering; the higher threshold preserves the
    // intent (only at full-lock cornering) without carpeting the ground.
    // Throttled to spawn every 0.04s so we don't carpet the ground in one frame.
    const speedAbs = Math.abs(carState.velocity)
    const angAbs = Math.abs(carState.angularVelocity)
    const skidding =
      (input.drift && speedAbs > 2) ||
      (angAbs > 0.15 && speedAbs > 4)
    skidClock.t += dt
    if (skidding && skidClock.t > 0.04) {
      skidClock.t = 0
      skids.spawn(carBuild.group.position, carBuild.group.rotation)
    }

    // Drift sparks (white-orange) from the rear wheels at speed. Lighter
    // throttling than the boost flames to avoid masking them.
    sparkClock.t += dt
    if (input.drift && speedAbs > 3 && sparkClock.t > 0.05) {
      sparkClock.t = 0
      flames.spawn(carBuild.group.position, carBuild.group.rotation, 0xffd17a)
    }

    dust.advance(dt)
    flames.advance(dt)

    // Plaza + MIND Tower per-frame tick — owns beam pulse, tower emissive
    // pulse, stats-ring rotation, and orbiting halo letters. Summit flag
    // drives beam saturation when the user reaches the Summit cinematic
    // (vision § 6 Beat 3 / Wave 3 C2).
    plazaBuild.update(time, camera, summit)

    // Sky-dome color lerp (Wave 4 / D1 — vision § 13 egg 5). Sky owns its
    // own shader uniform interpolation; we just feed it dt.
    sky.update(dt)

    // Time-of-day lighting + fog lerp. Runs in lockstep with sky.update
    // so the world reads as a single coherent shift. Cheap when settled
    // (early-exit on todProgress >= 1).
    if (todProgress < 1) {
      todProgress += dt / TOD_TRANSITION_SEC
      if (todProgress >= 1) {
        todProgress = 1
        ambient.color.copy(todTargetAmbient)
        hemi.color.copy(todTargetHemiSky)
        hemi.groundColor.copy(todTargetHemiGround)
        fog.color.copy(todTargetFog)
        sun.intensity = todTargetSun
        todCurrent = todTarget
      } else {
        ambient.color.copy(todFromAmbient).lerp(todTargetAmbient, todProgress)
        hemi.color.copy(todFromHemiSky).lerp(todTargetHemiSky, todProgress)
        hemi.groundColor.copy(todFromHemiGround).lerp(todTargetHemiGround, todProgress)
        fog.color.copy(todFromFog).lerp(todTargetFog, todProgress)
        sun.intensity = THREE.MathUtils.lerp(todFromSun, todTargetSun, todProgress)
      }
    }

    // Monuments animate: sculpt bob + label bob
    monumentGroups.forEach((g, i) => {
      const u = g.userData as { sculpt: THREE.Group; labelDot: THREE.Mesh }
      u.sculpt.rotation.y = time * 0.3 + i * 0.6
      u.sculpt.position.y = 0.5 + Math.sin(time * 1.1 + i) * 0.15
      u.labelDot.position.y = 6.5 + Math.sin(time * 1.5 + i) * 0.25
    })

    // Beacon proximity-fade, billboard, and breathing pulse. Reads the
    // car's world position each frame. onBeaconRead fires once per
    // beacon per session when it first reaches full opacity.
    beacons.update(time, carBuild.group.position)
    clouds.update(dt)
    thoughtStream.update(dt, time)
    motes.update(dt, time)

    // Easter-egg per-frame pulses (Achilles chest glyph + Founder Stone
    // inlay shimmer). Fires regardless of proximity so the eggs read
    // as "alive" the moment a player gets close enough to notice them.
    easterEggs.update(time)

    // ── Sanctuary reveal per-frame drive (Wave 4 / D4) ──────────────────
    // The factory only constructs geometry; SceneRoot owns the reveal
    // animation so it stays in sync with the car's position + the global
    // clock. Three jobs per frame when the Sanctuary refs exist:
    //
    //   1. Veil opacity:
    //        - baseline lerps from 1.0 (carDist > 75) → 0.0 (carDist < 25)
    //        - +0.3 Hz sine pulse (±0.1 amplitude) so it reads alive
    //        - clamped [0, 1]
    //        - once discovered, baseline is overridden by a one-shot
    //          1.2s fade-to-0 driven off `discoveredAt`.
    //   2. Calling pulse light: colour lerps between calm blue and
    //      intense red on a 0.18 Hz sine (mapped to [0,1] via 0.5+0.5*sin).
    //      Intensity stays steady at 1.8 — only colour cycles.
    //   3. Crystal emissive bloom: at discovery, ramps from the resting
    //      0.5 → 1.2 over 2s using a clamped linear curve. Idle path
    //      simply re-asserts the resting value so we don't drift if the
    //      material was poked elsewhere (defensive — nothing else writes
    //      to this material today).
    if (sanctuaryGroup && sanctuaryRefs) {
      const sancX = sanctuaryGroup.position.x
      const sancZ = sanctuaryGroup.position.z
      const carDx = carBuild.group.position.x - sancX
      const carDz = carBuild.group.position.z - sancZ
      const carDist = Math.hypot(carDx, carDz)

      // 1. Veil opacity — proximity-faded baseline + sine pulse + post-
      //    discovery fade-out one-shot.
      let veilOpacity: number
      if (sanctuaryRefs.discovered.value) {
        const sinceDiscover = time - sanctuaryRefs.discoveredAt.value
        const fadeT = Math.min(1, sinceDiscover / 1.2)
        // Hold the last pre-discovery baseline and fade it to 0 — gives a
        // visibly smooth dissolve regardless of how close the car got.
        veilOpacity = (1 - fadeT) * 0.45
      } else {
        // Baseline: 1.0 at carDist >= 75, 0.0 at carDist <= 25, linear between.
        const span = 75 - 25
        const baselineRaw = (carDist - 25) / span
        const baseline = Math.max(0, Math.min(1, baselineRaw))
        const pulse = Math.sin(time * 2 * Math.PI * 0.3) * 0.1
        veilOpacity = Math.max(0, Math.min(1, baseline + pulse))
      }
      sanctuaryRefs.veilMaterial.opacity = veilOpacity
      // Skip the veil draw when it's effectively invisible — saves a
      // wireframe pass per frame once the car is inside the reveal zone
      // OR after the discovery fade has fully completed.
      sanctuaryRefs.veil.visible = veilOpacity > 0.02

      // 2. Calling pulse light — colour cycle between calm blue + red.
      const colorT = 0.5 + 0.5 * Math.sin(time * 2 * Math.PI * 0.18)
      sanctuaryLightColorScratch
        .copy(sanctuaryCalmColor)
        .lerp(sanctuaryIntenseColor, colorT)
      sanctuaryRefs.pulseLight.color.copy(sanctuaryLightColorScratch)

      // 3. Crystal emissive: post-discovery bloom 0.5 → 1.2 over 2s.
      if (sanctuaryRefs.discovered.value) {
        const sinceDiscover = time - sanctuaryRefs.discoveredAt.value
        const bloomT = Math.min(1, sinceDiscover / 2)
        sanctuaryRefs.crystalMaterial.emissiveIntensity = 0.5 + bloomT * 0.7
      } else {
        sanctuaryRefs.crystalMaterial.emissiveIntensity = 0.5
      }
    }

    // Walking NPCs in Agent Town (Wave 4 / D2) — waypoint nav + limb
    // swing + bob + speech-bubble cycle. Always runs (decorative; no
    // proximity gate).
    npcs?.update(time, carBuild.group.position)

    // Fireworks advance — gravity + lifetime integration. Cheap when no
    // particles are alive (loop early-exits on lifetime ≤ 0).
    fireworks.advance(dt)

    // ── Egg proximity detection (Achilles + Founder Stone) ──────────
    // Fire-once per session. Spec radii:
    //   - Achilles: 5 units (XZ-plane Euclidean)
    //   - Founder Stone: 1.5 units (tighter — it's a small tile)
    if (!triggeredEggs.has('achilles')) {
      const dx = carBuild.group.position.x - easterEggs.achillesPosition.x
      const dz = carBuild.group.position.z - easterEggs.achillesPosition.z
      if (Math.hypot(dx, dz) < 5) {
        triggeredEggs.add('achilles')
        callbacks.onEasterEgg?.('achilles')
      }
    }
    if (!triggeredEggs.has('founder_stone')) {
      const dx = carBuild.group.position.x - easterEggs.founderStonePosition.x
      const dz = carBuild.group.position.z - easterEggs.founderStonePosition.z
      if (Math.hypot(dx, dz) < 1.5) {
        triggeredEggs.add('founder_stone')
        callbacks.onEasterEgg?.('founder_stone')
      }
    }
    // MINDsense Sanctuary discovery — proximity 12u (Wave 4 / D4). Fires
    // once per session, flips the SanctuaryRefs.discovered flag so the
    // per-frame veil + emissive loop above plays the reveal animation.
    if (!triggeredEggs.has('mindsense_sanctuary') && sanctuaryGroup && sanctuaryRefs) {
      const dx = carBuild.group.position.x - sanctuaryGroup.position.x
      const dz = carBuild.group.position.z - sanctuaryGroup.position.z
      if (Math.hypot(dx, dz) < 12) {
        triggeredEggs.add('mindsense_sanctuary')
        sanctuaryRefs.discovered.value = true
        sanctuaryRefs.discoveredAt.value = time
        callbacks.onEasterEgg?.('mindsense_sanctuary')
      }
    }

    // Engine audio (internally throttled to every 5 frames)
    engine.tickAudio(carState.velocity, input.boost)

    // ── Camera mode selection ────────────────────────────────────────
    // Three modes:
    //   1. GarageIntro orbit (introOrbitAngle !== null)
    //   2. Summit drone (summit === true)
    //   3. Default follow camera (the original Wave 1/2 behavior)
    // Modes 1 and 2 are mutually exclusive — the React shell guarantees
    // this — but if both happened to fire, summit wins (intro is the
    // earliest cinematic, summit is the latest, so the latest is correct).

    if (summit) {
      // ── Summit drone shot ──────────────────────────────────────────
      const droneAngle = time * 0.02
      const droneRadius = 22
      const desiredX = Math.cos(droneAngle) * droneRadius
      const desiredZ = Math.sin(droneAngle) * droneRadius
      const desiredY = SUMMIT_DRONE_HEIGHT
      camera.fov = THREE.MathUtils.lerp(camera.fov, 64, SUMMIT_LERP)
      camera.updateProjectionMatrix()
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, desiredX, SUMMIT_LERP)
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, desiredY, SUMMIT_LERP)
      camera.position.z = THREE.MathUtils.lerp(camera.position.z, desiredZ, SUMMIT_LERP)
      camera.lookAt(SUMMIT_LOOK_TARGET)
    } else if (introOrbitAngle !== null) {
      // ── GarageIntro orbit ──────────────────────────────────────────
      const a = introOrbitAngle
      camera.fov = THREE.MathUtils.lerp(camera.fov, 52, 0.1)
      camera.updateProjectionMatrix()
      // Orbit AROUND the car's intro park position (z=18), not world origin.
      // Otherwise the camera circles inside the MIND Tower's footprint.
      camera.position.set(
        INTRO_ORBIT_CENTER.x + Math.cos(a) * INTRO_ORBIT_RADIUS,
        INTRO_ORBIT_HEIGHT,
        INTRO_ORBIT_CENTER.z + Math.sin(a) * INTRO_ORBIT_RADIUS,
      )
      camera.lookAt(INTRO_LOOK_TARGET)
    } else {
      // ── Default follow (Wave 1/2 + C5 pan-camera) ──────────────────
      const targetFov = input.boost && carState.velocity > 2 ? 68 : 58
      camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 0.06)
      camera.updateProjectionMatrix()

      // C5 pan-camera integration: second-finger touch on mobile feeds
      // pixel deltas through input.panDx. Integrate to camPanYaw, relax
      // back to zero on lift.
      if (input.panActive && typeof input.panDx === 'number' && input.panDx !== 0) {
        camPanYaw += input.panDx * CAM_PAN_PIXELS_TO_RAD
        if (camPanYaw > CAM_PAN_MAX) camPanYaw = CAM_PAN_MAX
        else if (camPanYaw < -CAM_PAN_MAX) camPanYaw = -CAM_PAN_MAX
      } else if (camPanYaw !== 0) {
        camPanYaw *= 1 - CAM_PAN_RELAX_PER_FRAME
        if (Math.abs(camPanYaw) < 0.001) camPanYaw = 0
      }

      const followYaw = carBuild.group.rotation.y + camPanYaw
      const followEuler = new THREE.Euler(0, followYaw, 0, 'YXZ')
      const camOffset = new THREE.Vector3(0, 5, -11).applyEuler(followEuler)
      const desiredCamPos = carBuild.group.position.clone().add(camOffset)
      // Soft camera lift near the MIND Tower so the follow shot doesn't
      // punch through the obelisk base. Within 12 units of origin, lerp the
      // desired y toward 12; ramps back to the natural 5 unit shoulder
      // height beyond 12 units.
      const distToOrigin = Math.hypot(carBuild.group.position.x, carBuild.group.position.z)
      if (distToOrigin < 12) {
        const lift = 1 - distToOrigin / 12
        desiredCamPos.y = THREE.MathUtils.lerp(desiredCamPos.y, 12, lift)
      }
      camera.position.lerp(desiredCamPos, 0.09)
      // Shake when boosting hard (existing behavior, untouched)
      if (input.boost && Math.abs(carState.velocity) > 3) {
        const intensity = Math.min(Math.abs(carState.velocity) * 0.005, 0.08)
        camera.position.x += (Math.random() - 0.5) * intensity
        camera.position.y += (Math.random() - 0.5) * intensity
      }
      // Smaller shake when drifting at speed (half intensity of boost shake)
      if (input.drift && Math.abs(carState.velocity) > 5) {
        const intensity = Math.min(Math.abs(carState.velocity) * 0.005, 0.08) * 0.5
        camera.position.x += (Math.random() - 0.5) * intensity
        camera.position.y += (Math.random() - 0.5) * intensity
      }
      const lookTarget = carBuild.group.position.clone().add(new THREE.Vector3(0, 1.5, 0))
      camera.lookAt(lookTarget)
    }

    // Monument proximity — suppressed during the GarageIntro (the car is
    // frozen at origin so this wouldn't fire anyway, but defense in depth)
    // and during the Summit cinematic (no new MonumentCards should mount
    // while the CTA gauntlet is up).
    if (!introMode && !summit) {
      const trigger = monumentGroups.find((g) => {
        const dx = g.position.x - carBuild.group.position.x
        const dz = g.position.z - carBuild.group.position.z
        const monu = (g.userData as { monument: Monument }).monument
        return Math.hypot(dx, dz) < 6 && !triggeredMonuments.has(monu.key)
      })
      if (trigger) {
        const monu = (trigger.userData as { monument: Monument }).monument
        triggeredMonuments.add(monu.key)
        callbacks.onMonumentEnter(monu)
      }
    }
    monumentGroups.forEach((g) => {
      const dx = g.position.x - carBuild.group.position.x
      const dz = g.position.z - carBuild.group.position.z
      const monu = (g.userData as { monument: Monument }).monument
      if (Math.hypot(dx, dz) > 11) triggeredMonuments.delete(monu.key)
    })

    // Route the frame through the post-FX composer when available. The
    // composer's OutputPass handles tone-map + sRGB conversion that the
    // direct renderer skips, so output color matches between the two
    // code paths even though tone-mapping is enabled on the renderer.
    if (postFX) {
      postFX.render()
    } else {
      renderer.render(scene, camera)
    }

    // First-frame ready signal — fires once everything is loaded AND we
    // have drawn at least one frame, so the UI loader has something to
    // dissolve into.
    if (!firstFrameRendered) {
      firstFrameRendered = true
      maybeFireReady()
    }

    // ── FPS-adaptive LOD measurement (rolling 60-frame windows) ────────
    fpsFrameCount++
    if (fpsFrameCount >= FPS_WINDOW) {
      const now = performance.now()
      const elapsedSec = (now - fpsWindowStart) / 1000
      const avgFps = elapsedSec > 0 ? fpsFrameCount / elapsedSec : 60
      fpsFrameCount = 0
      fpsWindowStart = now

      if (avgFps < FPS_DOWNGRADE_THRESHOLD) {
        downgradeStreak++
        upgradeStreak = 0
        if (!loQuality && downgradeStreak >= FPS_DOWNGRADE_STREAK) {
          setLoQuality(true)
        }
      } else if (avgFps > FPS_UPGRADE_THRESHOLD) {
        upgradeStreak++
        downgradeStreak = 0
        if (loQuality && upgradeStreak >= FPS_UPGRADE_STREAK) {
          setLoQuality(false)
        }
      } else {
        // In the dead-band: cool both streaks so we need fresh evidence
        // before flipping in either direction.
        downgradeStreak = 0
        upgradeStreak = 0
      }
    } else if (fpsWindowStart === 0) {
      fpsWindowStart = performance.now()
    }

    frameId = requestAnimationFrame(tick)
  }
  tick()

  const applyCarSkin = (key: keyof typeof SKINS) => {
    applySkin(carBuild, SKINS[key])
  }

  const fireTowerFireworks = () => {
    fireworks.fire()
    engine.playEasterEggSparkle()
    if (!triggeredEggs.has('horn_fireworks')) {
      triggeredEggs.add('horn_fireworks')
      callbacks.onEasterEgg?.('horn_fireworks')
    }
  }

  // ── Narrative arc setters (vision § 6 / Wave 3 C1+C2) ───────────────────
  const setIntroCameraOrbit = (angle: number | null): void => {
    introOrbitAngle = angle
  }
  const setIntroMode = (active: boolean): void => {
    introMode = active
  }
  const setSummit = (active: boolean): void => {
    // Idempotent — no-op when state already matches so we don't re-trigger
    // any single-shot effects added later (audio, particles, etc.).
    if (summit === active) return
    summit = active
  }

  // ── Time-of-day cycle (Wave 4 / D1 — vision § 13 egg 5) ────────────────
  // Snapshots whatever the lights/fog currently are (handles mid-lerp
  // taps cleanly — no jump back to the previous palette's start),
  // re-targets the palette destination values, resets todProgress so
  // the tick loop drives the interp over TOD_TRANSITION_SEC. Sky module
  // owns its own internal snapshot path. Idempotent on already-target.
  const setTimeOfDay = (tod: TimeOfDay): void => {
    if (tod === todTarget && todProgress >= 1) return
    const dst = SKY_PALETTES[tod]
    todFromAmbient.copy(ambient.color)
    todFromHemiSky.copy(hemi.color)
    todFromHemiGround.copy(hemi.groundColor)
    todFromFog.copy(fog.color)
    todFromSun = sun.intensity
    todTargetAmbient.set(dst.ambient)
    todTargetHemiSky.set(dst.hemiSky)
    todTargetHemiGround.set(dst.hemiGround)
    todTargetFog.set(dst.fog)
    todTargetSun = dst.sunIntensity
    todTarget = tod
    todProgress = 0
    sky.setTimeOfDay(tod)
  }
  const getTimeOfDay = (): TimeOfDay => (todProgress >= 1 ? todCurrent : todTarget)

  // Safety net: if NO assets were ever queued (e.g. textures finished
  // before the manager observed them, or there really are zero pending
  // loads), THREE.LoadingManager.onLoad will not fire on its own. Fire
  // assetsLoaded after the next macrotask so the loader can still dismiss.
  setTimeout(() => {
    if (!assetsLoaded) {
      assetsLoaded = true
      maybeFireReady()
    }
  }, 0)

  const dispose = () => {
    if (disposed) return
    disposed = true
    cancelAnimationFrame(frameId)
    window.removeEventListener('resize', onResize)
    if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
    postFX?.dispose()
    renderer.dispose()
    engine.dispose()
    skids.dispose()
    beacons.dispose()
    clouds.dispose()
    thoughtStream.dispose()
    motes.dispose()
    easterEggs.dispose()
    fireworks.dispose()
    npcs?.dispose()
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Points || obj instanceof THREE.Line) {
        obj.geometry.dispose()
        const m = (obj as THREE.Mesh).material
        if (Array.isArray(m)) m.forEach((x) => x.dispose())
        else if (m) (m as THREE.Material).dispose()
      } else if (obj instanceof THREE.Sprite) {
        // Stats-ring sprites carry CanvasTextures + SpriteMaterials —
        // dispose both so the page can be navigated away without leaking
        // GPU resources.
        obj.material.map?.dispose()
        obj.material.dispose()
      }
    })
  }

  return {
    engine,
    applyCarSkin,
    isLoQuality: () => loQuality,
    fireTowerFireworks,
    setIntroCameraOrbit,
    setIntroMode,
    setSummit,
    setTimeOfDay,
    getTimeOfDay,
    dispose,
  }
}
