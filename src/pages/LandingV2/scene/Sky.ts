import * as THREE from 'three'
import {
  CYCLE_ORDER,
  SKY_PALETTES,
  type SkyPalette,
  type TimeOfDay,
} from './SkyPalettes'

// Gradient sky dome rendered via a shader on an inverted sphere.
// Three-stop gradient: bottom (horizon) / mid (atmospheric band) / top
// (zenith). Each phase of the day cycle (dawn / day / dusk / night)
// supplies its own triplet via the `SKY_PALETTES` table.
//
// Wave-4 / D1 adds the time-of-day cycle. The factory now returns a
// `SkyHandle` instead of a raw mesh — the SceneRoot calls
// `setTimeOfDay(tod)` on every T-key press and `update(dt)` once per
// frame so the shader uniforms lerp smoothly between palettes over
// `TRANSITION_DURATION_SEC` seconds.
//
// Default mounted phase is `'dusk'` — preserves the current production
// look. The dusk palette values (top 0x352630 / mid 0x8a5454 / bottom
// 0xe6c9a8) are pre-bumped vs. raw vision § 1 values to compensate for
// the ACES Filmic tone-map applied by the Wave-2 / B1 PostFX OutputPass.
// See `SkyPalettes.ts` for the full ACES-compensation note.

/** Time the sky takes to lerp from one palette to the next, in seconds. */
const TRANSITION_DURATION_SEC = 1.5

/** Default phase the sky mounts in. Matches current production. */
const DEFAULT_PHASE: TimeOfDay = 'dusk'

export interface SkyHandle {
  /** The inverted dome mesh — added to the scene by the caller. */
  mesh: THREE.Mesh
  /**
   * Swap to a new time-of-day phase. The shader uniforms lerp smoothly
   * over {@link TRANSITION_DURATION_SEC} seconds rather than snapping —
   * abrupt color shifts feel cheap and break the cinematic register.
   * Idempotent — calling with the current phase is a no-op.
   */
  setTimeOfDay: (tod: TimeOfDay) => void
  /**
   * Per-frame tick. The SceneRoot calls this with `dt` so the sky can
   * advance its lerp toward the target palette. Cheap — no work when
   * no transition is in flight.
   */
  update: (dt: number) => void
  /** The phase the sky is currently on (or transitioning toward). */
  getTimeOfDay: () => TimeOfDay
}

/**
 * Build the inverted sky-dome sphere + ShaderMaterial. The material
 * exposes `topColor` / `midColor` / `bottomColor` uniforms which the
 * cycle setter lerps between to transition phases.
 */
export function createSky(initial: TimeOfDay = DEFAULT_PHASE): SkyHandle {
  const startPalette = SKY_PALETTES[initial]

  const topColor = new THREE.Color(startPalette.top)
  const midColor = new THREE.Color(startPalette.mid)
  const bottomColor = new THREE.Color(startPalette.bottom)

  const skyGeo = new THREE.SphereGeometry(400, 32, 16)
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      topColor:    { value: topColor },
      midColor:    { value: midColor },
      bottomColor: { value: bottomColor },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 bottomColor;
      varying vec3 vWorldPosition;

      // Sun disk anchored low-NW — same direction as the DirectionalLight
      // sun in SceneRoot.ts (position (-30, 50, 20) → normalized direction).
      // The disk is a soft cream blob in dawn/dusk, bright white at day,
      // a moon-blue glow at night. Bloom in PostFX catches the emissive
      // peak and makes it feel like a real horizon star.
      void main() {
        vec3 dir = normalize(vWorldPosition);
        float h = dir.y;

        // Base sky gradient (unchanged behavior)
        float t1 = smoothstep(-0.1, 0.4, h);
        float t2 = smoothstep(0.3, 0.95, h);
        vec3 col = mix(bottomColor, midColor, t1);
        col = mix(col, topColor, t2);

        // Sun: dot product against the sun direction, sharpen with a power
        // curve so the disk has a hot core + soft halo.
        vec3 sunDir = normalize(vec3(-0.5, 0.78, 0.36));
        float sunDot = max(0.0, dot(dir, sunDir));
        float sunCore = pow(sunDot, 220.0); // hot core
        float sunHalo = pow(sunDot, 18.0) * 0.45; // soft surrounding glow
        // Tint the sun toward the warm side of the palette — picks up the
        // current time-of-day flavor automatically by mixing midColor.
        vec3 sunTint = mix(vec3(1.0, 0.95, 0.85), midColor, 0.35);
        col += sunTint * (sunCore * 1.4 + sunHalo);

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  })
  const mesh = new THREE.Mesh(skyGeo, skyMat)

  // ── Transition state ────────────────────────────────────────────────
  // `fromXxx` snapshots the sky's color at the moment a transition is
  // requested; `targetXxx` are the destination palette colors. `progress`
  // marches 0 → 1 over TRANSITION_DURATION_SEC; when it lands at 1 the
  // transition is "settled" and `update()` does nothing.
  let currentPhase: TimeOfDay = initial
  let targetPhase: TimeOfDay = initial

  const fromTop = topColor.clone()
  const fromMid = midColor.clone()
  const fromBottom = bottomColor.clone()
  const targetTop = topColor.clone()
  const targetMid = midColor.clone()
  const targetBottom = bottomColor.clone()
  let progress = 1 // settled

  const setTimeOfDay = (tod: TimeOfDay): void => {
    if (tod === targetPhase && progress >= 1) return
    // Snapshot the current rendered colors so the lerp starts from
    // wherever we actually are — handles mid-transition cycle taps
    // smoothly (no jump back to the previous target's start).
    fromTop.copy(topColor)
    fromMid.copy(midColor)
    fromBottom.copy(bottomColor)
    const dst: SkyPalette = SKY_PALETTES[tod]
    targetTop.set(dst.top)
    targetMid.set(dst.mid)
    targetBottom.set(dst.bottom)
    targetPhase = tod
    progress = 0
  }

  const update = (dt: number): void => {
    if (progress >= 1) return
    progress += dt / TRANSITION_DURATION_SEC
    if (progress >= 1) {
      progress = 1
      topColor.copy(targetTop)
      midColor.copy(targetMid)
      bottomColor.copy(targetBottom)
      currentPhase = targetPhase
      return
    }
    // Linear RGB lerp — perceptually acceptable for sky tones given
    // ACES tone-mapping happens downstream and softens any banding.
    topColor.copy(fromTop).lerp(targetTop, progress)
    midColor.copy(fromMid).lerp(targetMid, progress)
    bottomColor.copy(fromBottom).lerp(targetBottom, progress)
  }

  const getTimeOfDay = (): TimeOfDay => (progress >= 1 ? currentPhase : targetPhase)

  return { mesh, setTimeOfDay, update, getTimeOfDay }
}

// Re-export the cycle helpers so callers can import them all from this
// module without grabbing two different files.
export { CYCLE_ORDER, SKY_PALETTES, type TimeOfDay, type SkyPalette }
