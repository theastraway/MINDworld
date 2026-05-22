import * as THREE from 'three'

/**
 * Procedural starfield — 240 tiny bright points on a celestial sphere,
 * only visible at night.
 *
 * Each star has a fixed position on a sphere of radius 380 (just inside
 * the sky dome at 400) and a per-star phase used for a slow twinkle.
 * The starfield's master opacity is set externally via setOpacity() —
 * the Sky module already tracks the time-of-day transition and pushes
 * the right value each frame (1.0 at night, 0.0 at day, lerp dawn/dusk).
 *
 * Stars use additive blending so they don't fight the sky shader at
 * dusk (when both are partially visible during a cycle transition).
 */

const STAR_COUNT = 240
const STAR_RADIUS = 380
const STAR_SIZE_MIN = 0.25
const STAR_SIZE_MAX = 1.2

export interface StarfieldHandle {
  points: THREE.Points
  setOpacity: (opacity: number) => void
  update: (time: number) => void
  dispose: () => void
}

export function createStarfield(): StarfieldHandle {
  const positions = new Float32Array(STAR_COUNT * 3)
  const sizes = new Float32Array(STAR_COUNT)
  const phases = new Float32Array(STAR_COUNT)
  const baseAlphas = new Float32Array(STAR_COUNT)

  // Distribute stars on the upper hemisphere — stars below horizon are
  // hidden by the ground anyway, so don't waste vertices on them.
  for (let i = 0; i < STAR_COUNT; i++) {
    // Random direction biased to upper hemisphere via cos²(θ) sampling.
    const u = Math.random()
    const v = Math.random() * 0.85 + 0.05 // skip exact horizon + zenith
    const theta = u * Math.PI * 2
    const phi = Math.acos(v) // 0 ≈ zenith, π/2 ≈ horizon
    positions[i * 3 + 0] = STAR_RADIUS * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = STAR_RADIUS * Math.cos(phi)
    positions[i * 3 + 2] = STAR_RADIUS * Math.sin(phi) * Math.sin(theta)
    sizes[i] = STAR_SIZE_MIN + Math.random() * (STAR_SIZE_MAX - STAR_SIZE_MIN)
    phases[i] = Math.random() * Math.PI * 2
    baseAlphas[i] = 0.5 + Math.random() * 0.5
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

  // Use a single material with additive blending + a master opacity
  // that the Sky module pushes per frame via setOpacity.
  const material = new THREE.PointsMaterial({
    color: 0xfff8e8,
    size: (STAR_SIZE_MIN + STAR_SIZE_MAX) / 2,
    sizeAttenuation: false, // use fixed pixel size — stars look weird with attenuation at 380u
    transparent: true,
    opacity: 0, // start hidden (default time-of-day is dusk, near-night)
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  })

  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false

  // Slow twinkle: each star modulates its visible size on a per-star
  // sine. We rebuild positions on the same buffer (cheap) but vary
  // their per-frame size globally via material.size. To get per-star
  // twinkle without a custom shader, we modulate the master opacity
  // a bit — the eye reads it as twinkling.
  let externalOpacity = 0

  const setOpacity = (opacity: number) => {
    externalOpacity = Math.max(0, Math.min(1, opacity))
  }

  const update = (time: number) => {
    // Twinkle: small random walk in the master opacity, multiplied by
    // the external (time-of-day-driven) opacity.
    const twinkle = 1 + Math.sin(time * 1.4) * 0.06 + Math.sin(time * 3.1) * 0.04
    material.opacity = externalOpacity * twinkle
    // Hide the geometry entirely when daylight — saves a draw call.
    points.visible = externalOpacity > 0.01
  }

  const dispose = () => {
    geometry.dispose()
    material.dispose()
  }

  return { points, setOpacity, update, dispose }
}
