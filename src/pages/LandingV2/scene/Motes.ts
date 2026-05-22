import * as THREE from 'three'

/**
 * Atmospheric dust motes — soft cream points drifting slowly in the lower
 * air across the world. Catches the sun direction (additive blending) so
 * the air itself reads as having mass + light + presence.
 *
 * Reference: Bruno Simon's portfolio uses a similar trick to make the
 * scene feel "inside something" rather than "on a flat plane."
 *
 * 80 motes total, scattered radius 0–95 (within the mountain ring),
 * altitude 1.5–14. Slow per-mote drift on world X with a sine bob on Y.
 * Capacity is fixed, no spawning/recycling — they're eternal residents.
 */

const MOTE_COUNT = 80
const MOTE_RADIUS = 95
const MOTE_ALTITUDE_MIN = 1.5
const MOTE_ALTITUDE_MAX = 14
const MOTE_DRIFT_X = 0.45 // world units / sec, base wind
const MOTE_BOB_AMPLITUDE = 0.6
const MOTE_SIZE = 0.55

export interface MotesHandle {
  points: THREE.Points
  update: (dt: number, time: number) => void
  dispose: () => void
}

export function createMotes(): MotesHandle {
  const positions = new Float32Array(MOTE_COUNT * 3)
  // Per-mote constants packed so update() can read them without allocation.
  const phases = new Float32Array(MOTE_COUNT)
  const bobs = new Float32Array(MOTE_COUNT)
  const altitudes = new Float32Array(MOTE_COUNT)
  const driftSpeed = new Float32Array(MOTE_COUNT)

  for (let i = 0; i < MOTE_COUNT; i++) {
    const a = Math.random() * Math.PI * 2
    const r = Math.random() * MOTE_RADIUS
    positions[i * 3 + 0] = Math.cos(a) * r
    altitudes[i] = MOTE_ALTITUDE_MIN + Math.random() * (MOTE_ALTITUDE_MAX - MOTE_ALTITUDE_MIN)
    positions[i * 3 + 1] = altitudes[i]
    positions[i * 3 + 2] = Math.sin(a) * r
    phases[i] = Math.random() * Math.PI * 2
    bobs[i] = MOTE_BOB_AMPLITUDE * (0.5 + Math.random() * 0.5)
    driftSpeed[i] = MOTE_DRIFT_X * (0.6 + Math.random() * 0.8)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

  const material = new THREE.PointsMaterial({
    color: 0xfff0d0,
    size: MOTE_SIZE,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  })

  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false

  const update = (dt: number, time: number) => {
    for (let i = 0; i < MOTE_COUNT; i++) {
      // Drift on world +X; wrap when crossing the radius boundary so the
      // population stays steady. Cheap modulo via shift.
      let x = positions[i * 3 + 0] + driftSpeed[i] * dt
      if (x > MOTE_RADIUS) x = -MOTE_RADIUS
      positions[i * 3 + 0] = x
      // Y = baseline altitude + slow sine bob (per-mote phase + bob amp).
      positions[i * 3 + 1] =
        altitudes[i] + Math.sin(time * 0.4 + phases[i]) * bobs[i]
    }
    geometry.attributes.position.needsUpdate = true
  }

  const dispose = () => {
    geometry.dispose()
    material.dispose()
  }

  return { points, update, dispose }
}
