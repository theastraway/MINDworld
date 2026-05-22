import * as THREE from 'three'

// Fireworks particle system that fires from the top of the MIND Tower
// when the user holds the horn (H key) for 5+ seconds. Triggered by the
// horn-fireworks easter egg in `controls/Keyboard.ts` via the
// `FireworksHandle.fire()` method.
//
// Architecture mirrors the Flames/Dust pattern — a single THREE.Points
// node with a preallocated buffer, additive blending, and a ring buffer
// of live particle indices. Three.PointsMaterial doesn't support
// per-particle color through the base material's `color` property, so
// we set `vertexColors: true` and write per-particle RGB into a packed
// Float32Array color attribute. That lets one Points node carry all
// three brand colors (red / gold / cream) in a single draw call.
//
// Per spec (vision § 13 egg 6): 12 emissive bursts, brand red + gold +
// cream, arcs upward + outward + gravity back down, ~3s lifetime per
// burst, sparkle SFX fires during the burst (caller's responsibility).

export interface FireworksHandle {
  /** The Three.js Points node the SceneRoot adds to the scene. */
  points: THREE.Points
  /**
   * Fire a single full firework burst from the top of the MIND Tower.
   * Spawns ~24 particles per burst across the 3 brand colors (red /
   * gold / cream). Repeated bursts add to the active ring buffer; if
   * called faster than the buffer can recycle, older particles get
   * recycled in-place.
   */
  fire: () => void
  /**
   * Advance live particles by `dt` seconds. Apply gravity to vertical
   * velocity, decay lifetimes, and write back to the position attribute.
   */
  advance: (dt: number) => void
  /** Release GPU resources. Called from SceneRoot.dispose(). */
  dispose: () => void
}

// MAX_PARTICLES caps GPU memory; one burst is ~24 particles, so 240 cap
// lets ~10 concurrent bursts overlap before recycling. Fewer than the
// 80-particle Flames system because fireworks fire much less often.
const MAX_PARTICLES = 240
const PARTICLES_PER_BURST = 24

// Brand palette: red / gold / cream. Each particle picks one at random
// at spawn. Stored as packed RGB floats to write straight into the
// color attribute.
const PALETTE: ReadonlyArray<readonly [number, number, number]> = [
  [0xF4 / 255, 0x3F / 255, 0x3F / 255], // brand red
  [0xFF / 255, 0xCC / 255, 0x4D / 255], // brand gold
  [0xFA / 255, 0xF1 / 255, 0xE0 / 255], // brand cream
]

// Tower-top burst origin per § 4 (78-unit obelisk; bursts spawn between
// y=78 and y=100, biased upward).
const BURST_ORIGIN_Y = 80

// Gravity in world units per second^2. Tuned so particles arc back down
// by lifetime end without falling below the tower base.
const GRAVITY = -8.5

export function createFireworks(): FireworksHandle {
  const geo = new THREE.BufferGeometry()
  const positions = new Float32Array(MAX_PARTICLES * 3)
  const colors = new Float32Array(MAX_PARTICLES * 3)
  const velocities = new Float32Array(MAX_PARTICLES * 3)
  const lifetimes = new Float32Array(MAX_PARTICLES)
  // Bury inactive particles below the world so they're invisible while
  // their lifetime is 0. Same trick the flame system uses.
  for (let i = 0; i < MAX_PARTICLES; i++) {
    positions[i * 3 + 1] = -1000
    lifetimes[i] = 0
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  const mat = new THREE.PointsMaterial({
    size: 1.1,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
  })

  const points = new THREE.Points(geo, mat)
  // Render after most scene objects so glow composites on top of bloom.
  points.renderOrder = 5

  let head = 0

  const spawnOne = () => {
    const i = head
    head = (head + 1) % MAX_PARTICLES

    // Outward velocity: random direction on the unit sphere, scaled so
    // the particle travels ~6-12 units before lifetime decay drops it
    // out of sight. Y velocity is biased UP so the burst pops skyward
    // before gravity pulls it back down.
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1) // uniform on sphere
    const speed = 4 + Math.random() * 5
    const sinPhi = Math.sin(phi)
    velocities[i * 3 + 0] = Math.cos(theta) * sinPhi * speed
    velocities[i * 3 + 1] = Math.cos(phi) * speed + 3 // upward bias
    velocities[i * 3 + 2] = Math.sin(theta) * sinPhi * speed

    // Origin at tower top with small jitter.
    positions[i * 3 + 0] = (Math.random() - 0.5) * 1.5
    positions[i * 3 + 1] = BURST_ORIGIN_Y + (Math.random() - 0.5) * 1.5
    positions[i * 3 + 2] = (Math.random() - 0.5) * 1.5

    // Pick a brand color.
    const palette = PALETTE[Math.floor(Math.random() * PALETTE.length)]
    colors[i * 3 + 0] = palette[0]
    colors[i * 3 + 1] = palette[1]
    colors[i * 3 + 2] = palette[2]

    // 2.5-3.0s lifetime so the burst fully decays within the spec's ~3s.
    lifetimes[i] = 2.5 + Math.random() * 0.5
  }

  const fire = () => {
    for (let i = 0; i < PARTICLES_PER_BURST; i++) spawnOne()
    geo.attributes.position.needsUpdate = true
    geo.attributes.color.needsUpdate = true
  }

  const advance = (dt: number) => {
    let dirty = false
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (lifetimes[i] <= 0) continue
      // Integrate velocity with gravity on the y component.
      velocities[i * 3 + 1] += GRAVITY * dt
      positions[i * 3 + 0] += velocities[i * 3 + 0] * dt
      positions[i * 3 + 1] += velocities[i * 3 + 1] * dt
      positions[i * 3 + 2] += velocities[i * 3 + 2] * dt
      lifetimes[i] -= dt
      if (lifetimes[i] <= 0) {
        positions[i * 3 + 1] = -1000
      }
      dirty = true
    }
    if (dirty) geo.attributes.position.needsUpdate = true
  }

  const dispose = () => {
    geo.dispose()
    mat.dispose()
  }

  return { points, fire, advance, dispose }
}
